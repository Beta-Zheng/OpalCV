export interface EncryptedEnvelope {
  v: 1;
  alg: "AES-GCM";
  kdf: "PBKDF2";
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("当前环境不支持 Web Crypto API（crypto.subtle）");
  }
  return subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    usage
  );
}

export function parseEncryptedPayload(value: string): EncryptedEnvelope | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<EncryptedEnvelope>;
    if (
      parsed &&
      parsed.v === 1 &&
      parsed.alg === "AES-GCM" &&
      typeof parsed.salt === "string" &&
      parsed.salt.length > 0 &&
      typeof parsed.iv === "string" &&
      parsed.iv.length > 0 &&
      typeof parsed.ct === "string" &&
      parsed.ct.length > 0
    ) {
      return {
        v: 1,
        alg: "AES-GCM",
        kdf: parsed.kdf === "PBKDF2" ? "PBKDF2" : "PBKDF2",
        iter:
          typeof parsed.iter === "number" &&
          Number.isFinite(parsed.iter) &&
          parsed.iter > 0
            ? parsed.iter
            : PBKDF2_ITERATIONS,
        salt: parsed.salt,
        iv: parsed.iv,
        ct: parsed.ct,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function isEncryptedPayload(value: string | null | undefined): boolean {
  if (!value) return false;
  return parseEncryptedPayload(value) !== null;
}

export async function encryptText(
  plaintext: string,
  passphrase: string
): Promise<string> {
  if (!passphrase) {
    throw new Error("加密密码不能为空");
  }
  const subtle = getSubtle();
  const salt = new Uint8Array(new ArrayBuffer(SALT_BYTES));
  globalThis.crypto.getRandomValues(salt);
  const iv = new Uint8Array(new ArrayBuffer(IV_BYTES));
  globalThis.crypto.getRandomValues(iv);

  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS, [
    "encrypt",
  ]);
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  const envelope: EncryptedEnvelope = {
    v: 1,
    alg: "AES-GCM",
    kdf: "PBKDF2",
    iter: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(cipherBuffer)),
  };
  return JSON.stringify(envelope);
}

export async function decryptText(
  payload: string,
  passphrase: string
): Promise<string> {
  if (!passphrase) {
    throw new Error("解密密码不能为空");
  }
  const envelope = parseEncryptedPayload(payload);
  if (!envelope) {
    throw new Error("加密数据格式无效或已损坏");
  }

  let saltBytes: Uint8Array;
  let ivBytes: Uint8Array;
  let ctBytes: Uint8Array;
  try {
    saltBytes = base64ToBytes(envelope.salt);
    ivBytes = base64ToBytes(envelope.iv);
    ctBytes = base64ToBytes(envelope.ct);
  } catch {
    throw new Error("加密数据解码失败，内容可能已损坏");
  }

  const salt = new Uint8Array(new ArrayBuffer(saltBytes.byteLength));
  salt.set(saltBytes);
  const iv = new Uint8Array(new ArrayBuffer(ivBytes.byteLength));
  iv.set(ivBytes);
  const ct = new Uint8Array(new ArrayBuffer(ctBytes.byteLength));
  ct.set(ctBytes);

  const subtle = getSubtle();
  const key = await deriveAesKey(passphrase, salt, envelope.iter, ["decrypt"]);
  try {
    const plainBuffer = await subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(plainBuffer);
  } catch {
    throw new Error("解密失败：密码错误或数据已被篡改");
  }
}

/* ---------------- 会话级主口令（仅存内存，不落盘） ---------------- */

let sessionPassphrase: string | null = null;

export function getSessionPassphrase(): string | null {
  return sessionPassphrase;
}

export function setSessionPassphrase(passphrase: string | null): void {
  sessionPassphrase = passphrase ? passphrase : null;
}

export function clearSessionPassphrase(): void {
  sessionPassphrase = null;
}

/**
 * 解析模型 API Key：
 * - 明文或空值直接返回（保持向后兼容）
 * - 密文则使用显式口令或内存会话口令解密；未解锁时抛出明确错误，绝不把密文发往外部服务
 */
export async function resolveApiKey(
  apiKey: string | undefined | null,
  passphrase?: string | null
): Promise<string> {
  if (!apiKey) return "";
  if (!isEncryptedPayload(apiKey)) return apiKey;
  const activePassphrase = passphrase ?? sessionPassphrase;
  if (!activePassphrase) {
    throw new Error(
      "API Key 已使用主密码加密，请先前往「模型与隐私」输入主密码解锁后再调用模型"
    );
  }
  return decryptText(apiKey, activePassphrase);
}

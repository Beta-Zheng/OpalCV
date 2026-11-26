import { describe, expect, it, vi } from "vitest";
import {
  clearSessionPassphrase,
  decryptText,
  encryptText,
  isEncryptedPayload,
  parseEncryptedPayload,
  resolveApiKey,
  setSessionPassphrase,
} from "../crypto";
import { chatOpenAI } from "../ai";
import {
  downloadBackupFromGist,
  downloadBackupFromWebDav,
  listBackupGists,
  uploadBackupToGist,
  uploadBackupToWebDav,
} from "../sync";
import { testBackup } from "./fixtures";

describe("crypto (Web Crypto PBKDF2 + AES-GCM)", () => {
  it("encrypts and decrypts plaintext round-trip including Unicode", async () => {
    const plaintext = "sk-proj-秘密密钥-1234567890-🚀";
    const passphrase = "correct-horse-battery-staple";

    const encrypted = await encryptText(plaintext, passphrase);
    expect(encrypted).not.toContain(plaintext);
    expect(isEncryptedPayload(encrypted)).toBe(true);

    const envelope = parseEncryptedPayload(encrypted);
    expect(envelope).not.toBeNull();
    expect(envelope?.v).toBe(1);
    expect(envelope?.alg).toBe("AES-GCM");
    expect(envelope?.salt).toBeTruthy();
    expect(envelope?.iv).toBeTruthy();
    expect(envelope?.ct).toBeTruthy();

    const decrypted = await decryptText(encrypted, passphrase);
    expect(decrypted).toBe(plaintext);
  });

  it("produces distinct ciphertexts for the same plaintext and passphrase", async () => {
    const a = await encryptText("sk-same", "pass");
    const b = await encryptText("sk-same", "pass");
    expect(a).not.toBe(b);
    expect(await decryptText(a, "pass")).toBe("sk-same");
    expect(await decryptText(b, "pass")).toBe("sk-same");
  });

  it("throws a clear error on wrong passphrase or tampered payload", async () => {
    const encrypted = await encryptText("sk-secret-key", "right-pass");

    await expect(decryptText(encrypted, "wrong-pass")).rejects.toThrow(
      /解密失败|密码错误/
    );

    const parsed = JSON.parse(encrypted) as {
      v: number;
      alg: string;
      salt: string;
      iv: string;
      ct: string;
    };
    const tampered = JSON.stringify({
      ...parsed,
      ct: parsed.ct.slice(0, -4) + "AAAA",
    });
    await expect(decryptText(tampered, "right-pass")).rejects.toThrow(
      /解密失败|篡改/
    );
  });

  it("keeps legacy plaintext API keys backward-compatible via isEncryptedPayload", () => {
    expect(isEncryptedPayload("")).toBe(false);
    expect(isEncryptedPayload(null)).toBe(false);
    expect(isEncryptedPayload(undefined)).toBe(false);
    expect(isEncryptedPayload("sk-1234567890abcdef")).toBe(false);
    expect(isEncryptedPayload("{not-valid-json")).toBe(false);
    expect(isEncryptedPayload(JSON.stringify({ v: 1, alg: "AES-GCM" }))).toBe(
      false
    );
  });
});

describe("sync (WebDAV & GitHub Private Gist)", () => {
  it("uploads encrypted backup to WebDAV with Basic Auth and restores via parseBackup", async () => {
    const backup = testBackup();
    backup.models = backup.models.map((m, idx) =>
      idx === 0 ? { ...m, api_key: "sk-local-should-not-export" } : m
    );

    let storedBody = "";
    const mockFetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        expect(url).toBe("https://dav.example.com/backups/cv.enc.json");
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe(
          `Basic ${btoa("alice:webdav-pass")}`
        );

        if (init?.method === "PUT") {
          storedBody = String(init.body ?? "");
          return new Response(null, { status: 201 });
        }
        if (init?.method === "GET") {
          return new Response(storedBody, { status: 200 });
        }
        return new Response(null, { status: 405 });
      }
    );

    const uploadRes = await uploadBackupToWebDav(
      {
        url: "https://dav.example.com/backups/cv.enc.json",
        username: "alice",
        password: "webdav-pass",
      },
      backup,
      "sync-pass-123",
      mockFetch as unknown as typeof fetch
    );

    expect(uploadRes.target).toBe("webdav");
    expect(uploadRes.bytes).toBeGreaterThan(0);
    expect(isEncryptedPayload(storedBody)).toBe(true);
    expect(storedBody).not.toContain("webdav-pass");
    expect(storedBody).not.toContain("sync-pass-123");
    expect(storedBody).not.toContain("sk-local-should-not-export");

    const downloadRes = await downloadBackupFromWebDav(
      {
        url: "https://dav.example.com/backups/cv.enc.json",
        username: "alice",
        password: "webdav-pass",
      },
      "sync-pass-123",
      backup.models,
      mockFetch as unknown as typeof fetch
    );

    expect(downloadRes.data.resumes).toHaveLength(1);
    expect(downloadRes.data.resumes[0].id).toBe("resume_test");
    expect(downloadRes.raw).not.toContain("webdav-pass");
    expect(downloadRes.raw).not.toContain("sync-pass-123");

    await expect(
      downloadBackupFromWebDav(
        {
          url: "https://dav.example.com/backups/cv.enc.json",
          username: "alice",
          password: "webdav-pass",
        },
        "wrong-sync-pass",
        backup.models,
        mockFetch as unknown as typeof fetch
      )
    ).rejects.toThrow(/解密失败|密码错误/);
  });

  it("creates (POST), updates (PATCH), and downloads (GET) encrypted GitHub Private Gist", async () => {
    const backup = testBackup();
    let gistContent = "";
    const calls: Array<{ method: string; url: string; body?: string }> = [];

    const mockFetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? String(init.body) : undefined;
        calls.push({ method, url, body });

        const headers = new Headers(init?.headers);
        if (url.startsWith("https://api.github.com/")) {
          expect(headers.get("Authorization")).toBe("Bearer ghp_secret_token");
        } else {
          // gist.githubusercontent.com rejects Authorization in CORS preflight
          expect(headers.get("Authorization")).toBeNull();
        }

        if (method === "POST" && url === "https://api.github.com/gists") {
          const parsed = JSON.parse(body ?? "{}") as {
            public: boolean;
            files: Record<string, { content: string }>;
          };
          expect(parsed.public).toBe(false);
          gistContent = parsed.files["opalcv-backup.enc.json"].content;
          return new Response(
            JSON.stringify({
              id: "gist_abc123",
              html_url: "https://gist.github.com/gist_abc123",
            }),
            { status: 201 }
          );
        }

        if (
          method === "PATCH" &&
          url === "https://api.github.com/gists/gist_abc123"
        ) {
          const parsed = JSON.parse(body ?? "{}") as {
            files: Record<string, { content: string }>;
          };
          gistContent = parsed.files["opalcv-backup.enc.json"].content;
          return new Response(
            JSON.stringify({
              id: "gist_abc123",
              html_url: "https://gist.github.com/gist_abc123",
            }),
            { status: 200 }
          );
        }

        if (
          method === "GET" &&
          url === "https://api.github.com/gists/gist_abc123"
        ) {
          return new Response(
            JSON.stringify({
              id: "gist_abc123",
              files: {
                "opalcv-backup.enc.json": {
                  filename: "opalcv-backup.enc.json",
                  truncated: true,
                  raw_url: "https://gist.githubusercontent.com/raw/gist_abc123",
                },
              },
            }),
            { status: 200 }
          );
        }

        if (
          method === "GET" &&
          url === "https://gist.githubusercontent.com/raw/gist_abc123"
        ) {
          return new Response(gistContent, { status: 200 });
        }

        return new Response(null, { status: 404 });
      }
    );

    const created = await uploadBackupToGist(
      { token: "ghp_secret_token" },
      backup,
      "gist-pass",
      mockFetch as unknown as typeof fetch
    );
    expect(created.gistId).toBe("gist_abc123");
    expect(calls[0].method).toBe("POST");
    expect(isEncryptedPayload(gistContent)).toBe(true);
    expect(gistContent).not.toContain("ghp_secret_token");
    expect(gistContent).not.toContain("gist-pass");

    const updated = await uploadBackupToGist(
      { token: "ghp_secret_token", gistId: created.gistId },
      backup,
      "gist-pass",
      mockFetch as unknown as typeof fetch
    );
    expect(updated.gistId).toBe("gist_abc123");
    expect(calls[1].method).toBe("PATCH");

    const downloaded = await downloadBackupFromGist(
      {
        token: "ghp_secret_token",
        gistId: "https://gist.github.com/Beta-Zheng/gist_abc123",
      },
      "gist-pass",
      backup.models,
      mockFetch as unknown as typeof fetch
    );
    expect(downloaded.gistId).toBe("gist_abc123");
    expect(downloaded.data.resumes[0].title).toBe("测试简历");
    expect(downloaded.raw).not.toContain("ghp_secret_token");
    expect(downloaded.raw).not.toContain("gist-pass");
  });

  it("decrypts encrypted API key in chatOpenAI when unlocked and blocks ciphertext transmission when locked", async () => {
    const encryptedKey = await encryptText("sk-real-secret-key", "master-pass");
    const provider = {
      id: "m1",
      name: "DeepSeek",
      type: "external" as const,
      protocol: "openai_compatible" as const,
      base_url: "https://api.deepseek.com/v1",
      api_key: encryptedKey,
      model_name: "deepseek-chat",
      temperature: 0.3,
      max_tokens: 1024,
      timeout_ms: 5000,
      enabled: true,
      created_at: new Date().toISOString(),
    };

    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200 }
      )
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      clearSessionPassphrase();
      await expect(resolveApiKey(encryptedKey)).rejects.toThrow("解锁");
      await expect(
        chatOpenAI(provider, [{ role: "user", content: "hi" }])
      ).rejects.toThrow("解锁");
      expect(fetchSpy).not.toHaveBeenCalled();

      setSessionPassphrase("master-pass");
      const out = await chatOpenAI(provider, [{ role: "user", content: "hi" }]);
      expect(out).toBe("ok");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = (fetchSpy.mock.calls[0] as unknown[])[1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer sk-real-secret-key"
      );
    } finally {
      clearSessionPassphrase();
      globalThis.fetch = originalFetch;
    }
  });

  it("discovers existing OpalCV encrypted backup gists via listBackupGists", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            id: "gist_unrelated",
            description: "random snippet",
            public: true,
            updated_at: "2026-11-20T00:00:00Z",
            files: { "notes.md": { filename: "notes.md" } },
          },
          {
            id: "gist_opal_1",
            description: "OpalCV Encrypted Backup",
            public: false,
            updated_at: "2026-11-26T05:00:00Z",
            files: { "opalcv-backup.enc.json": { filename: "opalcv-backup.enc.json" } },
          },
        ]),
        { status: 200 }
      )
    );
    const list = await listBackupGists("ghp_test", mockFetch as unknown as typeof fetch);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "gist_opal_1",
      filename: "opalcv-backup.enc.json",
      isPublic: false,
    });
  });
});

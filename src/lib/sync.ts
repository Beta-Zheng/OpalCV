import type { ModelProvider } from "../types";
import { createBackup, parseBackup, type BackupData } from "./backup";
import { decryptText, encryptText } from "./crypto";

export interface WebDavConfig {
  url: string;
  username?: string;
  password?: string;
}

export interface GistConfig {
  token: string;
  gistId?: string;
  filename?: string;
  description?: string;
}

export interface SyncUploadResult {
  target: "webdav" | "gist";
  bytes: number;
  timestamp: string;
  gistId?: string;
  htmlUrl?: string;
  filename?: string;
}

export interface SyncDownloadResult {
  target: "webdav" | "gist";
  raw: string;
  data: BackupData;
  gistId?: string;
  filename?: string;
}

export type FetchLike = typeof fetch;

const DEFAULT_GIST_FILENAME = "opalcv-backup.enc.json";
const DEFAULT_GIST_DESCRIPTION = "OpalCV Encrypted Backup";
const GITHUB_API_BASE = "https://api.github.com/gists";

/** 支持直接粘贴 Gist ID 或完整的 gist.github.com URL */
export function normalizeGistId(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      // 形如 /<user>/<id> 或 /<id> 或 /<user>/<id>/raw/...
      if (parts.length >= 2 && parts[1] !== "raw") return parts[1];
      if (parts.length >= 1) return parts[0];
    } catch {
      return trimmed;
    }
  }
  return trimmed.replace(/^\/+|\/+$/g, "");
}

function validateHttpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("请填写 WebDAV 目标地址");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("WebDAV 地址格式无效，请填写完整的 http(s) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("WebDAV 地址仅支持 http 或 https 协议");
  }
  return parsed.toString();
}

function encodeBasicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `Basic ${btoa(binary)}`;
}

function buildWebDavHeaders(
  config: WebDavConfig,
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (config.username || config.password) {
    headers.Authorization = encodeBasicAuth(
      config.username ?? "",
      config.password ?? ""
    );
  }
  return headers;
}

export async function buildEncryptedBackupPayload(
  data: BackupData,
  syncPassphrase: string
): Promise<string> {
  if (!syncPassphrase) {
    throw new Error("请设置同步加密密码");
  }
  const backupJson = JSON.stringify(createBackup(data));
  return encryptText(backupJson, syncPassphrase);
}

export async function parseEncryptedBackupPayload(
  encryptedPayload: string,
  syncPassphrase: string,
  currentModels: ModelProvider[],
  mode: "restore" | "hydrate" = "restore"
): Promise<{ raw: string; data: BackupData }> {
  if (!syncPassphrase) {
    throw new Error("请输入同步解密密码");
  }
  const raw = await decryptText(encryptedPayload, syncPassphrase);
  let data: BackupData;
  try {
    data = parseBackup(raw, currentModels, mode);
  } catch {
    throw new Error("解密成功，但备份内容校验失败或格式不兼容");
  }
  return { raw, data };
}

export async function uploadBackupToWebDav(
  config: WebDavConfig,
  data: BackupData,
  syncPassphrase: string,
  fetchImpl: FetchLike = fetch
): Promise<SyncUploadResult> {
  const url = validateHttpUrl(config.url);
  const encryptedPayload = await buildEncryptedBackupPayload(
    data,
    syncPassphrase
  );
  const res = await fetchImpl(url, {
    method: "PUT",
    headers: buildWebDavHeaders(config, {
      "Content-Type": "application/json; charset=utf-8",
    }),
    body: encryptedPayload,
  });
  if (!res.ok) {
    throw new Error(`WebDAV 上传失败（HTTP ${res.status}）`);
  }
  return {
    target: "webdav",
    bytes: encryptedPayload.length,
    timestamp: new Date().toISOString(),
  };
}

export async function downloadBackupFromWebDav(
  config: WebDavConfig,
  syncPassphrase: string,
  currentModels: ModelProvider[],
  fetchImpl: FetchLike = fetch
): Promise<SyncDownloadResult> {
  const url = validateHttpUrl(config.url);
  const res = await fetchImpl(url, {
    method: "GET",
    headers: buildWebDavHeaders(config),
  });
  if (!res.ok) {
    throw new Error(`WebDAV 下载失败（HTTP ${res.status}）`);
  }
  const encryptedPayload = await res.text();
  const { raw, data } = await parseEncryptedBackupPayload(
    encryptedPayload,
    syncPassphrase,
    currentModels
  );
  return {
    target: "webdav",
    raw,
    data,
  };
}

export async function uploadBackupToGist(
  config: GistConfig,
  data: BackupData,
  syncPassphrase: string,
  fetchImpl: FetchLike = fetch
): Promise<SyncUploadResult> {
  const token = config.token.trim();
  if (!token) {
    throw new Error("请填写 GitHub Personal Access Token");
  }
  const filename = config.filename?.trim() || DEFAULT_GIST_FILENAME;
  const gistId = normalizeGistId(config.gistId);
  const encryptedPayload = await buildEncryptedBackupPayload(
    data,
    syncPassphrase
  );

  const endpoint = gistId
    ? `${GITHUB_API_BASE}/${encodeURIComponent(gistId)}`
    : GITHUB_API_BASE;
  const method = gistId ? "PATCH" : "POST";
  const body = gistId
    ? {
        description: config.description || DEFAULT_GIST_DESCRIPTION,
        files: {
          [filename]: { content: encryptedPayload },
        },
      }
    : {
        description: config.description || DEFAULT_GIST_DESCRIPTION,
        public: false,
        files: {
          [filename]: { content: encryptedPayload },
        },
      };

  const res = await fetchImpl(endpoint, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GitHub Gist 上传失败（HTTP ${res.status}）`);
  }
  const json = (await res.json()) as { id?: string; html_url?: string };
  if (!json.id) {
    throw new Error("GitHub Gist 响应缺少 Gist ID");
  }
  return {
    target: "gist",
    gistId: json.id,
    htmlUrl: json.html_url,
    filename,
    bytes: encryptedPayload.length,
    timestamp: new Date().toISOString(),
  };
}

interface GistFilePayload {
  filename?: string;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

export async function downloadBackupFromGist(
  config: GistConfig,
  syncPassphrase: string,
  currentModels: ModelProvider[],
  fetchImpl: FetchLike = fetch
): Promise<SyncDownloadResult> {
  const token = config.token.trim();
  const gistId = normalizeGistId(config.gistId);
  if (!token) {
    throw new Error("请填写 GitHub Personal Access Token");
  }
  if (!gistId) {
    throw new Error("请填写要恢复的 Gist ID");
  }
  const res = await fetchImpl(
    `${GITHUB_API_BASE}/${encodeURIComponent(gistId)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
      },
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub Gist 下载失败（HTTP ${res.status}）`);
  }
  const json = (await res.json()) as {
    id?: string;
    files?: Record<string, GistFilePayload>;
  };
  const files = json.files ?? {};
  const fileKeys = Object.keys(files);
  const preferredName = config.filename?.trim() || DEFAULT_GIST_FILENAME;
  const targetFile =
    files[preferredName] ??
    files[DEFAULT_GIST_FILENAME] ??
    (fileKeys.length === 1 ? files[fileKeys[0]] : undefined);
  if (!targetFile) {
    throw new Error(
      fileKeys.length > 1
        ? `Gist 中包含多个文件，未找到匹配的备份文件（${preferredName}）`
        : "Gist 中未找到备份文件"
    );
  }
  let encryptedPayload = targetFile.content ?? "";
  if (targetFile.truncated && targetFile.raw_url) {
    // gist.githubusercontent.com 拒绝携带 Authorization 的 CORS 预检（会触发 Failed to fetch），
    // 而 raw_url 本身已包含不可猜测的 Gist ID 与 commit SHA，不带自定义头即可直接简单 GET 拉取。
    let rawRes: Response;
    try {
      rawRes = await fetchImpl(targetFile.raw_url, { method: "GET" });
    } catch {
      throw new Error(
        "无法下载 Gist 原始备份文件（网络或浏览器 CORS 拦截），请检查网络或代理后重试"
      );
    }
    if (!rawRes.ok && (rawRes.status === 401 || rawRes.status === 403)) {
      rawRes = await fetchImpl(targetFile.raw_url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (!rawRes.ok) {
      throw new Error(`Gist 原始文件下载失败（HTTP ${rawRes.status}）`);
    }
    encryptedPayload = await rawRes.text();
  }
  if (!encryptedPayload) {
    throw new Error("Gist 备份文件内容为空");
  }
  const { raw, data } = await parseEncryptedBackupPayload(
    encryptedPayload,
    syncPassphrase,
    currentModels
  );
  return {
    target: "gist",
    raw,
    data,
    gistId: json.id ?? gistId,
    filename: targetFile.filename ?? preferredName,
  };
}

export interface DiscoveredGist {
  id: string;
  filename: string;
  description: string;
  updatedAt: string;
  isPublic: boolean;
}

/** 根据 Token 自动查找账号下已有的 OpalCV 加密备份 Gist（新设备免手动复制 Gist ID） */
export async function listBackupGists(
  rawToken: string,
  fetchImpl: FetchLike = fetch
): Promise<DiscoveredGist[]> {
  const token = rawToken.trim();
  if (!token) {
    throw new Error("请先填写 GitHub Personal Access Token");
  }
  const res = await fetchImpl(`${GITHUB_API_BASE}?per_page=30`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`查询 GitHub Gist 列表失败（HTTP ${res.status}）`);
  }
  const items = (await res.json()) as Array<{
    id?: string;
    description?: string;
    public?: boolean;
    updated_at?: string;
    files?: Record<string, { filename?: string }>;
  }>;
  if (!Array.isArray(items)) return [];

  const matched: DiscoveredGist[] = [];
  for (const item of items) {
    if (!item?.id || !item.files) continue;
    const filenames = Object.keys(item.files);
    const hit =
      filenames.find((n) => n === DEFAULT_GIST_FILENAME) ??
      filenames.find((n) => n.endsWith(".enc.json")) ??
      ((item.description ?? "").toLowerCase().includes("opalcv")
        ? filenames[0]
        : undefined);
    if (!hit) continue;
    matched.push({
      id: item.id,
      filename: item.files[hit]?.filename || hit,
      description: item.description || DEFAULT_GIST_DESCRIPTION,
      updatedAt: item.updated_at || "",
      isPublic: !!item.public,
    });
  }
  return matched;
}

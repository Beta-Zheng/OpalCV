import { useEffect, useState } from "react";
import type {
  ModelProvider,
  ModelProtocol,
  ModelType,
  RouteStrategy,
} from "../types";
import { cx, nowISO, uid } from "../lib/utils";
import { testProvider, type ProviderDiagnosticCode } from "../lib/ai";
import { decryptText, encryptText, isEncryptedPayload } from "../lib/crypto";
import { useAppSlice } from "../lib/store";
import { Btn, Confirm, Modal, ModalHeader, Toggle } from "../components/ui";
import {
  IconAlert,
  IconCheck,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconLock,
  IconPlus,
  IconShield,
  IconTrash,
  IconZap,
} from "../components/icons";

// Session-only memory for the optional master passphrase; never persisted to storage.
let sessionMasterPassphrase: string | null = null;

const TYPE_META: Record<ModelType, { label: string; cls: string }> = {
  local: { label: "本地", cls: "bg-brand-600 text-white" },
  external: { label: "外部", cls: "bg-seal-500 text-white" },
  private: { label: "私有", cls: "bg-ink-800 text-paper-50" },
};

interface TestState {
  running?: boolean;
  ok?: boolean;
  latency?: number;
  message?: string;
  code?: ProviderDiagnosticCode;
  hint?: string;
  availableModels?: string[];
}

const DIAG_BADGE: Partial<Record<ProviderDiagnosticCode, string>> = {
  cors_or_network: "CORS / 网络拦截",
  auth_error: "鉴权失败",
  model_not_found: "模型未找到",
  timeout: "连接超时",
  http_error: "HTTP 异常",
  unknown: "连接失败",
};

function ModelForm({
  initial,
  sessionPassphrase,
  onClose,
}: {
  initial: ModelProvider | null;
  sessionPassphrase: string | null;
  onClose: () => void;
}) {
  const { saveModel, toast } = useAppSlice("saveModel", "toast");
  const initialIsEncrypted = isEncryptedPayload(initial?.api_key);
  const [m, setM] = useState<ModelProvider>(() => {
    const base = initial ?? {
      id: uid("model"),
      name: "",
      type: "local",
      protocol: "ollama",
      base_url: "http://localhost:11434",
      api_key: "",
      model_name: "",
      temperature: 0.3,
      max_tokens: 2048,
      timeout_ms: 30000,
      enabled: true,
      created_at: nowISO(),
    };
    return initialIsEncrypted ? { ...base, api_key: "" } : base;
  });
  const [showKey, setShowKey] = useState(false);
  const [keyModified, setKeyModified] = useState(!initialIsEncrypted);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<ModelProvider>) =>
    setM((v) => ({ ...v, ...patch }));

  useEffect(() => {
    let active = true;
    if (!initialIsEncrypted || !initial?.api_key || !sessionPassphrase) {
      return () => {
        active = false;
      };
    }
    void decryptText(initial.api_key, sessionPassphrase)
      .then((plain) => {
        if (!active) return;
        setM((v) => ({ ...v, api_key: plain }));
        setKeyModified(true);
      })
      .catch(() => {
        if (active) setKeyModified(false);
      });
    return () => {
      active = false;
    };
  }, [initial?.api_key, initialIsEncrypted, sessionPassphrase]);

  const submit = async () => {
    if (!m.name.trim() || !m.model_name.trim()) {
      toast("warn", "请填写模型名称与 Model 名称");
      return;
    }
    const baseUrl =
      m.base_url.trim() ||
      (m.protocol === "ollama"
        ? "http://localhost:11434"
        : "https://api.openai.com/v1");
    try {
      const parsed = new URL(baseUrl);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      )
        throw new Error();
    } catch {
      toast(
        "warn",
        "请填写有效的 HTTP(S) 服务地址，不要在地址中包含密钥或密码"
      );
      return;
    }
    if (
      !Number.isFinite(m.temperature) ||
      m.temperature < 0 ||
      m.temperature > 2 ||
      !Number.isSafeInteger(m.max_tokens) ||
      m.max_tokens < 1 ||
      m.max_tokens > 1_000_000 ||
      !Number.isSafeInteger(m.timeout_ms) ||
      m.timeout_ms < 1 ||
      m.timeout_ms > 600_000
    ) {
      toast("warn", "请检查温度、输出长度和超时范围");
      return;
    }
    setSaving(true);
    try {
      let nextApiKey = m.api_key;
      if (initialIsEncrypted && !keyModified && initial?.api_key) {
        // Keep existing encrypted payload untouched when locked and user didn't enter a replacement key.
        nextApiKey = initial.api_key;
      } else if (
        sessionPassphrase &&
        nextApiKey &&
        !isEncryptedPayload(nextApiKey)
      ) {
        nextApiKey = await encryptText(nextApiKey, sessionPassphrase);
      }
      saveModel({
        ...m,
        api_key: nextApiKey,
        base_url: baseUrl,
        name: m.name.trim(),
        model_name: m.model_name.trim(),
      });
      toast("ok", `模型「${m.name}」已保存`);
      onClose();
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "保存模型失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} width="max-w-md">
      <ModalHeader
        title={initial ? "编辑模型" : "新增模型"}
        sub={
          m.type === "external"
            ? "外部模型默认不参与路由，除非在隐私设置中显式开启"
            : "本地模型优先参与路由"
        }
        onClose={onClose}
      />
      <div className="flex flex-col gap-3 px-5 pb-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">名称</span>
            <input
              className="field-input"
              value={m.name}
              placeholder="本地 Ollama"
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="field-label">类型</span>
            <select data-ui-select
              className="field-input"
              value={m.type}
              onChange={(e) => set({ type: e.target.value as ModelType })}
            >
              <option value="local">local（本地）</option>
              <option value="external">external（外部）</option>
              <option value="private">private（私有网络）</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="field-label">协议</span>
          <div className="flex rounded-lg bg-paper-200 p-0.5">
            {(
              [
                ["ollama", "Ollama"],
                ["openai_compatible", "OpenAI Compatible"],
              ] as Array<[ModelProtocol, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() =>
                  set({
                    protocol: k,
                    base_url:
                      k === "ollama"
                        ? "http://localhost:11434"
                        : m.base_url.includes("localhost:11434")
                        ? "https://api.openai.com/v1"
                        : m.base_url,
                  })
                }
                className={cx(
                  "flex-1 rounded-md py-1.5 text-[12px] font-bold transition",
                  m.protocol === k
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-400"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </label>
        <label className="block">
          <span className="field-label">Base URL</span>
          <input
            className="field-input font-mono"
            value={m.base_url}
            placeholder={
              m.protocol === "ollama"
                ? "http://localhost:11434"
                : "https://api.openai.com/v1"
            }
            onChange={(e) => set({ base_url: e.target.value })}
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Model</span>
            <input
              className="field-input font-mono"
              value={m.model_name}
              placeholder={
                m.protocol === "ollama" ? "qwen2.5:7b" : "gpt-4o-mini"
              }
              onChange={(e) => set({ model_name: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="field-label">
              API Key{m.type !== "external" && "（可选）"}
            </span>
            <div className="relative">
              <input
                className="field-input pr-8 font-mono"
                type={showKey ? "text" : "password"}
                value={m.api_key}
                placeholder={
                  initialIsEncrypted && !keyModified
                    ? "已加密（留空保持原密钥）"
                    : m.type === "external"
                    ? "sk-…"
                    : "本地可留空"
                }
                onChange={(e) => {
                  setKeyModified(true);
                  set({ api_key: e.target.value });
                }}
              />
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-600"
                onClick={() => setShowKey((v) => !v)}
                aria-label="显示/隐藏 Key"
              >
                {showKey ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              </button>
            </div>
          </label>
        </div>
        <details>
          <summary className="cursor-pointer text-[12px] font-bold text-ink-500">
            高级参数
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="field-label">Temperature</span>
              <input
                className="field-input font-mono"
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={m.temperature}
                onChange={(e) => set({ temperature: Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className="field-label">Max Tokens</span>
              <input
                className="field-input font-mono"
                type="number"
                min={256}
                value={m.max_tokens}
                onChange={(e) => set({ max_tokens: Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className="field-label">超时（ms）</span>
              <input
                className="field-input font-mono"
                type="number"
                min={5000}
                step={5000}
                value={m.timeout_ms}
                onChange={(e) => set({ timeout_ms: Number(e.target.value) })}
              />
            </label>
          </div>
        </details>
        <div className="flex items-center justify-between rounded-lg bg-paper-100 px-3 py-2">
          <span className="text-[12.5px] font-medium text-ink-700">
            启用该模型
          </span>
          <Toggle
            checked={m.enabled}
            onChange={(v) => set({ enabled: v })}
            label="启用"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            取消
          </Btn>
          <Btn variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "保存中…" : "保存模型"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function Models() {
  const {
    models,
    saveModel,
    deleteModel,
    toggleModel,
    privacy,
    setPrivacy,
    externalCallCount,
    toast,
  } = useAppSlice(
    "models",
    "saveModel",
    "deleteModel",
    "toggleModel",
    "privacy",
    "setPrivacy",
    "externalCallCount",
    "toast"
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ModelProvider | null>(null);
  const [delTarget, setDelTarget] = useState<ModelProvider | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [confirmExternal, setConfirmExternal] = useState(false);
  const [sessionPassphrase, setSessionPassphrase] = useState<string | null>(
    () => sessionMasterPassphrase
  );
  const [passphraseInput, setPassphraseInput] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [cryptoBusy, setCryptoBusy] = useState(false);

  const updateSessionPassphrase = (next: string | null) => {
    sessionMasterPassphrase = next;
    setSessionPassphrase(next);
  };

  const encryptedModels = models.filter((m) => isEncryptedPayload(m.api_key));
  const plaintextModels = models.filter(
    (m) => Boolean(m.api_key) && !isEncryptedPayload(m.api_key)
  );

  const unlockOrEnablePassphrase = async () => {
    const pass = passphraseInput;
    if (!pass) {
      toast("warn", "请输入本地主密码");
      return;
    }
    setCryptoBusy(true);
    try {
      if (encryptedModels.length > 0) {
        // Verify passphrase against the first encrypted key before unlocking.
        await decryptText(encryptedModels[0].api_key, pass);
        updateSessionPassphrase(pass);
        setPassphraseInput("");
        toast("ok", "主密码已解锁（仅保存在当前会话内存）");
      } else {
        updateSessionPassphrase(pass);
        setPassphraseInput("");
        let encryptedCount = 0;
        for (const m of plaintextModels) {
          const encryptedKey = await encryptText(m.api_key, pass);
          saveModel({ ...m, api_key: encryptedKey });
          encryptedCount += 1;
        }
        toast(
          "ok",
          encryptedCount > 0
            ? `已启用主密码并加密 ${encryptedCount} 个 API Key`
            : "已启用会话主密码，后续保存的 API Key 将自动加密"
        );
      }
    } catch (err) {
      toast(
        "err",
        err instanceof Error ? err.message : "主密码校验失败，请重试"
      );
    } finally {
      setCryptoBusy(false);
    }
  };

  const encryptAllPlaintextKeys = async () => {
    if (!sessionPassphrase) return;
    if (plaintextModels.length === 0) {
      toast("info", "当前没有待加密的明文 API Key");
      return;
    }
    setCryptoBusy(true);
    try {
      for (const m of plaintextModels) {
        const encryptedKey = await encryptText(m.api_key, sessionPassphrase);
        saveModel({ ...m, api_key: encryptedKey });
      }
      toast("ok", `已加密 ${plaintextModels.length} 个明文 API Key`);
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "加密失败");
    } finally {
      setCryptoBusy(false);
    }
  };

  const decryptAllToPlaintext = async () => {
    if (!sessionPassphrase) return;
    if (encryptedModels.length === 0) {
      updateSessionPassphrase(null);
      toast("info", "当前没有已加密的 API Key，已退出加密模式");
      return;
    }
    setCryptoBusy(true);
    try {
      const decryptedPairs: Array<{ model: ModelProvider; plain: string }> = [];
      for (const m of encryptedModels) {
        const plain = await decryptText(m.api_key, sessionPassphrase);
        decryptedPairs.push({ model: m, plain });
      }
      for (const { model, plain } of decryptedPairs) {
        saveModel({ ...model, api_key: plain });
      }
      updateSessionPassphrase(null);
      toast(
        "ok",
        `已将 ${decryptedPairs.length} 个 API Key 恢复为明文存储并清除主密码`
      );
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "解密失败");
    } finally {
      setCryptoBusy(false);
    }
  };

  const localModel = models.find((m) => m.enabled && m.type !== "external");
  const externalModel = models.find((m) => m.enabled && m.type === "external");
  const modeLabel = localModel
    ? "本机或私有模型已启用"
    : privacy.allowExternal && privacy.route !== "local_only" && externalModel
    ? "外部模型，逐次确认"
    : "本地规则，无需连接服务";

  const runTest = async (p: ModelProvider) => {
    let target = p;
    if (isEncryptedPayload(p.api_key)) {
      if (!sessionPassphrase) {
        toast("warn", "该模型 API Key 已加密，请先解锁本地主密码");
        return;
      }
      try {
        const plainKey = await decryptText(p.api_key, sessionPassphrase);
        target = { ...p, api_key: plainKey };
      } catch (err) {
        toast(
          "err",
          err instanceof Error ? err.message : "API Key 解密失败"
        );
        return;
      }
    }
    setTests((t) => ({ ...t, [p.id]: { running: true } }));
    const r = await testProvider(target);
    setTests((t) => ({
      ...t,
      [p.id]: {
        running: false,
        ok: r.ok,
        latency: r.latency,
        message: r.message,
        code: r.code,
        hint: r.hint,
        availableModels: r.availableModels,
      },
    }));
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-7 sm:px-6">
      <header className="anim-fade-up">
        <h1 className="text-[28px] font-semibold tracking-tight text-ink-900">
          模型与隐私
        </h1>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
        <div>
          <p className="text-[14px] font-medium text-ink-800">
            当前：{modeLabel}
          </p>
          <details className="mt-2 text-[12px] text-ink-500">
            <summary className="cursor-pointer">运行说明</summary>
            <p className="mt-2">
              {localModel
                ? `配置模型：${localModel.name}。连接失败时会回退本地规则；启用不代表服务当前可连接。`
                : "本地规则直接在浏览器执行。外部模型仍需每次确认发送内容。"}
            </p>
          </details>
        </div>
        <Btn
          variant="outline"
          className="text-[13px]"
          onClick={() => {
            models.filter((m) => m.enabled).forEach((m) => toggleModel(m.id));
            setPrivacy({ allowExternal: false, route: "local_only" });
            toast("ok", "已切换到本地规则模式");
          }}
        >
          切换到本地规则
        </Btn>
      </section>

      {/* 隐私与路由 */}
      <section
        className="anim-fade-up rounded-2xl border border-ink-200 bg-paper-25 p-5"
        style={{ animationDelay: "0.05s" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={cx(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                privacy.allowExternal
                  ? "bg-seal-100 text-seal-600"
                  : "bg-paper-100 text-ink-600"
              )}
            >
              <IconShield size={19} />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-ink-900">
                允许调用外部模型
              </h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-400">
                发送条目到外部服务前逐次确认。累计调用{" "}
                <b className="font-mono text-ink-700">{externalCallCount}</b>{" "}
                次。
              </p>
            </div>
          </div>
          <Toggle
            checked={privacy.allowExternal}
            onChange={(v) => {
              if (v) setConfirmExternal(true);
              else {
                setPrivacy({ allowExternal: false });
                toast("ok", "外部模型已关闭，所有请求仅走本地");
              }
            }}
            label="允许外部模型"
          />
        </div>
        <div className="mt-4 grid gap-3 border-t border-ink-100 pt-4 sm:grid-cols-3">
          {(
            [
              [
                "local_first",
                "本地优先",
                "本地优先，本地不可用且已授权时才用外部",
              ],
              ["ask_before_external", "逐次确认", "每次使用外部模型前弹窗确认"],
              [
                "local_only",
                "仅本地",
                "绝不发起外部请求，无本地模型时用规则引擎",
              ],
            ] as Array<[RouteStrategy, string, string]>
          ).map(([k, label, desc]) => (
            <button
              key={k}
              aria-pressed={privacy.route === k}
              onClick={() => {
                setPrivacy({ route: k });
                toast("ok", `已切换为${label}`);
              }}
              className={cx(
                "rounded-xl border p-3 text-left transition-all",
                privacy.route === k
                  ? "border-brand-500 bg-brand-50"
                  : "border-ink-200 bg-white hover:border-ink-300"
              )}
            >
              <span
                className={cx(
                  "flex items-center gap-1.5 text-[13px] font-medium",
                  privacy.route === k ? "text-brand-700" : "text-ink-700"
                )}
              >
                {privacy.route === k && <IconCheck size={11} />}
                {label}
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-ink-500">
                {desc}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 本地主密码加密 API Key */}
      <section
        className="anim-fade-up rounded-2xl border border-ink-200 bg-paper-25 p-5"
        style={{ animationDelay: "0.08s" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={cx(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                sessionPassphrase
                  ? "bg-ok-bg text-ok"
                  : encryptedModels.length > 0
                  ? "bg-seal-100 text-seal-600"
                  : "bg-paper-100 text-ink-600"
              )}
            >
              <IconLock size={18} />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-ink-900">
                本地主密码加密 API Key
                <span className="ml-2 rounded-md bg-paper-200 px-1.5 py-0.5 text-[11px] font-medium text-ink-500">
                  可选
                </span>
              </h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">
                {sessionPassphrase
                  ? `主密码已在当前会话内存解锁（已加密 ${encryptedModels.length} 个，明文 ${plaintextModels.length} 个）。主密码不会写入本地存储。`
                  : encryptedModels.length > 0
                  ? `检测到 ${encryptedModels.length} 个已加密 API Key，当前处于锁定状态；输入主密码解锁后可编辑或测试连接。`
                  : "未设置主密码时保持明文存储与旧版完全兼容；设置后将使用 Web Crypto AES-GCM 加密保存的 API Key。"}
              </p>
            </div>
          </div>
        </div>

        {!sessionPassphrase ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3.5">
            <div className="relative min-w-[220px] flex-1">
              <input
                type={showPassphrase ? "text" : "password"}
                className="field-input pr-8 font-mono"
                value={passphraseInput}
                onChange={(e) => setPassphraseInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void unlockOrEnablePassphrase();
                }}
                placeholder={
                  encryptedModels.length > 0
                    ? "输入本地主密码以解锁…"
                    : "设置本地主密码（仅保存在会话内存）…"
                }
                aria-label="本地主密码"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-700"
                onClick={() => setShowPassphrase((v) => !v)}
                aria-label="显示/隐藏主密码"
              >
                {showPassphrase ? (
                  <IconEyeOff size={14} />
                ) : (
                  <IconEye size={14} />
                )}
              </button>
            </div>
            <Btn
              variant="primary"
              className="h-9 text-[12.5px]"
              disabled={cryptoBusy || !passphraseInput}
              onClick={() => void unlockOrEnablePassphrase()}
            >
              <IconLock size={13} />{" "}
              {cryptoBusy
                ? "处理中…"
                : encryptedModels.length > 0
                ? "解锁主密码"
                : "启用并加密现有密钥"}
            </Btn>
          </div>
        ) : (
          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3.5">
            {plaintextModels.length > 0 && (
              <Btn
                variant="primary"
                className="h-8 text-[12px]"
                disabled={cryptoBusy}
                onClick={() => void encryptAllPlaintextKeys()}
              >
                加密 {plaintextModels.length} 个明文 Key
              </Btn>
            )}
            {encryptedModels.length > 0 && (
              <Btn
                variant="outline"
                className="h-8 text-[12px]"
                disabled={cryptoBusy}
                onClick={() => void decryptAllToPlaintext()}
              >
                解密为明文（移除加密）
              </Btn>
            )}
            <Btn
              variant="ghost"
              className="h-8 text-[12px]"
              disabled={cryptoBusy}
              onClick={() => {
                updateSessionPassphrase(null);
                toast("info", "已锁定：会话主密码已从内存清除");
              }}
            >
              锁定会话
            </Btn>
          </div>
        )}
      </section>

      {/* 模型列表 */}
      <section className="anim-fade-up" style={{ animationDelay: "0.1s" }}>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="font-display text-[18px] font-bold text-ink-900">
            已配置模型{" "}
            <span className="text-[12px] font-medium text-ink-500">
              {models.length}
            </span>
          </h2>
          <Btn
            variant="primary"
            className="h-8 text-[12px]"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <IconPlus size={13} /> 新增模型
          </Btn>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {models.map((m) => {
            const t = tests[m.id];
            return (
              <div
                key={m.id}
                className={cx(
                  "group rounded-xl border bg-surface p-4 transition-colors",
                  m.enabled ? "border-brand-200" : "border-line"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[14px] font-bold text-ink-900">
                        {m.name}
                      </h3>
                      <span className={cx("chip", TYPE_META[m.type].cls)}>
                        {TYPE_META[m.type].label}
                      </span>
                    </div>
                    <p
                      className="mt-1 truncate text-[12px] text-ink-500"
                      title={m.base_url}
                    >
                      {m.base_url}
                    </p>
                  </div>
                  <Toggle
                    checked={m.enabled}
                    onChange={() => {
                      toggleModel(m.id);
                      toast(
                        "info",
                        `「${m.name}」已${m.enabled ? "停用" : "启用"}`
                      );
                    }}
                    label="启用模型"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="chip bg-paper-200 font-mono text-ink-600">
                    {m.model_name}
                  </span>
                </div>
                <details className="mt-2 text-[12px] text-ink-500">
                  <summary className="cursor-pointer">
                    连接参数
                    {m.api_key
                      ? isEncryptedPayload(m.api_key)
                        ? sessionPassphrase
                          ? " · 已加密（已解锁）"
                          : " · 已加密（已锁定）"
                        : " · 已配置密钥"
                      : ""}
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="chip bg-paper-200 text-ink-600">
                      {m.protocol}
                    </span>
                    <span className="chip bg-paper-200 text-ink-600">
                      temp {m.temperature}
                    </span>
                    <span className="chip bg-paper-200 font-mono text-ink-400">
                      {m.timeout_ms / 1000}s 超时
                    </span>
                  </div>
                </details>
                {t && !t.running && (
                  <div
                    className={cx(
                      "mt-2.5 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[12px] leading-snug",
                      t.ok
                        ? "bg-ok-bg text-ok"
                        : "bg-danger-100 text-danger-700"
                    )}
                  >
                    {t.ok ? (
                      <IconCheck size={13} className="mt-0.5 shrink-0" />
                    ) : (
                      <IconAlert size={13} className="mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 font-medium">
                        {!t.ok && t.code && DIAG_BADGE[t.code] && (
                          <span className="rounded bg-danger-200/70 px-1.5 py-0.5 text-[10.5px] font-bold text-danger-800">
                            {DIAG_BADGE[t.code]}
                          </span>
                        )}
                        <span>{t.message}</span>
                        {t.ok && (
                          <span className="font-mono text-[11.5px] opacity-75">
                            {t.latency}ms · JSON 输出可用
                          </span>
                        )}
                      </div>
                      {t.hint && (
                        <p className="text-[11.5px] leading-relaxed opacity-90">
                          {t.hint}
                        </p>
                      )}
                      {!t.ok &&
                        t.availableModels &&
                        t.availableModels.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            <span className="text-[11px] opacity-80">
                              点击切换可用模型：
                            </span>
                            {t.availableModels.slice(0, 6).map((name) => (
                              <button
                                key={name}
                                type="button"
                                onClick={() => {
                                  saveModel({ ...m, model_name: name });
                                  toast("ok", `已切换模型为「${name}」`);
                                }}
                                className="rounded border border-danger-300/70 bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-ink-800 transition hover:bg-white"
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-1.5 border-t border-ink-100 pt-2.5">
                  <Btn
                    variant="outline"
                    className="h-7 px-2.5 text-[11.5px]"
                    onClick={() => runTest(m)}
                    disabled={t?.running}
                  >
                    <IconZap size={12} /> {t?.running ? "测试中…" : "测试连接"}
                  </Btn>
                  <div className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      className="tool-btn"
                      onClick={() => {
                        setEditing(m);
                        setFormOpen(true);
                      }}
                      aria-label="编辑模型"
                    >
                      <IconEdit size={14} />
                    </button>
                    <button
                      className="tool-btn hover:bg-danger-100 hover:text-danger-600"
                      onClick={() => setDelTarget(m)}
                      aria-label="删除模型"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <details className="mt-3 text-[12px] text-ink-500">
          <summary className="cursor-pointer">本地模型连接帮助</summary>
          <p className="mt-2 leading-relaxed">
            提示：本地 Ollama 需先在本机运行{" "}
            <span className="font-mono text-ink-400">ollama serve</span>{" "}
            并拉取模型（如{" "}
            <span className="font-mono text-ink-400">
              ollama pull qwen2.5:7b
            </span>
            ）。若浏览器端提示 CORS 跨域拦截，请设置环境变量{" "}
            <span className="font-mono text-ink-400">OLLAMA_ORIGINS="*"</span>{" "}
            后重启 Ollama。API Key 仅保存在本机，不在日志与界面明文展示。
          </p>
        </details>
      </section>

      {formOpen && (
        <ModelForm
          initial={editing}
          sessionPassphrase={sessionPassphrase}
          onClose={() => setFormOpen(false)}
        />
      )}

      <Confirm
        open={!!delTarget}
        danger
        title={`删除模型「${delTarget?.name}」？`}
        desc="删除后相关路由将失效；若没有其他可用模型，AI 功能会降级为本地规则引擎。"
        confirmText="删除模型"
        onConfirm={() => {
          if (delTarget) {
            deleteModel(delTarget.id);
            toast("ok", "模型已删除");
          }
          setDelTarget(null);
        }}
        onCancel={() => setDelTarget(null)}
      />

      <Confirm
        open={confirmExternal}
        title="开启外部模型？"
        desc={
          <span>
            开启后，当本地模型不可用时，简历条目内容可能被发送到你配置的外部 API
            服务进行处理。
            <b className="text-ink-800"> 默认不会自动调用</b>
            ，每次外部调用前都会明确提示。
          </span>
        }
        confirmText="我了解风险，开启"
        onConfirm={() => {
          setPrivacy({ allowExternal: true });
          setConfirmExternal(false);
          toast("warn", "外部模型已开启");
        }}
        onCancel={() => setConfirmExternal(false)}
      />
    </div>
  );
}

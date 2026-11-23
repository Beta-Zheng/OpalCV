import { useEffect, useState } from "react";
import type {
  ModelProvider,
  ModelProtocol,
  ModelType,
  RouteStrategy,
} from "../types";
import { cx, nowISO, uid } from "../lib/utils";
import {
  normalizeProviderBaseUrl,
  testProvider,
  type ProviderDiagnosticCode,
} from "../lib/ai";
import {
  decryptText,
  encryptText,
  getSessionPassphrase,
  isEncryptedPayload,
  setSessionPassphrase as setGlobalSessionPassphrase,
} from "../lib/crypto";
import { useAppSlice } from "../lib/store";
import { providerDisplayName, useT, useUiLang } from "../lib/i18n";
import { Btn, Confirm, GlassSelect, InfoTip, Modal, ModalHeader, Toggle } from "../components/ui";
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

const MODEL_PRESETS: Array<{
  label: string;
  patch: Partial<ModelProvider>;
}> = [
  {
    label: "Ollama 本地",
    patch: {
      name: "本地 Ollama",
      type: "local",
      protocol: "ollama",
      base_url: "http://localhost:11434",
      model_name: "qwen2.5:7b",
    },
  },
  {
    label: "LM Studio 本地",
    patch: {
      name: "LM Studio",
      type: "local",
      protocol: "openai_compatible",
      base_url: "http://localhost:1234/v1",
      model_name: "qwen/qwen3.5-9b",
      timeout_ms: 120000,
    },
  },
  {
    label: "DeepSeek",
    patch: {
      name: "DeepSeek",
      type: "external",
      protocol: "openai_compatible",
      base_url: "https://api.deepseek.com/v1",
      model_name: "deepseek-chat",
    },
  },
  {
    label: "硅基流动",
    patch: {
      name: "SiliconFlow",
      type: "external",
      protocol: "openai_compatible",
      base_url: "https://api.siliconflow.cn/v1",
      model_name: "Qwen/Qwen2.5-72B-Instruct",
    },
  },
  {
    label: "通义千问",
    patch: {
      name: "通义千问",
      type: "external",
      protocol: "openai_compatible",
      base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model_name: "qwen-plus",
    },
  },
  {
    label: "OpenAI",
    patch: {
      name: "OpenAI",
      type: "external",
      protocol: "openai_compatible",
      base_url: "https://api.openai.com/v1",
      model_name: "gpt-4o-mini",
    },
  },
];

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
  const t = useT();
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
    const baseUrl = normalizeProviderBaseUrl(m.base_url, m.protocol);
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
        title={initial ? t("编辑模型", "Edit Model") : t("新增模型", "Add Model")}
        sub={
          m.type === "external"
            ? t("外部模型默认不参与路由，除非在隐私设置中显式开启", "External models stay disabled unless explicitly enabled in privacy settings")
            : t("本地模型优先参与路由", "Local models are prioritized for routing")
        }
        onClose={onClose}
      />
      <div className="flex flex-col gap-3 px-5 pb-5">
        {!initial && (
          <div>
            <span className="field-label">{t("快捷填充常用服务", "Quick Presets")}</span>
            <div className="flex flex-wrap gap-1.5">
              {MODEL_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => set(preset.patch)}
                  className="rounded-md border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-700 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">{t("名称", "Name")}</span>
            <input
              className="field-input"
              value={m.name}
              placeholder={t("本地 Ollama", "Local Ollama")}
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
          <div className="block">
            <span className="field-label">{t("类型", "Type")}</span>
            <GlassSelect
              ariaLabel={t("模型类型", "Model type")}
              className="w-full"
              value={m.type}
              onChange={(v) => set({ type: v as ModelType })}
              options={[
                { value: "local", label: t("local（本地）", "Local") },
                { value: "external", label: t("external（外部）", "External") },
                { value: "private", label: t("private（私有网络）", "Private Network") },
              ]}
            />
          </div>
        </div>
        <label className="block">
          <span className="field-label">{t("协议", "Protocol")}</span>
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
                        ? m.type === "local"
                          ? "http://localhost:1234/v1"
                          : "https://api.openai.com/v1"
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
              API Key{m.type !== "external" && t("（可选）", " (optional)")}
            </span>
            <div className="relative">
              <input
                className="field-input pr-8 font-mono"
                type={showKey ? "text" : "password"}
                value={m.api_key}
                placeholder={
                  initialIsEncrypted && !keyModified
                    ? t("已加密（留空保持原密钥）", "Encrypted (leave blank to keep)")
                    : m.type === "external"
                    ? "sk-…"
                    : t("本地可留空", "Optional for local")
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
                aria-label={t("显示/隐藏 Key", "Show or hide key")}
              >
                {showKey ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              </button>
            </div>
          </label>
        </div>
        <details>
          <summary className="cursor-pointer text-[12px] font-bold text-ink-500">
            {t("高级参数", "Advanced")}
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
              <span className="field-label">{t("超时（ms）", "Timeout (ms)")}</span>
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
            {t("启用该模型", "Enable this model")}
          </span>
          <Toggle
            checked={m.enabled}
            onChange={(v) => set({ enabled: v })}
            label={t("启用", "Enable")}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            {t("取消", "Cancel")}
          </Btn>
          <Btn variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? t("保存中…", "Saving…") : t("保存模型", "Save Model")}
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
  const uiLang = useUiLang();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ModelProvider | null>(null);
  const [delTarget, setDelTarget] = useState<ModelProvider | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [confirmExternal, setConfirmExternal] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<RouteStrategy | null>(null);
  const [sessionPassphrase, setSessionPassphrase] = useState<string | null>(
    () => getSessionPassphrase()
  );
  const [passphraseInput, setPassphraseInput] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [cryptoBusy, setCryptoBusy] = useState(false);

  const updateSessionPassphrase = (next: string | null) => {
    setGlobalSessionPassphrase(next);
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
  const t = useT();
  const effectiveRoute: RouteStrategy = privacy.allowExternal ? privacy.route : "local_only";
  const modeLabel = localModel
    ? t(`当前生效：${providerDisplayName(localModel.name, uiLang)}`, `Active: ${providerDisplayName(localModel.name, uiLang)}`)
    : privacy.allowExternal && privacy.route !== "local_only" && externalModel
    ? t(`当前生效：${providerDisplayName(externalModel.name, uiLang)}`, `Active: ${providerDisplayName(externalModel.name, uiLang)}`)
    : t("当前生效：本地规则引擎", "Active: Local Rules");

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
      <header className="anim-fade-up flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[28px] font-bold tracking-tight text-ink-900">
            {t("模型与隐私", "Models & Privacy")}
          </h1>
          <InfoTip
            align="left"
            label="模型与隐私说明"
            content={
              localModel
                ? `当前本地模型：${localModel.name}。连接失败时自动回退本地规则；外部模型发送前逐次确认。`
                : "默认仅在本地规则运行，不上传任何简历内容；启用外部模型前逐次弹窗确认。"
            }
          />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-[12px] font-medium text-brand-700">
            <span
              className={cx(
                "h-1.5 w-1.5 rounded-full",
                localModel || (privacy.allowExternal && privacy.route !== "local_only" && externalModel)
                  ? "bg-emerald-500"
                  : "bg-brand-500"
              )}
              aria-hidden="true"
            />
            {modeLabel}
          </span>
        </div>
        <Btn
          variant="primary"
          size="sm"
          className="cta-ai rounded-full px-4"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <IconPlus size={13} /> {t("新增模型", "Add Model")}
        </Btn>
      </header>

      {/* 隐私路由 & 本地主密码（两列等高极简卡片，统一三段节奏） */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section
          className="soft-panel anim-fade-up flex flex-col justify-between gap-3 rounded-[24px] p-5"
          style={{ animationDelay: "0.05s" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={cx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  privacy.allowExternal
                    ? "bg-amber-500/12 text-amber-600"
                    : "bg-sky-500/12 text-sky-600"
                )}
              >
                <IconShield size={17} />
              </span>
              <h2 className="text-[15px] font-bold text-ink-900">
                {t("允许外部模型", "Allow External Models")}
              </h2>
              <InfoTip
                content={`开启后发送内容到外部服务前会逐次弹窗确认。累计外部调用 ${externalCallCount} 次。`}
              />
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={privacy.allowExternal}
              aria-label={t("允许外部模型", "Allow External Models")}
              onClick={() => {
                if (!privacy.allowExternal) {
                  setPendingRoute(privacy.route === "local_only" ? "local_first" : privacy.route);
                  setConfirmExternal(true);
                } else {
                  setPrivacy({ allowExternal: false, route: "local_only" });
                  toast("ok", t("外部模型已关闭，已切换为仅本地模式", "External models disabled; switched to Local Only"));
                }
              }}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                privacy.allowExternal
                  ? "bg-amber-500/12 text-amber-700 hover:bg-amber-500/20"
                  : "bg-surface text-ink-500 ring-1 ring-ink-900/6 hover:text-ink-800"
              )}
            >
              <span
                className={cx(
                  "h-1.5 w-1.5 rounded-full",
                  privacy.allowExternal ? "bg-amber-500" : "bg-ink-300"
                )}
                aria-hidden="true"
              />
              <span>{privacy.allowExternal ? t("已开启", "Enabled") : t("已关闭", "Off")}</span>
            </button>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-500">
            {t(
              "默认所有简历内容留在本地；开启后按下方策略路由，外发前可逐次确认。",
              "Resume data stays local by default; when enabled, external APIs follow the route below."
            )}
          </p>

          <div className="liquid-glass relative grid h-10 grid-cols-3 gap-1 rounded-full p-1">
            {(
              [
                [
                  "local_first",
                  t("本地优先", "Local First"),
                  t("本地优先，本地不可用且已授权时才用外部", "Prefer local model; fall back to external only when allowed"),
                ],
                ["ask_before_external", t("逐次确认", "Ask Each Time"), t("每次使用外部模型前弹窗确认", "Confirm before every external request")],
                [
                  "local_only",
                  t("仅本地", "Local Only"),
                  t("绝不发起外部请求，无本地模型时用规则引擎", "Never send external requests; use local rules"),
                ],
              ] as Array<[RouteStrategy, string, string]>
            ).map(([k, label, desc]) => (
              <button
                key={k}
                type="button"
                title={desc}
                aria-pressed={effectiveRoute === k}
                onClick={() => {
                  if (k === "local_only") {
                    setPrivacy({ allowExternal: false, route: "local_only" });
                    toast("ok", t("已切换为仅本地", "Switched to Local Only"));
                  } else if (!privacy.allowExternal) {
                    setPendingRoute(k);
                    setConfirmExternal(true);
                  } else {
                    setPrivacy({ route: k });
                    toast("ok", t(`已切换为${label}`, `Switched to ${label}`));
                  }
                }}
                className={cx(
                  "flex items-center justify-center rounded-full px-3 text-[12.5px] transition-all",
                  effectiveRoute === k
                    ? "glass-lens font-semibold text-brand-700"
                    : "text-ink-500 hover:text-ink-900"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* 本地主密码加密 API Key */}
        <section
          className="soft-panel anim-fade-up flex flex-col justify-between gap-3 rounded-[24px] p-5"
          style={{ animationDelay: "0.08s" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={cx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  sessionPassphrase
                    ? "bg-emerald-500/12 text-emerald-600"
                    : encryptedModels.length > 0
                    ? "bg-amber-500/12 text-amber-600"
                    : "bg-surface text-ink-600 ring-1 ring-ink-900/5"
                )}
              >
                <IconLock size={17} />
              </span>
              <h2 className="text-[15px] font-bold text-ink-900">
                {t("API Key 主密码", "API Key Passphrase")}
              </h2>
              <InfoTip
                content={
                  sessionPassphrase
                    ? t(
                        `主密码已在当前会话解锁（已加密 ${encryptedModels.length} 个，明文 ${plaintextModels.length} 个），不会写入磁盘。`,
                        `Passphrase unlocked for this session (${encryptedModels.length} encrypted, ${plaintextModels.length} plaintext). Never written to disk.`
                      )
                    : encryptedModels.length > 0
                    ? t(
                        `检测到 ${encryptedModels.length} 个已加密 API Key，输入主密码解锁后可使用。`,
                        `${encryptedModels.length} encrypted API key(s) detected. Enter your passphrase to unlock.`
                      )
                    : t(
                        "可选。设置后将使用 Web Crypto AES-GCM 加密本地保存的 API Key，主密码仅驻留当前会话内存。",
                        "Optional. Encrypts locally saved API keys with Web Crypto AES-GCM; passphrase stays in memory only."
                      )
                }
              />
            </div>
            {(sessionPassphrase || encryptedModels.length > 0) && (
              <span
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
                  sessionPassphrase
                    ? "bg-emerald-500/12 text-emerald-700"
                    : "bg-amber-500/12 text-amber-700"
                )}
              >
                <span
                  className={cx(
                    "h-1.5 w-1.5 rounded-full",
                    sessionPassphrase ? "bg-emerald-500" : "bg-amber-500"
                  )}
                  aria-hidden="true"
                />
                {sessionPassphrase ? t("已解锁", "Unlocked") : t("已锁定", "Locked")}
              </span>
            )}
          </div>
          <p className="text-[12px] leading-relaxed text-ink-500">
            {t(
              "仅用于加密本机保存的外部 API Key；只用本地模型可留空，忘记主密码需重填 Key。",
              "Optional. Encrypts local external API keys; leave blank for local-only models. Forgotten passphrases require re-entering keys."
            )}
          </p>

          {!sessionPassphrase ? (
            <div className="flex items-center gap-2">
              <div className="liquid-input relative flex h-10 min-w-0 flex-1 items-center rounded-full px-3.5">
                <input
                  type={showPassphrase ? "text" : "password"}
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  className="w-full bg-transparent pr-7 font-mono text-[13px] text-ink-900 outline-none placeholder:text-ink-400"
                  value={passphraseInput}
                  onChange={(e) => setPassphraseInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void unlockOrEnablePassphrase();
                  }}
                  placeholder={
                    encryptedModels.length > 0
                      ? t("输入主密码解锁…", "Enter passphrase to unlock…")
                      : t("设置本地主密码…", "Set local passphrase…")
                  }
                  aria-label={t("本地主密码", "Local passphrase")}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition-colors hover:text-ink-700"
                  onClick={() => setShowPassphrase((v) => !v)}
                  aria-label={t("显示/隐藏主密码", "Show or hide passphrase")}
                >
                  {showPassphrase ? (
                    <IconEyeOff size={14} />
                  ) : (
                    <IconEye size={14} />
                  )}
                </button>
              </div>
              <button
                type="button"
                className={cx(
                  "inline-flex h-10 shrink-0 items-center justify-center rounded-full px-4 text-[12.5px] font-medium transition-all",
                  passphraseInput
                    ? "cta-ai text-white shadow-sm"
                    : "cursor-not-allowed bg-surface text-ink-400 ring-1 ring-ink-900/8 shadow-xs"
                )}
                disabled={cryptoBusy || !passphraseInput}
                onClick={() => void unlockOrEnablePassphrase()}
              >
                {cryptoBusy
                  ? t("处理中…", "Working…")
                  : encryptedModels.length > 0
                  ? t("解锁", "Unlock")
                  : t("启用加密", "Enable")}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {plaintextModels.length > 0 && (
                <Btn
                  variant="primary"
                  size="sm"
                  disabled={cryptoBusy}
                  onClick={() => void encryptAllPlaintextKeys()}
                >
                  {t(`加密 ${plaintextModels.length} 个明文 Key`, `Encrypt ${plaintextModels.length} Keys`)}
                </Btn>
              )}
              {encryptedModels.length > 0 && (
                <Btn
                  variant="outline"
                  size="sm"
                  disabled={cryptoBusy}
                  onClick={() => void decryptAllToPlaintext()}
                >
                  {t("移除加密", "Decrypt All")}
                </Btn>
              )}
              <Btn
                variant="ghost"
                size="sm"
                disabled={cryptoBusy}
                onClick={() => {
                  updateSessionPassphrase(null);
                  toast("info", t("已锁定：会话主密码已从内存清除", "Locked: session passphrase cleared"));
                }}
              >
                {t("锁定会话", "Lock Session")}
              </Btn>
            </div>
          )}
        </section>
      </div>

      {/* 模型列表 */}
      <section className="anim-fade-up" style={{ animationDelay: "0.1s" }}>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[17px] font-bold text-ink-900">{t("已配置模型", "Configured Models")}</h2>
          <span className="font-mono text-[12px] text-ink-400">{models.length}</span>
          <InfoTip
            align="left"
            label={t("本地模型连接帮助", "Local model help")}
            content={t(
              '本地 Ollama 需先运行 ollama serve 并拉取模型（如 ollama pull qwen2.5:7b）；若浏览器提示 CORS 拦截，请设置 OLLAMA_ORIGINS="*" 后重启。',
              'Start Ollama with "ollama serve" and pull a model (e.g. ollama pull qwen2.5:7b). If blocked by CORS, set OLLAMA_ORIGINS="*" and restart.'
            )}
          />
        </div>
        <div className="grid gap-3.5 md:grid-cols-2">
          {models.map((m) => {
            const testRes = tests[m.id];
            return (
              <div
                key={m.id}
                className="group soft-panel flex flex-col justify-between gap-3.5 rounded-[22px] p-5 transition-all hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cx(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold",
                      m.type === "local"
                        ? "bg-sky-500/12 text-sky-700"
                        : m.type === "external"
                          ? "bg-amber-500/15 text-amber-700"
                          : "bg-ink-900/8 text-ink-700"
                    )}
                  >
                    {m.protocol === "ollama"
                      ? t("Ollama · 本地", "Ollama · Local")
                      : m.type === "local"
                        ? t(`${providerDisplayName(m.name, uiLang)} · 本地`, `${providerDisplayName(m.name, uiLang)} · Local`)
                        : t("OpenAI 兼容 · 外部", "OpenAI Compatible · External")}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={m.enabled}
                    aria-label={t("启用或停用模型", "Toggle model")}
                    onClick={() => {
                      toggleModel(m.id);
                      toast(
                        "info",
                        t(
                          `「${m.name}」已${m.enabled ? "停用" : "启用"}`,
                          `${m.name} ${m.enabled ? "disabled" : "enabled"}`
                        )
                      );
                    }}
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium transition-colors",
                      m.enabled
                        ? "text-emerald-600 hover:bg-emerald-500/10"
                        : "text-ink-400 hover:bg-ink-900/5 hover:text-ink-600"
                    )}
                  >
                    {m.enabled && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    )}
                    <span>{m.enabled ? t("就绪", "Ready") : t("未启用", "Off")}</span>
                  </button>
                </div>

                <div className="min-w-0">
                  <h3
                    className="truncate text-[16px] font-bold tracking-tight text-ink-900"
                    title={`${providerDisplayName(m.name, uiLang).replace(/（默认关闭）|\s*\(Off by Default\)/g, "").trim()} · ${m.base_url}`}
                  >
                    {m.model_name}
                  </h3>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-400" title={m.base_url}>
                    {providerDisplayName(m.name, uiLang).replace(/（默认关闭）|\s*\(Off by Default\)/g, "").trim()} · {m.base_url}
                  </p>
                </div>
                {testRes && !testRes.running && (
                  <div
                    className={cx(
                      "mt-2.5 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[12px] leading-snug",
                      testRes.ok
                        ? "bg-ok-bg text-ok"
                        : "bg-danger-100 text-danger-700"
                    )}
                  >
                    {testRes.ok ? (
                      <IconCheck size={13} className="mt-0.5 shrink-0" />
                    ) : (
                      <IconAlert size={13} className="mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 font-medium">
                        {!testRes.ok && testRes.code && DIAG_BADGE[testRes.code] && (
                          <span className="rounded bg-danger-200/70 px-1.5 py-0.5 text-[10.5px] font-bold text-danger-800">
                            {DIAG_BADGE[testRes.code]}
                          </span>
                        )}
                        <span>{testRes.message}</span>
                        {testRes.ok && (
                          <span className="font-mono text-[11.5px] opacity-75">
                            {testRes.latency}ms · {t("JSON 输出可用", "JSON ready")}
                          </span>
                        )}
                      </div>
                      {testRes.hint && (
                        <p className="text-[11.5px] leading-relaxed opacity-90">
                          {testRes.hint}
                        </p>
                      )}
                      {!testRes.ok &&
                        testRes.availableModels &&
                        testRes.availableModels.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            <span className="text-[11px] opacity-80">
                              {t("点击切换可用模型：", "Available models:")}
                            </span>
                            {testRes.availableModels.slice(0, 6).map((name) => (
                              <button
                                key={name}
                                type="button"
                                onClick={() => {
                                  saveModel({ ...m, model_name: name });
                                  toast("ok", t(`已切换模型为「${name}」`, `Switched model to ${name}`));
                                }}
                                className="rounded border border-danger-300/70 bg-surface/80 px-1.5 py-0.5 font-mono text-[11px] text-ink-800 transition hover:bg-surface"
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[12px] font-medium text-ink-700 shadow-xs ring-1 ring-ink-900/6 transition-all hover:bg-surface/90 hover:text-ink-900 disabled:opacity-50"
                    onClick={() => runTest(m)}
                    disabled={testRes?.running}
                  >
                    <IconZap size={13} className="text-amber-500" />
                    <span>{testRes?.running ? t("测试中…", "Testing…") : t("测试连接", "Test Connection")}</span>
                  </button>
                  <div className="ml-auto flex gap-1 opacity-50 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      className="tool-btn"
                      onClick={() => {
                        setEditing(m);
                        setFormOpen(true);
                      }}
                      aria-label={t("编辑模型", "Edit model")}
                    >
                      <IconEdit size={14} />
                    </button>
                    <button
                      className="tool-btn hover:bg-danger-100 hover:text-danger-600"
                      onClick={() => setDelTarget(m)}
                      aria-label={t("删除模型", "Delete model")}
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
        title={t(`删除模型「${delTarget?.name}」？`, `Delete model "${delTarget?.name}"?`)}
        desc={t(
          "删除后相关路由将失效；若没有其他可用模型，AI 功能会降级为本地规则引擎。",
          "Routing for this provider will stop. If no other model is available, AI features fall back to local rules."
        )}
        confirmText={t("删除模型", "Delete Model")}
        onConfirm={() => {
          if (delTarget) {
            deleteModel(delTarget.id);
            toast("ok", t("模型已删除", "Model deleted"));
          }
          setDelTarget(null);
        }}
        onCancel={() => setDelTarget(null)}
      />

      <Confirm
        open={confirmExternal}
        title={t("开启外部模型？", "Enable external models?")}
        desc={
          <span>
            {t(
              "开启后，当本地模型不可用时，简历条目内容可能被发送到你配置的外部 API 服务进行处理。",
              "When enabled and no local model is available, resume items may be sent to your configured external API. "
            )}
            <b className="text-ink-800">{t(" 默认不会自动调用", " Never called automatically")}</b>
            ，每次外部调用前都会明确提示。
          </span>
        }
        confirmText="我了解风险，开启"
        onConfirm={() => {
          setPrivacy({
            allowExternal: true,
            route: pendingRoute ?? (privacy.route === "local_only" ? "local_first" : privacy.route),
          });
          setPendingRoute(null);
          setConfirmExternal(false);
          toast("warn", t("外部模型已开启", "External models enabled"));
        }}
        onCancel={() => {
          setPendingRoute(null);
          setConfirmExternal(false);
        }}
      />
    </div>
  );
}

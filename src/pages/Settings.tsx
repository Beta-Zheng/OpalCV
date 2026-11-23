import { useEffect, useRef, useState } from "react";
import { cx, downloadText, fmtDateCompact, nowISO } from "../lib/utils";
import { useAppSlice } from "../lib/store";
import { useT } from "../lib/i18n";
import {
  createBackup,
  createResumeBackup,
  parseBackup,
  type BackupData,
} from "../lib/backup";
import {
  downloadBackupFromGist,
  downloadBackupFromWebDav,
  uploadBackupToGist,
  uploadBackupToWebDav,
} from "../lib/sync";
import { Btn, Confirm, GlassSelect, InfoTip, Toggle, Modal, ModalHeader } from "../components/ui";
import {
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconDatabase,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconRefresh,
  IconShield,
  IconTrash,
  IconUpload,
} from "../components/icons";

export default function Settings() {
  const app = useAppSlice(
    "resumes",
    "jds",
    "suggestions",
    "models",
    "privacy",
    "setPrivacy",
    "toast",
    "importData",
    "clearAll",
    "saveStatus",
    "snapshots",
    "applications",
    "coverLetters"
  );
  const { resumes, jds, suggestions, models, privacy, setPrivacy } = app;
  const t = useT();
  const [clearArmed, setClearArmed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState<{
    raw: string;
    data: BackupData;
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [singleId, setSingleId] = useState("");
  const SYNC_CONFIG_KEY = "touchstonecv-sync-config";
  const initialSyncConfig = (() => {
    try {
      const raw = localStorage.getItem(SYNC_CONFIG_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<{
        syncTarget: "webdav" | "gist";
        webdavUrl: string;
        webdavUser: string;
        gistId: string;
        gistFilename: string;
      }>;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  })();
  const [syncTarget, setSyncTarget] = useState<"webdav" | "gist">(
    initialSyncConfig?.syncTarget === "gist" ? "gist" : "webdav"
  );
  const [syncPassphrase, setSyncPassphrase] = useState("");
  const [showSyncPassphrase, setShowSyncPassphrase] = useState(false);
  const [webdavUrl, setWebdavUrl] = useState(
    initialSyncConfig?.webdavUrl ?? ""
  );
  const [webdavUser, setWebdavUser] = useState(
    initialSyncConfig?.webdavUser ?? ""
  );
  const [webdavPass, setWebdavPass] = useState("");
  const [gistToken, setGistToken] = useState("");
  const [gistId, setGistId] = useState(initialSyncConfig?.gistId ?? "");
  const [gistFilename, setGistFilename] = useState(
    initialSyncConfig?.gistFilename || "opalcv-backup.enc.json"
  );
  const [syncOpen, setSyncOpen] = useState(false);
  const hasSyncConfigured =
    syncTarget === "webdav" ? !!webdavUrl.trim() : !!gistId.trim();
  useEffect(() => {
    try {
      localStorage.setItem(
        SYNC_CONFIG_KEY,
        JSON.stringify({
          syncTarget,
          webdavUrl,
          webdavUser,
          gistId,
          gistFilename,
        })
      );
    } catch {
      // ignore storage quota / privacy mode errors
    }
  }, [syncTarget, webdavUrl, webdavUser, gistId, gistFilename]);
  const [syncBusy, setSyncBusy] = useState<null | "upload" | "download">(null);
  const [syncStatus, setSyncStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [storageEstimate, setStorageEstimate] =
    useState<StorageEstimate | null>(null);
  useEffect(() => {
    let active = true;
    void navigator.storage
      ?.estimate()
      .then((value) => {
        if (active) setStorageEstimate(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [app.saveStatus, resumes.length, app.snapshots.length]);
  const [lastBackup, setLastBackup] = useState(() => {
    try {
      return localStorage.getItem("resume-last-backup");
    } catch {
      return null;
    }
  });

  const storageKB =
    Math.round(
      new Blob([
        JSON.stringify({
          resumes,
          jds,
          suggestions,
          models,
          snapshots: app.snapshots,
          applications: app.applications,
          coverLetters: app.coverLetters,
        }),
      ]).size / 102.4
    ) / 10;

  const backup = () => {
    const payload = createBackup(app);
    downloadText(
      `opalcv-backup-${fmtDateCompact(nowISO())}.json`,
      JSON.stringify(payload, null, 2)
    );
    app.toast("ok", t("备份文件已下载（含全部简历与配置）", "Backup downloaded (all resumes & settings)"));
    const date = nowISO();
    setLastBackup(date);
    try {
      localStorage.setItem("resume-last-backup", date);
    } catch {
      /* Download remains available when local storage is full. */
    }
  };

  const onImport = (file: File) => {
    if (file.size > 20_000_000) {
      app.toast("err", "备份文件不能超过 20 MB");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => app.toast("err", "无法读取备份文件");
    reader.onload = () => {
      try {
        const raw = String(reader.result || "");
        const data = parseBackup(raw, models);
        setRestoring({ raw, data });
        setRestoreMode("merge");
      } catch {
        app.toast("err", "备份文件格式不正确，原有数据未改变");
      }
    };
    reader.readAsText(file);
  };

  const handleSyncUpload = async () => {
    setSyncBusy("upload");
    setSyncStatus(null);
    try {
      if (syncTarget === "webdav") {
        const res = await uploadBackupToWebDav(
          { url: webdavUrl, username: webdavUser, password: webdavPass },
          app,
          syncPassphrase
        );
        const msg = `已加密上传至 WebDAV（${res.bytes} 字节）`;
        setSyncStatus({ ok: true, text: msg });
        app.toast("ok", msg);
      } else {
        const res = await uploadBackupToGist(
          { token: gistToken, gistId, filename: gistFilename },
          app,
          syncPassphrase
        );
        if (res.gistId) setGistId(res.gistId);
        const msg = `已加密上传至私有 Gist（ID: ${res.gistId}，${res.bytes} 字节）`;
        setSyncStatus({ ok: true, text: msg });
        app.toast("ok", msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加密上传失败";
      setSyncStatus({ ok: false, text: msg });
      app.toast("err", msg);
    } finally {
      setSyncBusy(null);
    }
  };

  const handleSyncDownload = async () => {
    setSyncBusy("download");
    setSyncStatus(null);
    try {
      const res =
        syncTarget === "webdav"
          ? await downloadBackupFromWebDav(
              { url: webdavUrl, username: webdavUser, password: webdavPass },
              syncPassphrase,
              models
            )
          : await downloadBackupFromGist(
              { token: gistToken, gistId, filename: gistFilename },
              syncPassphrase,
              models
            );
      setRestoring({ raw: res.raw, data: res.data });
      setRestoreMode("merge");
      const msg = "已下载并解密备份，请在弹窗中确认恢复方式";
      setSyncStatus({ ok: true, text: msg });
      app.toast("ok", msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "下载或解密失败";
      setSyncStatus({ ok: false, text: msg });
      app.toast("err", msg);
    } finally {
      setSyncBusy(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-4 pb-14 pt-7 sm:px-6">
      <header className="anim-fade-up flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[28px] font-bold tracking-tight text-ink-900">
            {t("数据管理", "Data Management")}
          </h1>
          <InfoTip
            align="left"
            label={t("本地存储与隐私说明", "Local storage & privacy")}
            content={t(
              `所有简历与配置均保存在当前浏览器 IndexedDB（约 ${storageKB} KB）。默认不上传任何数据、不发送遥测；清理浏览器缓存会移除数据，建议定期下载备份。`,
              `All resumes and settings are stored locally in browser IndexedDB (~${storageKB} KB). Zero telemetry or auto-uploads. Back up periodically before clearing browser storage.`
            )}
          />
        </div>
        <span className="chip rounded-full bg-subtle px-3 py-1 text-[12px] text-ink-600 tabular-nums">
          {storageKB} KB · IndexedDB
          {storageEstimate?.usage
            ? ` · ${t("站点", "Origin")} ${(storageEstimate.usage / 1024 / 1024).toFixed(1)} MB`
            : ""}
        </span>
      </header>

      {app.saveStatus === "error" && (
        <p
          role="alert"
          className="rounded-2xl bg-danger-100 p-3.5 text-[12.5px] text-danger-700"
        >
          {t("本机数据读取或保存失败，请先保管已有备份并检查浏览器存储空间。", "Local read/write failed. Keep your backup safe and check browser storage quota.")}
        </p>
      )}

      {/* 第一层：核心 · 本地存储与备份 */}
      <section aria-label={t("本地存储与备份", "Local storage & backup")} className="space-y-2.5">
        <h2 className="px-1 text-[12px] font-semibold tracking-wider text-ink-400 uppercase">
          {t("本地存储与备份", "Local Storage & Backup")}
        </h2>
        <div className="soft-panel space-y-4 rounded-[24px] p-5 sm:p-6">
          {/* 存储概览、备份状态与主操作 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <IconDatabase size={18} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold text-ink-900">
                    {t("本机数据备份", "Local Backup")}
                  </span>
                  <span
                    className={cx(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                      lastBackup
                        ? "bg-emerald-500/12 text-emerald-600"
                        : "bg-amber-500/12 text-amber-600"
                    )}
                  >
                    {lastBackup
                      ? `${t("已备份", "Backed up")} ${new Date(lastBackup).toLocaleDateString()}`
                      : t("尚未备份", "Not backed up")}
                  </span>
                  <InfoTip
                    content={t(
                      "备份 JSON 包含全部简历、版本快照与投递记录（不含 API Key），恢复时可选择合并或覆盖。",
                      "Backup JSON includes all resumes, snapshots, and applications (excluding API keys). Choose merge or replace on restore."
                    )}
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-500 tabular-nums">
                  <span className="rounded-full bg-surface/85 px-2 py-0.5">
                    {t(`简历 ${resumes.length}`, `${resumes.length} resumes`)}
                  </span>
                  <span className="rounded-full bg-surface/85 px-2 py-0.5">
                    {t(`投递 ${app.applications.length}`, `${app.applications.length} apps`)}
                  </span>
                  <span className="rounded-full bg-surface/85 px-2 py-0.5">
                    {t(`快照 ${app.snapshots.length}`, `${app.snapshots.length} snapshots`)}
                  </span>
                  <span className="rounded-full bg-surface/85 px-2 py-0.5">
                    {`JD ${Object.keys(jds).length}`}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Btn variant="primary" size="sm" className="cta-ai rounded-full px-4" onClick={backup}>
                <IconDownload size={14} /> {t("备份", "Backup")}
              </Btn>
              <Btn
                variant="outline"
                size="sm"
                className="rounded-full px-4"
                onClick={() => importRef.current?.click()}
              >
                <IconUpload size={14} /> {t("恢复", "Restore")}
              </Btn>
              <input
                ref={importRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImport(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {/* 次级操作：单份简历独立导出 */}
          {resumes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-surface/75 px-3.5 py-2.5">
              <span className="text-[12px] font-medium text-ink-500">
                {t("单份简历", "Single Resume")}
              </span>
              <GlassSelect
                ariaLabel={t("选择单份备份简历", "Select single resume")}
                className="min-w-[180px] flex-1"
                placeholder={t("选择单份简历…", "Choose a resume…")}
                value={singleId}
                onChange={setSingleId}
                options={resumes.map((r) => ({ value: r.id, label: r.title }))}
              />
              <Btn
                size="sm"
                className="rounded-full px-4"
                disabled={!singleId}
                title={t("导出为 JSON 文件", "Export as JSON")}
                onClick={() =>
                  downloadText(
                    `opalcv-resume-${singleId}.json`,
                    JSON.stringify(createResumeBackup(app, singleId), null, 2)
                  )
                }
              >
                {t("导出", "Export")}
              </Btn>
            </div>
          )}
        </div>
      </section>

      {/* 第二层：偏好与高级 · 隐私与跨设备同步 */}
      <section aria-label={t("隐私与跨设备同步", "Privacy & cloud sync")} className="space-y-2.5">
        <h2 className="px-1 text-[12px] font-semibold tracking-wider text-ink-400 uppercase">
          {t("隐私与跨设备同步", "Privacy & Cloud Sync")}
        </h2>
        <div className="soft-panel space-y-2.5 rounded-[24px] p-3">
          {/* 紧凑设置行 1：允许外部模型 */}
          <div className="flex items-center justify-between gap-4 rounded-[18px] bg-surface/80 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={cx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  privacy.allowExternal
                    ? "bg-amber-500/12 text-amber-600"
                    : "bg-brand-50 text-brand-600"
                )}
              >
                <IconShield size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ink-900">
                  {t("允许外部模型", "Allow External Models")}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-500">
                  {t(
                    "默认本地隐私模式、零遥测；开启后外部 AI 调用前仍会逐次确认。",
                    "Local-first with zero telemetry by default. External AI calls still ask before sending."
                  )}
                </p>
              </div>
            </div>
            <Toggle
              checked={privacy.allowExternal}
              onChange={(v) => {
                setPrivacy({ allowExternal: v });
                app.toast(
                  v ? "warn" : "ok",
                  v ? t("外部模型已开启", "External models enabled") : t("外部模型已关闭", "External models disabled")
                );
              }}
              label={t("允许外部模型", "Allow External Models")}
            />
          </div>

          {/* 紧凑设置行 2：加密云端同步（默认折叠，按需展开） */}
          <div className="rounded-[18px] bg-surface/80">
            <button
              type="button"
              aria-expanded={syncOpen}
              onClick={() => setSyncOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 rounded-[18px] px-4 py-3.5 text-left transition-colors hover:bg-surface"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-600">
                  <IconRefresh size={16} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink-900">
                      {t("加密云端同步", "Encrypted Cloud Sync")}
                    </span>
                    <span className="rounded-full bg-subtle px-2 py-0.5 text-[10.5px] font-medium text-ink-500">
                      AES-GCM
                    </span>
                    {hasSyncConfigured && (
                      <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10.5px] font-medium text-emerald-600">
                        {syncTarget === "webdav"
                          ? t("已配置 WebDAV", "WebDAV ready")
                          : t("已配置 Gist", "Gist ready")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-500">
                    {t(
                      "高级选项 · 支持 WebDAV 或私有 GitHub Gist，密钥仅驻留内存不落盘。",
                      "Advanced · Sync via WebDAV or private GitHub Gist; credentials stay in memory only."
                    )}
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-ink-500">
                {syncOpen ? t("收起", "Collapse") : t("配置", "Configure")}
                {syncOpen ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
              </span>
            </button>

            {syncOpen && (
              <div className="px-4 pb-4 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                  <span className="text-[12px] text-ink-500">
                    {t("同步目标", "Sync Target")}
                  </span>
                  <div className="liquid-glass relative flex rounded-full p-1">
                    {(
                      [
                        ["webdav", "WebDAV"],
                        ["gist", "GitHub Gist"],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setSyncTarget(k);
                          setSyncStatus(null);
                        }}
                        className={cx(
                          "rounded-full px-3.5 py-1 text-[12px] transition-all",
                          syncTarget === k
                            ? "glass-lens font-semibold"
                            : "text-ink-500 hover:text-ink-900"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="field-label">{t("同步加密口令", "Sync Passphrase")}</span>
                    <div className="liquid-input relative flex items-center rounded-full px-4 py-2">
                      <input
                        type={showSyncPassphrase ? "text" : "password"}
                        className="w-full bg-transparent pr-7 font-mono text-[13px] text-ink-900 outline-none placeholder:text-ink-400"
                        value={syncPassphrase}
                        onChange={(e) => setSyncPassphrase(e.target.value)}
                        placeholder={t("输入加密上传与解密恢复口令…", "Enter passphrase for AES-GCM encryption…")}
                      />
                      <button
                        type="button"
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                        onClick={() => setShowSyncPassphrase((v) => !v)}
                        aria-label={t("显示/隐藏同步密码", "Show or hide passphrase")}
                      >
                        {showSyncPassphrase ? (
                          <IconEyeOff size={14} />
                        ) : (
                          <IconEye size={14} />
                        )}
                      </button>
                    </div>
                  </label>

                  {syncTarget === "webdav" ? (
                    <>
                      <label className="block md:col-span-2">
                        <span className="field-label">WebDAV URL</span>
                        <input
                          type="url"
                          className="liquid-input w-full rounded-full px-4 py-2 font-mono text-[13px] text-ink-900 placeholder:text-ink-400"
                          value={webdavUrl}
                          onChange={(e) => setWebdavUrl(e.target.value)}
                          placeholder="https://dav.example.com/backups/opalcv.enc.json"
                        />
                      </label>
                      <label className="block">
                        <span className="field-label">{t("用户名（可选）", "Username (optional)")}</span>
                        <input
                          type="text"
                          className="liquid-input w-full rounded-full px-4 py-2 text-[13px] text-ink-900 placeholder:text-ink-400"
                          value={webdavUser}
                          onChange={(e) => setWebdavUser(e.target.value)}
                          placeholder={t("WebDAV 用户名", "WebDAV username")}
                        />
                      </label>
                      <label className="block">
                        <span className="field-label">{t("密码（可选）", "Password (optional)")}</span>
                        <input
                          type="password"
                          className="liquid-input w-full rounded-full px-4 py-2 font-mono text-[13px] text-ink-900 placeholder:text-ink-400"
                          value={webdavPass}
                          onChange={(e) => setWebdavPass(e.target.value)}
                          placeholder={t("WebDAV 密码", "WebDAV password")}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="block md:col-span-2">
                        <span className="field-label">{t("GitHub Token（gist 权限）", "GitHub Token (gist scope)")}</span>
                        <input
                          type="password"
                          className="liquid-input w-full rounded-full px-4 py-2 font-mono text-[13px] text-ink-900 placeholder:text-ink-400"
                          value={gistToken}
                          onChange={(e) => setGistToken(e.target.value)}
                          placeholder="ghp_… / github_pat_…"
                        />
                      </label>
                      <label className="block">
                        <span className="field-label">{t("Gist ID（留空自动新建）", "Gist ID (blank to create)")}</span>
                        <input
                          type="text"
                          className="liquid-input w-full rounded-full px-4 py-2 font-mono text-[13px] text-ink-900 placeholder:text-ink-400"
                          value={gistId}
                          onChange={(e) => setGistId(e.target.value)}
                          placeholder="a1b2c3d4e5f6…"
                        />
                      </label>
                      <label className="block">
                        <span className="field-label">{t("Gist 文件名", "Gist Filename")}</span>
                        <input
                          type="text"
                          className="liquid-input w-full rounded-full px-4 py-2 font-mono text-[13px] text-ink-900 placeholder:text-ink-400"
                          value={gistFilename}
                          onChange={(e) => setGistFilename(e.target.value)}
                          placeholder="opalcv-backup.enc.json"
                        />
                      </label>
                    </>
                  )}
                </div>

                {syncStatus && (
                  <p
                    role="status"
                    className={cx(
                      "mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]",
                      syncStatus.ok
                        ? "bg-ok-bg text-ok"
                        : "bg-danger-100 text-danger-700"
                    )}
                  >
                    {syncStatus.ok ? (
                      <IconCheck size={14} className="shrink-0" />
                    ) : (
                      <IconAlert size={14} className="shrink-0" />
                    )}
                    <span>{syncStatus.text}</span>
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Btn
                    variant="primary"
                    size="sm"
                    className="rounded-full"
                    disabled={syncBusy !== null}
                    onClick={() => void handleSyncUpload()}
                  >
                    <IconUpload size={14} />{" "}
                    {syncBusy === "upload"
                      ? t("加密上传中…", "Encrypting & uploading…")
                      : syncTarget === "webdav"
                      ? t("加密上传到 WebDAV", "Encrypt & Upload to WebDAV")
                      : t("加密上传到私有 Gist", "Encrypt & Upload to Private Gist")}
                  </Btn>
                  <Btn
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={syncBusy !== null}
                    onClick={() => void handleSyncDownload()}
                  >
                    <IconDownload size={14} />{" "}
                    {syncBusy === "download"
                      ? t("下载解密中…", "Downloading & decrypting…")
                      : syncTarget === "webdav"
                      ? t("从 WebDAV 恢复", "Restore from WebDAV")
                      : t("从 Gist 恢复", "Restore from Gist")}
                  </Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 第三层：危险操作区 */}
      <section aria-label={t("危险操作", "Danger zone")} className="space-y-2.5">
        <h2 className="px-1 text-[12px] font-semibold tracking-wider text-danger-600/80 uppercase">
          {t("危险操作", "Danger Zone")}
        </h2>
        <div className="rounded-[24px] bg-danger-100/45 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-danger-100 text-danger-600">
                <IconAlert size={18} />
              </span>
              <div>
                <h3 className="text-[14.5px] font-bold text-danger-700">
                  {t("清空全部本地数据", "Clear All Local Data")}
                </h3>
                <p className="mt-0.5 text-[12px] text-danger-700/80">
                  {t(
                    "永久移除本机简历、投递记录与 JD，并将模型恢复为默认（不可撤销）。",
                    "Permanently deletes all local resumes, applications, and JDs, and resets models."
                  )}
                </p>
              </div>
            </div>
            {!clearArmed ? (
              <Btn
                variant="danger"
                size="sm"
                className="rounded-full px-4"
                onClick={() => setClearArmed(true)}
              >
                <IconTrash size={14} /> {t("清空", "Clear")}
              </Btn>
            ) : (
              <div className="flex items-center gap-2">
                <Btn
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setClearArmed(false)}
                >
                  {t("取消", "Cancel")}
                </Btn>
                <Btn
                  variant="danger"
                  size="sm"
                  className="rounded-full font-bold"
                  onClick={() => setConfirmClear(true)}
                >
                  <IconTrash size={14} /> {t("确认清空", "Confirm Clear")}
                </Btn>
              </div>
            )}
          </div>
        </div>
      </section>

      <Confirm
        open={confirmClear}
        danger
        title={t("确定清空全部数据？", "Clear all local data?")}
        desc={t(
          `将删除 ${resumes.length} 份简历、${suggestions.length} 条 AI 建议记录、${Object.keys(jds).length} 份 JD，模型配置恢复默认。此操作不可撤销。`,
          `This permanently deletes ${resumes.length} resumes, ${suggestions.length} AI suggestions, and ${Object.keys(jds).length} JDs, and resets model settings.`
        )}
        confirmText={t("永久删除", "Delete Permanently")}
        onConfirm={() => {
          app.clearAll();
          setConfirmClear(false);
          setClearArmed(false);
          app.toast("ok", t("全部数据已清空", "All local data cleared"));
        }}
        onCancel={() => setConfirmClear(false)}
      />
      <Modal open={!!restoring} onClose={() => setRestoring(null)}>
        <ModalHeader
          title={t("预览备份内容", "Preview Backup")}
          sub={t("确认恢复方式后才写入本机", "Choose how to restore before writing to this device")}
          onClose={() => setRestoring(null)}
        />
        <div className="px-5 pb-5">
          {restoring && (
            <>
              <p className="text-[13px]">
                {restoring.data.resumes.length} {t("份简历", "resumes")} ·{" "}
                {restoring.data.snapshots?.length ?? 0} {t("份快照", "snapshots")} ·{" "}
                {restoring.data.applications?.length ?? 0} {t("条投递记录", "applications")}
              </p>
              <ul className="my-3 max-h-40 overflow-auto text-[12px] text-ink-500">
                {restoring.data.resumes.map((r) => (
                  <li key={r.id}>{r.title}</li>
                ))}
              </ul>
              <div className="block text-[12px] text-ink-500">
                <span className="mb-1.5 block font-medium">{t("恢复方式", "Restore Mode")}</span>
                <GlassSelect
                  ariaLabel={t("恢复方式", "Restore mode")}
                  className="w-full"
                  value={restoreMode}
                  onChange={(v) => setRestoreMode(v as typeof restoreMode)}
                  options={[
                    { value: "merge", label: t("合并：保留当前数据，分配新 ID", "Merge: keep existing data") },
                    { value: "replace", label: t("覆盖：替换所有当前简历与配置", "Replace: overwrite all local data") },
                  ]}
                />
              </div>
              <p className="my-3 text-[12px] text-ink-500">
                {restoreMode === "replace"
                  ? t(
                      "覆盖会替换当前数据并关闭外部调用，请先备份。密钥只保留同一服务已有的本机密钥。",
                      "Replacing overwrites current data and disables external calls. Export a backup first."
                    )
                  : t(
                      "合并保留当前模型、密钥和隐私设置，关联版本与投递记录一并导入。",
                      "Merging keeps your current models, keys, and privacy settings while importing resumes & applications."
                    )}
              </p>
              <Btn
                variant={restoreMode === "replace" ? "danger" : "primary"}
                onClick={() => {
                  if (app.importData(restoring.raw, restoreMode))
                    setRestoring(null);
                  else app.toast("err", t("恢复失败，原有数据未改变", "Restore failed; existing data unchanged"));
                }}
              >
                {restoreMode === "replace" ? t("确认覆盖恢复", "Confirm Replace") : t("确认合并导入", "Confirm Merge")}
              </Btn>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

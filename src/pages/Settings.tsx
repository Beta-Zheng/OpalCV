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
  IconDatabase,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconLock,
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
    initialSyncConfig?.gistFilename || "touchstone-cv-backup.enc.json"
  );
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
      `ai-resume-backup-${fmtDateCompact(nowISO())}.json`,
      JSON.stringify(payload, null, 2)
    );
    app.toast("ok", "备份文件已下载（含全部简历与配置）");
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-7 sm:px-6">
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
        <span className="chip rounded-full bg-subtle px-3 py-1 font-mono text-[12px] text-ink-600">
          {storageKB} KB{storageEstimate?.usage ? ` · ${t("站点", "Origin")} ${(storageEstimate.usage / 1024 / 1024).toFixed(1)} MB` : ""}
        </span>
      </header>

      {app.saveStatus === "error" && (
        <p
          role="alert"
          className="rounded-2xl bg-danger-100 p-3.5 text-[12px] text-danger-700"
        >
          {t("本机数据读取或保存失败，请先保管已有备份并检查浏览器存储空间。", "Local read/write failed. Keep your backup safe and check browser storage quota.")}
        </p>
      )}

      {/* 顶部 4 列等高粉彩概览条 */}
      <section aria-label={t("本地数据概览", "Local storage overview")} className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {[
          [t("简历", "Resumes"), resumes.length, t("份", ""), "pastel-violet"],
          ["JD", Object.keys(jds).length, t("份", ""), "pastel-indigo"],
          [t("AI 建议", "AI Suggestions"), suggestions.length, t("条", ""), "pastel-mint"],
          [t("模型配置", "Models"), models.length, t("个", ""), "pastel-amber"],
        ].map(([label, n, unit, bg]) => (
          <div key={String(label)} className={`rounded-[22px] px-5 py-4 ${bg}`}>
            <p className="text-[12.5px] font-medium text-ink-500">{label}</p>
            <p className="mt-1.5 text-[26px] font-bold leading-none tabular-nums text-ink-900">
              {n}
              {unit && (
                <span className="ml-1 text-[12px] font-medium text-ink-500">
                  {unit}
                </span>
              )}
            </p>
          </div>
        ))}
      </section>

      {/* 中部 2 列等高核心功能卡 */}
      <div className="grid items-stretch gap-4 md:grid-cols-2">
        {/* 备份与恢复 */}
        <section className="soft-panel flex flex-col justify-between gap-4 rounded-[24px] p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <IconDatabase size={16} className="text-brand-600" />
              <h2 className="text-[15px] font-bold text-ink-900">{t("备份与恢复", "Backup & Restore")}</h2>
              <InfoTip
                content={t(
                  "备份 JSON 包含全部简历、快照与投递记录（不含 API Key），恢复时可选择合并或替换。",
                  "Backup JSON includes all resumes, snapshots, and applications (excluding API keys). Choose merge or replace on restore."
                )}
              />
            </div>
            <span className="text-[12px] text-ink-400">
              {lastBackup ? `${t("已备份", "Backed up")} ${new Date(lastBackup).toLocaleDateString()}` : t("未备份", "Not backed up")}
            </span>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Btn variant="primary" className="flex-1" onClick={backup}>
              <IconDownload size={14} /> {t("下载完整备份", "Download Full Backup")}
            </Btn>
            <Btn
              variant="outline"
              className="flex-1"
              onClick={() => importRef.current?.click()}
            >
              <IconUpload size={14} /> {t("从备份恢复", "Restore Backup")}
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

          <div className="flex items-center gap-2">
            <GlassSelect
              ariaLabel={t("选择单份备份简历", "Select single resume")}
              className="min-w-0 flex-1"
              placeholder={t("选择单份简历…", "Choose a resume…")}
              value={singleId}
              onChange={setSingleId}
              options={resumes.map((r) => ({ value: r.id, label: r.title }))}
            />
            <Btn
              size="sm"
              disabled={!singleId}
              onClick={() =>
                downloadText(
                  `resume-${singleId}.json`,
                  JSON.stringify(createResumeBackup(app, singleId), null, 2)
                )
              }
            >
              {t("单份导出", "Export One")}
            </Btn>
          </div>
        </section>

        {/* 数据隐私与安全开关 */}
        <section className="soft-panel flex flex-col justify-between gap-4 rounded-[24px] p-5">
          <div className="flex items-center gap-2">
            <IconLock size={16} className="text-brand-600" />
            <h2 className="text-[15px] font-bold text-ink-900">{t("数据隐私", "Privacy")}</h2>
            <InfoTip
              content={t(
                "默认不上传任何数据、不发送遥测、不请求外部服务；开启外部模型后每次外发仍需确认。",
                "No uploads, telemetry, or external calls by default. External AI calls still ask for confirmation when enabled."
              )}
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
            <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink-800">
              <IconShield
                size={15}
                className={privacy.allowExternal ? "text-seal-600" : "text-brand-600"}
              />
              {t("允许外部模型", "Allow External Models")}
            </span>
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

          <div className="flex items-center justify-between text-[12px] text-ink-500">
            <span>{t("本地隐私模式 · 零遥测", "Local-first · Zero telemetry")}</span>
            <span className="font-mono text-ink-400">IndexedDB</span>
          </div>
        </section>
      </div>

      {/* 加密云端同步 */}
      <section
        className="soft-panel anim-fade-up rounded-[24px] p-5"
        style={{ animationDelay: "0.12s" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconRefresh size={16} className="text-brand-600" />
            <h2 className="text-[15px] font-bold text-ink-900">
              {t("加密云端同步", "Encrypted Cloud Sync")}
            </h2>
            <InfoTip
              content={t(
                "上传前在本地使用 AES-GCM 加密完整备份 JSON；Token、密码与加密口令仅驻留内存，绝不写入磁盘。",
                "Encrypts the full backup JSON locally with AES-GCM before upload. Tokens and passphrases stay in memory only."
              )}
            />
          </div>
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

        <div className="mt-4 grid gap-3.5 md:grid-cols-2">
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
              "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]",
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
      </section>

      {/* 危险区（无硬框浅红柔块） */}
      <section
        className="anim-fade-up rounded-[24px] bg-danger-100/45 p-5"
        style={{ animationDelay: "0.15s" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-danger-100 text-danger-600">
              <IconAlert size={18} />
            </span>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold text-danger-700">
                {t("清空全部数据", "Clear All Data")}
              </h2>
              <InfoTip
                align="left"
                content={t(
                  "删除本机全部简历、JD、AI 建议记录，并将模型配置恢复为默认。操作不可撤销，建议先下载备份。",
                  "Deletes all local resumes, JDs, and AI suggestions and resets model configs to defaults. Irreversible — download a backup first."
                )}
              />
            </div>
          </div>
          {!clearArmed ? (
            <Btn
              variant="danger"
              size="sm"
              onClick={() => setClearArmed(true)}
            >
              <IconTrash size={14} /> {t("清空全部数据", "Clear All Data")}
            </Btn>
          ) : (
            <div className="flex items-center gap-2">
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => setClearArmed(false)}
              >
                {t("取消", "Cancel")}
              </Btn>
              <Btn
                variant="danger"
                size="sm"
                className="font-bold"
                onClick={() => setConfirmClear(true)}
              >
                <IconTrash size={14} /> {t("确认清空", "Confirm Clear")}
              </Btn>
            </div>
          )}
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, KeyRound, Loader2, Lock, LogOut, ShieldCheck, User } from "lucide-react";
import type { AuthUserSnapshot } from "@/lib/auth-session-store";
import { loadWorkspaceRegistry, type AccountWorkspaceRecord } from "@/lib/workspace-registry";
import type { WorkspaceEntityType, WorkspaceSyncConflictRecord } from "@/lib/account-workspace-db";
import { listOpenSyncConflicts, resolveSyncConflict } from "@/lib/cloud-sync/sync-engine";

export interface WardrobeCloudAuth {
  user: AuthUserSnapshot;
  deviceId: string;
  deviceLabel: string;
  accessToken?: string;
  workspace?: AccountWorkspaceRecord;
  isBusy: boolean;
  onLogout: () => Promise<void>;
  onLogoutAll: () => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export function AccountManagementView({
  auth,
  onBack,
  onChangePassword,
}: {
  auth: WardrobeCloudAuth;
  onBack: () => void;
  onChangePassword: () => void;
}) {
  return (
    <div className="grid gap-3.5">
      <SubPageHeader title="账号管理" onBack={onBack} />
      <article className="surface rounded-lg px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-denim/10 text-denim">
            <User size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{auth.user.maskedPhone}</h2>
            <p className="mt-1 text-xs text-ink/55">账号服务已连接</p>
            <p className="mt-1 truncate text-[11px] text-ink/45">{auth.deviceLabel} · {auth.deviceId}</p>
          </div>
        </div>
      </article>

      <article className="surface rounded-lg px-4 py-3.5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-moss" size={18} aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">本机衣橱保留在本地</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink/55">
              退出账号不会删除本机已缓存的数据。重新登录后将继续使用当前账号工作区。
            </p>
          </div>
        </div>
      </article>

      <article className="surface rounded-lg px-4 py-3.5">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 shrink-0 text-clay" size={18} aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">MiniMax Key 属于本机</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink/55">
              AI Key 与账号无关，仍在设置页单独管理。
            </p>
          </div>
        </div>
      </article>

      <SyncConflictsPanel auth={auth} />
      <div className="grid gap-2">
        <button
          type="button"
          onClick={onChangePassword}
          className="flex h-12 items-center justify-between rounded-lg border border-ink/10 bg-white px-4 text-sm font-semibold"
        >
          <span className="inline-flex items-center gap-2"><Lock size={16} aria-hidden="true" /> 修改密码</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => auth.onLogout()}
          disabled={auth.isBusy}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-ink/10 bg-white text-sm font-semibold disabled:opacity-60"
        >
          {auth.isBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
          退出当前设备
        </button>
        <button
          type="button"
          onClick={() => auth.onLogoutAll()}
          disabled={auth.isBusy}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-clay text-sm font-semibold text-white disabled:opacity-60"
        >
          退出全部设备
        </button>
      </div>
    </div>
  );
}

function SyncConflictsPanel({ auth }: { auth: WardrobeCloudAuth }) {
  const [conflicts, setConflicts] = useState<WorkspaceSyncConflictRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const getWorkspace = useCallback(() => auth.workspace ?? loadWorkspaceRegistry().workspaces[auth.user.id], [auth.user.id, auth.workspace]);

  const loadConflicts = useCallback(async () => {
    const workspace = getWorkspace();
    if (!workspace) {
      setConflicts([]);
      return;
    }
    setIsLoading(true);
    try {
      setConflicts(await listOpenSyncConflicts(workspace));
    } finally {
      setIsLoading(false);
    }
  }, [getWorkspace]);

  useEffect(() => {
    void loadConflicts();
  }, [loadConflicts]);

  async function resolve(conflict: WorkspaceSyncConflictRecord, resolution: "keep_local" | "use_cloud") {
    const workspace = getWorkspace();
    if (!workspace || !auth.accessToken) {
      setMessage("解决冲突需要连接云端");
      return;
    }
    setBusyId(`${conflict.id}:${resolution}`);
    setMessage(null);
    try {
      const result = await resolveSyncConflict({
        workspace,
        accessToken: auth.accessToken,
        deviceId: auth.deviceId,
        conflictId: conflict.id,
        resolution,
      });
      setMessage(result.resolved ? "冲突已处理" : "冲突状态已变化，请刷新后再试");
      await loadConflicts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "解决冲突失败");
    } finally {
      setBusyId(null);
    }
  }

  const canResolve = Boolean(getWorkspace() && auth.accessToken);

  return (
    <article className="surface rounded-lg px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">同步冲突</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink/55">
            {conflicts.length > 0 ? `有 ${conflicts.length} 条待处理` : "暂无需要手动处理的同步冲突"}
          </p>
        </div>
        {conflicts.length > 0 ? (
          <AlertTriangle className="mt-0.5 shrink-0 text-clay" size={18} aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 shrink-0 text-moss" size={18} aria-hidden="true" />
        )}
      </div>
      {message ? <p className="mt-2 rounded-lg bg-mist px-3 py-2 text-xs text-ink/65">{message}</p> : null}
      {isLoading ? <p className="mt-3 text-xs text-ink/45">正在读取冲突列表...</p> : null}
      {conflicts.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {conflicts.map((conflict) => (
            <div key={conflict.id} className="rounded-lg border border-ink/10 bg-white px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{entityLabel(conflict.entityType)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-ink/45">
                    {conflict.entityId} · {new Date(conflict.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!canResolve || busyId !== null}
                  onClick={() => resolve(conflict, "keep_local")}
                  className="h-9 rounded-lg border border-denim/20 bg-denim/8 text-xs font-semibold text-denim disabled:opacity-50"
                >
                  {busyId === `${conflict.id}:keep_local` ? "处理中..." : "保留本机"}
                </button>
                <button
                  type="button"
                  disabled={!canResolve || busyId !== null}
                  onClick={() => resolve(conflict, "use_cloud")}
                  className="h-9 rounded-lg border border-ink/10 bg-white text-xs font-semibold text-ink/70 disabled:opacity-50"
                >
                  {busyId === `${conflict.id}:use_cloud` ? "处理中..." : "采用云端"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function entityLabel(entityType: WorkspaceEntityType): string {
  const labels: Record<WorkspaceEntityType, string> = {
    garment: "衣物",
    outfit: "套装",
    outfitItem: "套装单品",
    wishlistItem: "种草记录",
    wearEvent: "穿着记录",
    tripPlan: "旅行计划",
    outfitPlan: "穿搭计划",
    asset: "图片资产",
    closetLocation: "衣橱位置",
    profile: "个人画像",
  };
  return labels[entityType];
}

export function ChangePasswordView({
  auth,
  onBack,
  onDone,
}: {
  auth: WardrobeCloudAuth;
  onBack: () => void;
  onDone: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3.5"
      onSubmit={async (event) => {
        event.preventDefault();
        setMessage(null);
        if (newPassword.length < 8) {
          setMessage("新密码至少 8 位");
          return;
        }
        if (newPassword !== confirmPassword) {
          setMessage("两次输入的新密码不一致");
          return;
        }
        try {
          await auth.onChangePassword(currentPassword, newPassword);
          onDone();
        } catch (error) {
          const msg = error instanceof Error ? error.message : "修改失败，请稍后再试";
          setMessage(msg === "Invalid phone or password" ? "当前密码不正确，请重试" : msg);
        }
      }}
    >
      <SubPageHeader title="修改密码" onBack={onBack} />
      {message ? <p className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{message}</p> : null}
      <PasswordField label="当前密码" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
      <PasswordField label="新密码" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
      <PasswordField label="确认新密码" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
      <button
        type="submit"
        disabled={auth.isBusy}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-denim text-sm font-semibold text-white disabled:opacity-60"
      >
        {auth.isBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
        保存新密码
      </button>
    </form>
  );
}

function SubPageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex h-14 items-center gap-2 px-1 pt-2">
      <button type="button" onClick={onBack} className="grid h-10 w-10 place-items-center rounded-lg text-ink/65 active:bg-mist" aria-label="返回">
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <h1 className="min-w-0 truncate text-xl font-bold tracking-tight">{title}</h1>
    </header>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="password"
        autoComplete={autoComplete}
        className="h-11 w-full rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
      />
    </label>
  );
}

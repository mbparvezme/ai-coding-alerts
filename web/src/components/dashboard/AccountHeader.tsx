import type { UserRow } from "@/server/account/repository";

export function AccountHeader({ user, isPro }: { user: UserRow; isPro: boolean }) {
  return (
    <div className="flex items-center gap-4">
      {user.avatar_url ? <img src={user.avatar_url} alt="" width={48} height={48} className="rounded-full" /> : null}
      <div>
        <div className="font-medium text-text">{user.name ?? user.username ?? "Your account"}</div>
        <div className="text-sm text-muted">{user.email ?? ""}</div>
      </div>
      <span className={`ml-auto rounded-full px-3 py-1 text-xs ${isPro ? "bg-primary text-primary-foreground" : "border border-border text-muted"}`}>
        {isPro ? "Pro" : "Free"}
      </span>
    </div>
  );
}

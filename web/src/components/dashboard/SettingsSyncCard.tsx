export function SettingsSyncCard({ backup }: { backup: { updatedAt: number; bytes: number } | null }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="font-medium text-text">Settings sync</div>
      {backup ? (
        <p className="mt-2 text-sm text-muted">
          Last backup: <span className="text-text">{new Date(backup.updatedAt).toLocaleString()}</span> · {backup.bytes} bytes
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">No settings backed up yet. Sign in from the extension to sync.</p>
      )}
    </div>
  );
}

"use client";

import { Button } from "@heroui/react";
import type { DeviceRow } from "@/server/account/repository";
import { deactivateDeviceAction } from "@/app/(dashboard)/account/actions";

export function DevicesCard({ devices }: { devices: DeviceRow[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="font-medium text-text">Devices <span className="text-muted">({devices.length}/3)</span></div>
      {devices.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No active devices yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {devices.map((d) => (
            <li key={d.device_id} className="flex items-center justify-between">
              <div>
                <div className="font-mono text-sm text-text">{d.device_id}</div>
                <div className="text-xs text-muted">last seen {new Date(d.last_seen_at).toLocaleDateString()}</div>
              </div>
              <form action={deactivateDeviceAction.bind(null, d.device_id)}>
                <Button type="submit" size="sm" variant="outline">Deactivate</Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

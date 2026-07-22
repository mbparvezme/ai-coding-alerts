import { randomUUID } from "node:crypto";

const DEVICE_ID_KEY = "aiCodingAlerts.deviceId";

/** Minimal slice of vscode.Memento — lets pure code avoid importing "vscode". */
export interface KeyValueStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export function getOrCreateDeviceId(store: KeyValueStore): string {
  const existing = store.get<string>(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = randomUUID();
  void store.update(DEVICE_ID_KEY, id);
  return id;
}

import { Alert, AlertStatus } from "../model/Alert";

export interface KeyValueStore {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

const KEY = "aiCodingAlerts.history";
const MAX_ENTRIES = 500;

type Listener = () => void;

export class HistoryStore {
  private listeners = new Set<Listener>();

  constructor(private readonly store: KeyValueStore) {}

  onDidChange(listener: Listener): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  list(): Alert[] {
    return this.store.get<Alert[]>(KEY, []);
  }

  add(alert: Alert): void {
    this.persist([alert, ...this.list()].slice(0, MAX_ENTRIES));
  }

  setStatus(id: string, status: AlertStatus, at: number = Date.now()): void {
    this.persist(
      this.list().map((a) => (a.id === id ? { ...a, status, respondedAt: at } : a))
    );
  }

  clear(): void {
    this.persist([]);
  }

  private persist(alerts: Alert[]): void {
    void this.store.update(KEY, alerts);
    this.listeners.forEach((l) => l());
  }
}

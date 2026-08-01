import { newId } from "../util/id";

export type DecisionStatus = "pending" | "allow" | "deny" | "expired";

interface Entry {
  status: "pending" | "allow" | "deny";
  expiresAt: number;
}

export class PendingDecisionStore {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly idGen: () => string;

  constructor(deps: { now?: () => number; idGen?: () => string } = {}) {
    this.now = deps.now ?? (() => Date.now());
    this.idGen = deps.idGen ?? newId;
  }

  create(ttlMs: number): string {
    const id = this.idGen();
    this.entries.set(id, { status: "pending", expiresAt: this.now() + ttlMs });
    return id;
  }

  resolve(id: string, decision: "allow" | "deny"): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.status !== "pending" || this.now() >= entry.expiresAt) {
      return false;
    }
    entry.status = decision;
    this.emit();
    return true;
  }

  status(id: string): DecisionStatus {
    const entry = this.entries.get(id);
    if (!entry) {
      return "expired";
    }
    if (entry.status === "pending" && this.now() >= entry.expiresAt) {
      return "expired";
    }
    return entry.status;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  pendingCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.status === "pending" && this.now() < entry.expiresAt) {
        count += 1;
      }
    }
    return count;
  }

  private emit(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }
}

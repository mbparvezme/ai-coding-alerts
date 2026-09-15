// src/permission/managedBroker.ts
import { PendingDecisionStore } from "./PendingDecisionStore";
import { extractPermissionInfo } from "./permissionRequest";
import { RelayClient } from "../relay/relayClient";

export interface ManagedBrokerDeps {
  store: PendingDecisionStore;
  relay: RelayClient;
  ttlMs: () => number;
  messageFor: (payload: unknown) => string;
  showPcPrompt: (text: string, resolve: (d: "allow" | "deny") => void) => () => void;
  sleep: (ms: number) => Promise<void>;
  pollMs: number;
  log: (msg: string) => void;
}

export function createManagedBroker(deps: ManagedBrokerDeps): { create(payload: unknown): Promise<{ id: string }> } {
  return {
    async create(payload) {
      const info = extractPermissionInfo(payload);
      const ttlMs = deps.ttlMs();
      const id = deps.store.create(ttlMs);
      const text = deps.messageFor(payload);
      const dismissPc = deps.showPcPrompt(text, (d) => deps.store.resolve(id, d));

      void (async () => {
        try {
          const created = await deps.relay.createPermission({
            tool: info?.tool ?? "a tool",
            command: info?.command ?? "",
            ttlSec: Math.ceil(ttlMs / 1000)
          });
          if (!created.ok) {
            deps.log(created.notLinked ? "relay: account not linked; falling back to native" : "relay: create failed");
            return; // leave pending -> expires -> native
          }
          while (deps.store.status(id) === "pending") {
            await deps.sleep(deps.pollMs);
            const status = await deps.relay.getDecision(created.requestId);
            if (status === "allow" || status === "deny") { deps.store.resolve(id, status); break; }
            if (status === "expired") break;
          }
        } catch (e) {
          deps.log(`relay poll failed: ${String(e)}`);
        } finally {
          dismissPc();
        }
      })();

      return { id };
    }
  };
}

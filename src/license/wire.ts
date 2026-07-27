import * as vscode from "vscode";
import { AccountService, type DayStore } from "./AccountService";
import { vscodeAuthProvider } from "./githubSession";
import { getOrCreateDeviceId } from "./deviceId";
import { requirePro } from "./requirePro";
import { LICENSE_BASE_URL, LICENSE_PUBLIC_KEY_B64, PADDLE_CHECKOUT_URL } from "./constants";
import type { FetchLike } from "./api";

/** Real network edge: adapt global fetch to FetchLike. */
const realFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, json: () => res.json() };
};

export function createAccountService(context: vscode.ExtensionContext): AccountService {
  const deviceId = getOrCreateDeviceId(context.globalState);
  return new AccountService({
    secrets: context.secrets,
    dayStore: context.globalState as DayStore, // Memento's get/update satisfy DayStore
    auth: vscodeAuthProvider(vscode.authentication),
    deviceId,
    baseUrl: LICENSE_BASE_URL,
    publicKeyB64: LICENSE_PUBLIC_KEY_B64,
    fetchImpl: realFetch,
    now: () => Date.now()
  });
}

function showUpsell(feature: string): void {
  void vscode.window
    .showInformationMessage(`"${feature}" is an AI Coding Alerts Pro feature.`, "Get Pro")
    .then((choice) => {
      if (choice === "Get Pro") void vscode.env.openExternal(vscode.Uri.parse(PADDLE_CHECKOUT_URL));
    });
}

export { requirePro, showUpsell };

export function registerAccountCommands(context: vscode.ExtensionContext, service: AccountService): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("aiCodingAlerts.signIn", async () => {
      const r = await service.signIn();
      if (r.ok) void vscode.window.showInformationMessage("Signed in — AI Coding Alerts Pro active on this device.");
      else void vscode.window.showErrorMessage(r.message);
    }),
    vscode.commands.registerCommand("aiCodingAlerts.upgrade", () => {
      void vscode.env.openExternal(vscode.Uri.parse(PADDLE_CHECKOUT_URL));
    }),
    vscode.commands.registerCommand("aiCodingAlerts.manageAccount", async () => {
      if (!service.isSignedIn()) {
        const choice = await vscode.window.showInformationMessage(
          "You're not signed in to AI Coding Alerts.",
          "Sign in with GitHub",
          "Get Pro"
        );
        if (choice === "Sign in with GitHub") void vscode.commands.executeCommand("aiCodingAlerts.signIn");
        else if (choice === "Get Pro") void vscode.commands.executeCommand("aiCodingAlerts.upgrade");
        return;
      }
      const st = service.state();
      const label = st.pro ? (st.mode === "grace" ? "Active (offline grace)" : "Active") : "Inactive";
      const choice = await vscode.window.showInformationMessage(
        `AI Coding Alerts Pro — ${label}.`,
        "Re-check now",
        "Deactivate this device",
        "Sign out"
      );
      if (choice === "Re-check now") {
        const r = await service.recheckNow();
        void vscode.window.showInformationMessage(r.ok ? "Account re-checked." : `Re-check: ${r.message}`);
      } else if (choice === "Deactivate this device") {
        const ok = await service.deactivateThisDevice();
        void vscode.window.showInformationMessage(ok ? "This device was deactivated." : "Couldn't deactivate this device.");
      } else if (choice === "Sign out") {
        await service.signOut();
        void vscode.window.showInformationMessage("Signed out on this device.");
      }
    })
  );
}

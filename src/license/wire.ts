import * as vscode from "vscode";
import { LicenseService } from "./LicenseService";
import { getOrCreateDeviceId } from "./deviceId";
import { requirePro } from "./requirePro";
import { LICENSE_BASE_URL, LICENSE_PUBLIC_KEY_B64, PADDLE_CHECKOUT_URL } from "./constants";
import type { FetchLike } from "./api";

/** Real network edge: adapt global fetch to FetchLike. */
const realFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, json: () => res.json() };
};

export function createLicenseService(context: vscode.ExtensionContext): LicenseService {
  const deviceId = getOrCreateDeviceId(context.globalState);
  return new LicenseService({
    secrets: context.secrets,
    deviceId,
    baseUrl: LICENSE_BASE_URL,
    publicKeyB64: LICENSE_PUBLIC_KEY_B64,
    fetchImpl: realFetch,
    now: () => Date.now()
  });
}

function showUpsell(feature: string): void {
  void vscode.window
    .showInformationMessage(`"${feature}" is an AI Coding Alerts Pro feature.`, "Upgrade")
    .then((choice) => {
      if (choice === "Upgrade") void vscode.env.openExternal(vscode.Uri.parse(PADDLE_CHECKOUT_URL));
    });
}

export { requirePro, showUpsell };

export function registerLicenseCommands(context: vscode.ExtensionContext, service: LicenseService): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("aiCodingAlerts.enterLicense", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "Paste your AI Coding Alerts Pro license key",
        placeHolder: "ACA-XXXXX-XXXXX-XXXXX-XXXXX",
        ignoreFocusOut: true
      });
      if (!key) return;
      const result = await service.enterLicense(key);
      if (result.ok) {
        void vscode.window.showInformationMessage("AI Coding Alerts Pro is now active on this device. Thank you!");
      } else {
        void vscode.window.showErrorMessage(`Activation failed: ${result.message}`);
      }
    }),
    vscode.commands.registerCommand("aiCodingAlerts.manageLicense", async () => {
      if (!service.hasKey()) {
        const choice = await vscode.window.showInformationMessage("No Pro license on this device.", "Enter License", "Get Pro");
        if (choice === "Enter License") void vscode.commands.executeCommand("aiCodingAlerts.enterLicense");
        else if (choice === "Get Pro") void vscode.env.openExternal(vscode.Uri.parse(PADDLE_CHECKOUT_URL));
        return;
      }
      const st = service.state();
      const label = st.pro ? (st.mode === "grace" ? "Active (offline grace)" : "Active") : "Inactive";
      const choice = await vscode.window.showInformationMessage(
        `AI Coding Alerts Pro — ${label}.`,
        "Re-check now",
        "Deactivate this device",
        "Remove license"
      );
      if (choice === "Re-check now") {
        const r = await service.revalidateNow();
        void vscode.window.showInformationMessage(r.ok ? "License re-checked." : `Re-check: ${r.message}`);
      } else if (choice === "Deactivate this device") {
        const ok = await service.deactivateThisDevice();
        void vscode.window.showInformationMessage(ok ? "This device was deactivated." : "Couldn't reach the server to deactivate.");
      } else if (choice === "Remove license") {
        await service.removeLicense();
        void vscode.window.showInformationMessage("License removed from this device.");
      }
    })
  );
}

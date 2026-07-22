import { webcrypto } from "node:crypto";
import { importPublicKey, verifyToken, type TokenPayload } from "./token";
import { evaluateLicense, type LicenseState } from "./state";
import { activateLicense, validateLicense, deactivateLicense, type ActivateResult, type FetchLike } from "./api";

/** Matches vscode.SecretStorage (get/store/delete). */
export interface SecretStore {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

export interface LicenseServiceDeps {
  secrets: SecretStore;
  deviceId: string;
  baseUrl: string;
  publicKeyB64: string;
  fetchImpl: FetchLike;
  now: () => number;
}

const KEY_SECRET = "aiCodingAlerts.licenseKey";
const TOKEN_SECRET = "aiCodingAlerts.licenseToken";

export class LicenseService {
  private publicKey: webcrypto.CryptoKey | null = null;
  private licenseKey: string | null = null;
  private verifiedPayload: TokenPayload | null = null; // only ever set when signature verified

  constructor(private readonly deps: LicenseServiceDeps) {}

  /** Load cached key+token and verify the token's signature once (async). */
  async init(): Promise<void> {
    this.publicKey = await importPublicKey(this.deps.publicKeyB64);
    this.licenseKey = (await this.deps.secrets.get(KEY_SECRET)) ?? null;
    const token = await this.deps.secrets.get(TOKEN_SECRET);
    this.verifiedPayload = token && this.publicKey ? await verifyToken(token, this.publicKey) : null;
  }

  hasKey(): boolean {
    return this.licenseKey !== null;
  }

  state(): LicenseState {
    return evaluateLicense(this.verifiedPayload, this.deps.now());
  }

  isPro(): boolean {
    return this.state().pro;
  }

  async enterLicense(key: string): Promise<ActivateResult> {
    const trimmed = key.trim();
    const result = await activateLicense(this.deps.baseUrl, trimmed, this.deps.deviceId, this.deps.fetchImpl);
    if (result.ok) {
      await this.storeSession(trimmed, result.token);
    }
    return result;
  }

  /** Re-check only when the cadence says so (startup + periodic). */
  async revalidateIfDue(): Promise<void> {
    if (this.licenseKey && this.state().shouldRevalidate) {
      await this.revalidateNow();
    }
  }

  async revalidateNow(): Promise<ActivateResult> {
    if (!this.licenseKey) return { ok: false, code: "not_found", message: "No license on this device." };
    const result = await validateLicense(this.deps.baseUrl, this.licenseKey, this.deps.deviceId, this.deps.fetchImpl);
    if (result.ok) {
      await this.storeSession(this.licenseKey, result.token);
    } else if (result.code === "inactive" || result.code === "not_found" || result.code === "not_activated") {
      // Definitive negative from the server -> stop honoring the cached token.
      this.verifiedPayload = null;
      await this.deps.secrets.delete(TOKEN_SECRET);
    }
    // network/server errors: keep the cached token (grace window applies).
    return result;
  }

  async deactivateThisDevice(): Promise<boolean> {
    if (!this.licenseKey) return true;
    const res = await deactivateLicense(this.deps.baseUrl, this.licenseKey, this.deps.deviceId, this.deps.fetchImpl);
    if (res.ok) await this.removeLicense();
    return res.ok;
  }

  async removeLicense(): Promise<void> {
    this.licenseKey = null;
    this.verifiedPayload = null;
    await this.deps.secrets.delete(KEY_SECRET);
    await this.deps.secrets.delete(TOKEN_SECRET);
  }

  private async storeSession(key: string, token: string): Promise<void> {
    this.licenseKey = key;
    this.verifiedPayload = this.publicKey ? await verifyToken(token, this.publicKey) : null;
    await this.deps.secrets.store(KEY_SECRET, key);
    await this.deps.secrets.store(TOKEN_SECRET, token);
  }
}

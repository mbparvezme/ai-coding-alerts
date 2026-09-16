import { webcrypto } from "node:crypto";
import { importPublicKey, verifyToken, type TokenPayload } from "./token";
import { evaluateLicense, type LicenseState } from "./state";
import { authGithub, refreshAuth, deactivateAccount, type AuthResult, type FetchLike } from "./api";
import { localDayKey, shouldRecheckToday } from "./recheck";
import type { AuthProvider } from "./githubSession";

/** Matches vscode.SecretStorage (get/store/delete). */
export interface SecretStore {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

/** Matches vscode.Memento's get/update (used for the `lastCheckDay` string). */
export interface DayStore {
  get(key: string): string | undefined;
  update(key: string, value: string): Thenable<void>;
}

export interface AccountServiceDeps {
  secrets: SecretStore;
  dayStore: DayStore;
  auth: AuthProvider;
  deviceId: string;
  baseUrl: string;
  publicKeyB64: string;
  fetchImpl: FetchLike;
  now: () => number;
}

const TOKEN_SECRET = "aiCodingAlerts.accountToken";
const DAY_KEY = "aiCodingAlerts.lastCheckDay";

export class AccountService {
  private publicKey: webcrypto.CryptoKey | null = null;
  private verifiedPayload: TokenPayload | null = null; // only ever set when signature verified
  private telegramLinked = false;

  constructor(private readonly deps: AccountServiceDeps) {}

  /** Load cached token and verify its signature once (async). */
  async init(): Promise<void> {
    this.publicKey = await importPublicKey(this.deps.publicKeyB64);
    const token = await this.deps.secrets.get(TOKEN_SECRET);
    this.verifiedPayload = token && this.publicKey ? await verifyToken(token, this.publicKey) : null;
  }

  isSignedIn(): boolean {
    return this.verifiedPayload !== null;
  }

  state(): LicenseState & { telegramLinked: boolean } {
    return { ...evaluateLicense(this.verifiedPayload, this.deps.now()), telegramLinked: this.telegramLinked };
  }

  isPro(): boolean {
    return this.state().pro;
  }

  /** Interactive GitHub sign-in. */
  async signIn(): Promise<AuthResult> {
    const session = await this.deps.auth.getSession(true);
    if (!session) return { ok: false, code: "github_auth", message: "GitHub sign-in was cancelled." };
    const r = await authGithub(this.deps.baseUrl, session.accessToken, this.deps.deviceId, this.deps.fetchImpl);
    if (r.ok) {
      this.telegramLinked = r.telegramLinked ?? false;
      await this.storeSession(r.token);
      await this.markCheckedToday();
    }
    return r;
  }

  /** Non-blocking, once-per-local-day recheck. Gates BEFORE touching auth/fetch. */
  async recheckIfNewDay(): Promise<void> {
    if (!shouldRecheckToday(this.deps.dayStore.get(DAY_KEY) ?? null, this.deps.now())) return;
    await this.doRefresh();
  }

  /** Ungated silent recheck. */
  async recheckNow(): Promise<AuthResult> {
    return this.doRefresh();
  }

  /** Interactive deactivation of this device. */
  async deactivateThisDevice(): Promise<boolean> {
    const session = await this.deps.auth.getSession(true);
    if (!session) return false;
    const res = await deactivateAccount(this.deps.baseUrl, session.accessToken, this.deps.deviceId, this.deps.fetchImpl);
    if (res.ok) await this.clearToken();
    return res.ok;
  }

  /** Local-only sign-out; no server call. */
  async signOut(): Promise<void> {
    await this.clearToken();
  }

  /** Silent recheck core. */
  private async doRefresh(): Promise<AuthResult> {
    const session = await this.deps.auth.getSession(false);
    if (!session) return { ok: false, code: "github_auth", message: "No GitHub session." };
    const r = await refreshAuth(this.deps.baseUrl, session.accessToken, this.deps.deviceId, this.deps.fetchImpl);
    if (r.ok) {
      this.telegramLinked = r.telegramLinked ?? false;
      await this.storeSession(r.token);
      await this.markCheckedToday();
      return r;
    }
    if (r.code === "no_account") {
      // Definitive server verdict: the account no longer exists — stop honoring the cached token.
      await this.clearToken();
      await this.markCheckedToday();
      return r;
    }
    // github_auth / network / server are transient (GitHub blip, offline, 5xx): keep the cached
    // token so the 14-day offline grace applies, and do NOT advance the day (retry next start).
    return r;
  }

  private async storeSession(token: string): Promise<void> {
    this.verifiedPayload = this.publicKey ? await verifyToken(token, this.publicKey) : null;
    await this.deps.secrets.store(TOKEN_SECRET, token);
  }

  private async clearToken(): Promise<void> {
    this.verifiedPayload = null;
    this.telegramLinked = false;
    await this.deps.secrets.delete(TOKEN_SECRET);
  }

  async currentToken(): Promise<string | undefined> {
    return this.deps.secrets.get(TOKEN_SECRET);
  }

  private async markCheckedToday(): Promise<void> {
    await this.deps.dayStore.update(DAY_KEY, localDayKey(this.deps.now()));
  }
}

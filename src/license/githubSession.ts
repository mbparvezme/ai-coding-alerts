export interface AuthProvider {
  getSession(createIfNone: boolean): Promise<{ accessToken: string } | undefined>;
}

export interface VscodeAuthLike {
  getSession(
    provider: string,
    scopes: string[],
    opts: { createIfNone: boolean; silent?: boolean }
  ): Thenable<{ accessToken: string } | undefined>;
}

export function vscodeAuthProvider(vscodeAuth: VscodeAuthLike): AuthProvider {
  return {
    async getSession(createIfNone: boolean) {
      return vscodeAuth.getSession("github", ["user:email"], { createIfNone });
    },
  };
}

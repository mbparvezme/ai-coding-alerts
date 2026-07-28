export const REDIRECT_TO_SIGNIN = "REDIRECT_TO_SIGNIN";

// The page catches this and calls next/navigation redirect(); kept pure/testable here.
export function requireAccountId(session: { accountId?: string } | null): string {
  const id = session?.accountId;
  if (!id) throw new Error(REDIRECT_TO_SIGNIN);
  return id;
}

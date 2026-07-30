"use server";

import { signIn, signOut } from "@/auth";

export async function signInWithGithub(redirectTo = "/account") {
  await signIn("github", { redirectTo });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

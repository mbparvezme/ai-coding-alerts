"use client";

import { Button } from "@heroui/react";
import { signOutAction } from "@/app/auth-actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost">Sign out</Button>
    </form>
  );
}

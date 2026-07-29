import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/auth";
import { getDashboardData } from "@/server/dashboard/loader";
import { activationState } from "@/server/dashboard/activation";
import { AccountHeader } from "@/components/dashboard/AccountHeader";
import { SubscriptionCard } from "@/components/dashboard/SubscriptionCard";
import { DevicesCard } from "@/components/dashboard/DevicesCard";
import { SettingsSyncCard } from "@/components/dashboard/SettingsSyncCard";
import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { ActivatingBanner } from "@/components/dashboard/ActivatingBanner";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const session = await auth();
  const accountId = (session as any)?.accountId as string | undefined;
  if (!accountId) redirect("/api/auth/signin");

  const { env } = getCloudflareContext();
  const data = await getDashboardData(env.DB, accountId);
  if (!data) redirect("/api/auth/signin");

  const isPro = data.subscription?.status === "active";
  const { checkout } = await searchParams;
  const banner = activationState(checkout, isPro);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Your account</h1>
        <SignOutButton />
      </div>
      {banner === "activating" ? <div className="mb-6"><ActivatingBanner /></div> : null}
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <AccountHeader user={data.user} isPro={isPro} />
        </div>
        <SubscriptionCard subscription={data.subscription} />
        <DevicesCard devices={data.devices} />
        <SettingsSyncCard backup={data.backup} />
      </div>
    </main>
  );
}

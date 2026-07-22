/** Injectable email delivery seam — mirrors the extension's TelegramSender pattern. */
export type KeyDeliverer = (email: string, licenseKey: string) => Promise<void>;

/** v1 default: the success page is the delivery channel, so email is a no-op. */
export const noopDeliverer: KeyDeliverer = async () => {};

export type EmailSender = (message: {
  from: string;
  to: string;
  subject: string;
  text: string;
}) => Promise<void>;

/**
 * Built + tested now, wired later. Enable by swapping the default deliverer once a
 * verified sending domain + `send_email` binding exist (spec §4.7). Not wired in v1.
 */
export function CloudflareEmailDeliverer(send: EmailSender, from: string): KeyDeliverer {
  return async (email, licenseKey) => {
    await send({
      from,
      to: email,
      subject: "Your AI Coding Alerts Pro license key",
      text:
        `Thanks for upgrading to AI Coding Alerts Pro!\n\n` +
        `Your license key:\n\n    ${licenseKey}\n\n` +
        `In VS Code, run "AI Coding Alerts: Enter Pro License" and paste this key.`
    });
  };
}

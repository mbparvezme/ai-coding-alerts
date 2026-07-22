import { describe, it, expect } from "vitest";
import { noopDeliverer, CloudflareEmailDeliverer, type EmailSender } from "../../src/license/deliver";

describe("noopDeliverer", () => {
  it("resolves without doing anything", async () => {
    await expect(noopDeliverer("a@b.com", "ACA-1")).resolves.toBeUndefined();
  });
});

describe("CloudflareEmailDeliverer", () => {
  it("sends an email containing the license key to the buyer", async () => {
    const sent: Array<{ from: string; to: string; subject: string; text: string }> = [];
    const send: EmailSender = async (m) => { sent.push(m); };
    const deliver = CloudflareEmailDeliverer(send, "licenses@aicodingalert.com");

    await deliver("buyer@example.com", "ACA-ABCDE-FGHIJ-KLMNP-QRSTU");

    expect(sent).toHaveLength(1);
    expect(sent[0].from).toBe("licenses@aicodingalert.com");
    expect(sent[0].to).toBe("buyer@example.com");
    expect(sent[0].text).toContain("ACA-ABCDE-FGHIJ-KLMNP-QRSTU");
  });
});

import { describe, it, expect } from "vitest";
import { generateLicenseKey } from "../../src/license/keygen";

describe("generateLicenseKey", () => {
  it("matches the ACA-XXXXX-XXXXX-XXXXX-XXXXX shape", () => {
    expect(generateLicenseKey()).toMatch(/^ACA(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
  });

  it("is unguessable — 1000 keys are all unique", () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateLicenseKey()));
    expect(keys.size).toBe(1000);
  });
});

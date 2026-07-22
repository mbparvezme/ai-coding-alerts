import { describe, it, expect } from "vitest";
import { base64urlEncode, base64urlEncodeString, bytesToHex, sha256Hex } from "../../src/lib/encoding";

describe("encoding", () => {
  it("base64url has no +, /, or = padding", () => {
    const out = base64urlEncode(new Uint8Array([251, 255, 191]));
    expect(out).not.toMatch(/[+/=]/);
  });

  it("base64urlEncodeString round-trips ASCII to url-safe base64", () => {
    expect(base64urlEncodeString("ab")).toBe("YWI");
  });

  it("bytesToHex zero-pads each byte", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255]))).toBe("000fff");
  });

  it("sha256Hex matches the known digest of 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

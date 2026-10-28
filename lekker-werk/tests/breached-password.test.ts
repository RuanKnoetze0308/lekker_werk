import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertPasswordNotBreached } from "@/server/auth/breached-password";

const suffix = (pw: string) => createHash("sha1").update(pw).digest("hex").toUpperCase().slice(5);
const fakeFetch = (body: string, ok = true) => (async () => ({ ok, text: async () => body })) as unknown as typeof fetch;

describe("assertPasswordNotBreached", () => {
  it("refuses a password in the breach list", async () => {
    await expect(assertPasswordNotBreached("Password123", fakeFetch(`AAAA:1\r\n${suffix("Password123")}:52000\r\n`))).rejects.toThrow(/breach/);
  });

  it("ignores padding entries and unlisted passwords", async () => {
    await expect(assertPasswordNotBreached("Password123", fakeFetch(`${suffix("Password123")}:0`))).resolves.toBeUndefined();
    await expect(assertPasswordNotBreached("Tr0ub4dor&3xyz", fakeFetch("AAAA:3"))).resolves.toBeUndefined();
  });

  it("lets the password through when the service is down", async () => {
    await expect(assertPasswordNotBreached("Password123", fakeFetch("", false))).resolves.toBeUndefined();
    const failing = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    await expect(assertPasswordNotBreached("Password123", failing)).resolves.toBeUndefined();
  });
});

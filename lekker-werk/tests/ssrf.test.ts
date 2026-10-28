import { describe, expect, it } from "vitest";
import { assertPublicHttpsUrl, isPrivateAddress, publicFetch } from "@/lib/ssrf";

describe("isPrivateAddress", () => {
  it("blocks internal and reserved IPv4", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.100.1.1", "0.0.0.0", "198.18.0.1", "224.0.0.1", "255.255.255.255"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("blocks internal IPv6, including IPv4-mapped and NAT64 forms", () => {
    for (const ip of ["::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe", "64:ff9b::a00:1", "ff02::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows public addresses and rejects junk", () => {
    for (const ip of ["8.8.8.8", "41.0.0.1", "2606:4700::1111", "::ffff:8.8.8.8"]) expect(isPrivateAddress(ip), ip).toBe(false);
    expect(isPrivateAddress("not-an-ip")).toBe(true);
  });
});

describe("assertPublicHttpsUrl / publicFetch", () => {
  it("refuses http, credentials in the URL and internal hosts", async () => {
    await expect(assertPublicHttpsUrl("http://example.com")).rejects.toThrow(/https/);
    await expect(assertPublicHttpsUrl("https://user:pw@example.com")).rejects.toThrow(/credential/);
    await expect(assertPublicHttpsUrl("https://127.0.0.1/")).rejects.toThrow(/not allowed/);
    await expect(assertPublicHttpsUrl("https://[::1]/")).rejects.toThrow(/not allowed/);
    await expect(assertPublicHttpsUrl("https://localhost/")).rejects.toThrow(/not allowed/);
    await expect(publicFetch("https://169.254.169.254/latest/meta-data")).rejects.toThrow(/not allowed/);
  });
});

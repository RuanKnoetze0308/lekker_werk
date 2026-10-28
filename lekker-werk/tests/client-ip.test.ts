import { describe, expect, it } from "vitest";
import { clientIpFrom } from "@/server/http/client-ip";

const h = (xff?: string) => new Headers(xff === undefined ? {} : { "x-forwarded-for": xff });

describe("clientIpFrom", () => {
  it("takes the address our proxy added, not one the caller wrote", () => {
    expect(clientIpFrom(h("6.6.6.6, 41.13.2.9"))).toBe("41.13.2.9");
    expect(clientIpFrom(h("41.13.2.9"))).toBe("41.13.2.9");
  });

  it("counts extra trusted hops from the right", () => {
    expect(clientIpFrom(h("6.6.6.6, 41.13.2.9, 10.0.0.1"), 2)).toBe("41.13.2.9");
    expect(clientIpFrom(h("41.13.2.9"), 3)).toBe("41.13.2.9");
  });

  it("accepts IPv6 and rejects junk", () => {
    expect(clientIpFrom(h("2001:db8::1"))).toBe("2001:db8::1");
    expect(clientIpFrom(h("not-an-ip"))).toBe("unknown");
    expect(clientIpFrom(h())).toBe("unknown");
    expect(clientIpFrom(h(" , "))).toBe("unknown");
  });
});

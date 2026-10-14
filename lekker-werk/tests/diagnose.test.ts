import { describe, expect, it } from "vitest";
import { diagnose } from "@/server/http/diagnose";

describe("diagnose", () => {
  it("reads the Postgres SQLSTATE through a wrapped (Drizzle) error", () => {
    const pg = Object.assign(new Error('column "mode" does not exist'), { code: "42703" });
    const wrapped = Object.assign(new Error("Failed query: insert into qr_codes ..."), { cause: pg });
    expect(diagnose(wrapped)).toMatchObject({ diagnostic: "LW-DB-42703" });
    expect(diagnose(wrapped).hint).toMatch(/migration/);
  });

  it("uses the code carried by config errors", () => {
    const e = Object.assign(new Error("bad key"), { diagnostic: "LW-CFG-02" });
    expect(diagnose(e).diagnostic).toBe("LW-CFG-02");
  });

  it("recognises a wrong encryption key on decrypt", () => {
    expect(diagnose(new Error("Unsupported state or unable to authenticate data")).diagnostic).toBe("LW-CFG-03");
  });

  it("maps network failures and falls back to the error class", () => {
    expect(diagnose(Object.assign(new Error("x"), { code: "ECONNREFUSED" })).diagnostic).toBe("LW-NET-ECONNREFUSED");
    expect(diagnose(new TypeError("x")).diagnostic).toBe("LW-INT-TypeError");
    expect(diagnose("boom").diagnostic).toBe("LW-INT-string");
  });
});

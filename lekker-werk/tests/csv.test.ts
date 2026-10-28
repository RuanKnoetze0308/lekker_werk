import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/csv";

describe("csvCell", () => {
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+27 82")).toBe("'+27 82");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-cmd")).toBe("'-cmd");
  });

  it("leaves numbers and normal text alone", () => {
    expect(csvCell("-1.50")).toBe("-1.50");
    expect(csvCell(-2)).toBe("-2");
    expect(csvCell("8.00")).toBe("8.00");
    expect(csvCell("Thabo Nkosi")).toBe("Thabo Nkosi");
    expect(csvCell(null)).toBe("");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("Smith, J")).toBe("\"Smith, J\"");
    expect(csvCell("a\nb")).toBe("\"a\nb\"");
  });
});

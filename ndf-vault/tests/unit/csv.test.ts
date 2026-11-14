import { describe, expect, it } from "vitest";
import { csvCell, parseCsv, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads commas, semicolons and tabs", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a;b\r\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb")).toEqual([["a", "b"]]);
  });

  it("reads quoted cells with separators, quotes and line breaks inside", () => {
    expect(parseCsv('Poste,"1 200,50","Il a dit ""oui"""\n')).toEqual([["Poste", "1 200,50", 'Il a dit "oui"']]);
    expect(parseCsv('"deux\nlignes",x')).toEqual([["deux\nlignes", "x"]]);
  });

  it("stops at the row limit", () => {
    expect(parseCsv("1\n2\n3\n4\n", 2)).toEqual([["1"], ["2"]]);
  });
});

describe("csvCell", () => {
  it("quotes cells that need it", () => {
    expect(csvCell("simple")).toBe("simple");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvCell("deux\nlignes")).toBe('"deux\nlignes"');
  });

  it("defuses values a spreadsheet would run as a formula", () => {
    for (const evil of ["=HYPERLINK(\"http://evil\",\"clic\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1+1", "\r=1+1"]) {
      const cell = csvCell(evil);
      const inner = cell.startsWith('"') ? cell.slice(1) : cell;
      expect(inner.startsWith("'"), evil).toBe(true);
    }
    expect(csvCell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
  });

  it("leaves ordinary values that merely contain those characters", () => {
    expect(csvCell("Budget = 100")).toBe("Budget = 100");
    expect(csvCell("a-b")).toBe("a-b");
  });
});

describe("toCsv", () => {
  it("writes rows that read back the same", () => {
    const rows = [["Date", "Qui", "Fichier"], ["13 nov. 2026", "Admin NDF5", 'Contrat "final", v2.pdf']];
    const text = toCsv(rows);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(parseCsv(text.slice(1))).toEqual(rows);
  });
});

import { describe, expect, it } from "vitest";
import { classifyFormat, columnIndex, columnName, inspectOffice, OfficeError, readDocx, readPptx, readXlsx, resolvePart, serialToText, showNumber, MAX_SHEET_COLS, MAX_SHEET_ROWS } from "@/lib/office";
import { docx, para, pptx, table, xlsx, zipBuffer } from "../fixtures/office";

const blob = (b: Buffer) => new Blob([new Uint8Array(b)]);

describe("checking an Office file before accepting it", () => {
  it("accepts real documents of the right kind", async () => {
    expect(await inspectOffice(blob(docx(para("x"))), "docx")).toBe("ok");
    expect(await inspectOffice(blob(xlsx([{ name: "A", rows: [[1]] }])), "xlsx")).toBe("ok");
    expect(await inspectOffice(blob(pptx([{ title: "x" }])), "pptx")).toBe("ok");
  });

  it("tells a spreadsheet renamed .docx from a plain ZIP renamed .docx", async () => {
    expect(await inspectOffice(blob(xlsx([{ name: "A", rows: [[1]] }])), "docx")).toBe("wrong-format");
    expect(await inspectOffice(blob(zipBuffer([{ name: "photos/a.txt", data: "x" }])), "docx")).toBe("not-office");
    expect(await inspectOffice(new Blob(["PK\u0003\u0004 pas une archive"]), "docx")).toBe("not-office");
  });

  it("refuses macros and ActiveX controls, wherever they hide", async () => {
    expect(await inspectOffice(blob(docx(para("x"), [{ name: "word/vbaProject.bin", data: "macro" }])), "docx")).toBe("active-content");
    expect(await inspectOffice(blob(xlsx([{ name: "A", rows: [[1]] }], { extra: [{ name: "xl/VBAPROJECT.BIN", data: "macro" }] })), "xlsx")).toBe("active-content");
    expect(await inspectOffice(blob(pptx([{ title: "x" }], [{ name: "ppt/activeX/activeX1.bin", data: "ctl" }])), "pptx")).toBe("active-content");
  });
});

describe("Word", () => {
  it("reads headings, paragraphs, emphasis, lists, alignment and tables", async () => {
    const body =
      para("Entente de coproduction", { style: "Titre1" }) +
      para("Article 1 — Objet", { style: "Clause" }) +
      para("Texte en gras.", { props: "<w:b/><w:i w:val=\"0\"/>" }) +
      para("Texte souligné et italique.", { props: '<w:i/><w:u w:val="single"/>' }) +
      para("Premier point", { list: true }) +
      para("Centré", { align: "center" }) +
      table([["Poste", "Responsable"], ["Décors", "Service production"]]);
    const { blocks, truncated } = await readDocx(blob(docx(body)));
    expect(truncated).toBe(false);
    expect(blocks).toEqual([
      { type: "paragraph", heading: 1, list: false, align: "left", runs: [{ text: "Entente de coproduction" }] },
      // "Clause" is a custom style based on a level-2 heading.
      { type: "paragraph", heading: 2, list: false, align: "left", runs: [{ text: "Article 1 — Objet" }] },
      { type: "paragraph", heading: 0, list: false, align: "left", runs: [{ text: "Texte en gras.", bold: true }] },
      { type: "paragraph", heading: 0, list: false, align: "left", runs: [{ text: "Texte souligné et italique.", italic: true, underline: true }] },
      { type: "paragraph", heading: 0, list: true, align: "left", runs: [{ text: "Premier point" }] },
      { type: "paragraph", heading: 0, list: false, align: "center", runs: [{ text: "Centré" }] },
      { type: "table", rows: [["Poste", "Responsable"], ["Décors", "Service production"]] },
    ]);
  });

  it("merges runs of the same style, keeps spaces, tabs and line breaks, and follows hyperlinks", async () => {
    const body = `<w:p><w:r><w:t xml:space="preserve">Un </w:t></w:r><w:r><w:t>seul</w:t></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r><w:hyperlink r:id="rId9"><w:r><w:t>lien</w:t></w:r></w:hyperlink><w:r><w:tab/><w:t>après</w:t><w:br/><w:t>ligne 2</w:t></w:r></w:p>`;
    const { blocks } = await readDocx(blob(docx(body)));
    expect(blocks).toEqual([{ type: "paragraph", heading: 0, list: false, align: "left", runs: [{ text: "Un seul lien\taprès\nligne 2" }] }]);
  });

  it("leaves out text deleted under track changes and keeps what was inserted", async () => {
    const body = `<w:p><w:r><w:t xml:space="preserve">Le prix est de </w:t></w:r><w:del><w:r><w:delText>100</w:delText></w:r></w:del><w:ins><w:r><w:t>250</w:t></w:r></w:ins><w:r><w:t xml:space="preserve"> dollars.</w:t></w:r></w:p>`;
    const { blocks } = await readDocx(blob(docx(body)));
    expect(blocks[0]).toMatchObject({ runs: [{ text: "Le prix est de 250 dollars." }] });
  });

  it("marks page breaks and collapses runs of empty paragraphs", async () => {
    const empty = "<w:p/>";
    const body = empty + para("Page 1") + empty + empty + empty + `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` + para("Page 2") + empty + empty;
    const { blocks } = await readDocx(blob(docx(body)));
    expect(blocks.map((b) => (b.type === "paragraph" ? b.runs.map((r) => r.text).join("") : b.type))).toEqual(["Page 1", "", "pageBreak", "Page 2"]);
  });

  it("reads content controls and never treats document text as markup", async () => {
    const body = `<w:sdt><w:sdtContent>${para("<script>alert(1)</script> & <b>gras</b>")}</w:sdtContent></w:sdt>`;
    const { blocks } = await readDocx(blob(docx(body)));
    expect(blocks[0]).toMatchObject({ runs: [{ text: "<script>alert(1)</script> & <b>gras</b>" }] });
  });

  it("stops at a limit on very long documents and says so", async () => {
    const { blocks, truncated } = await readDocx(blob(docx(Array.from({ length: 1800 }, (_, i) => para(`Ligne ${i}`)).join(""))));
    expect(blocks).toHaveLength(1500);
    expect(truncated).toBe(true);
  });

  it("explains why a preview cannot be built", async () => {
    const reason = async (b: Blob) => {
      try {
        await readDocx(b);
      } catch (e) {
        return e instanceof OfficeError ? e.reason : "other";
      }
      return "none";
    };
    expect(await reason(new Blob(["pas un zip"]))).toBe("unreadable");
    expect(await reason(blob(zipBuffer([{ name: "word/document.xml", data: "<w:document><w:body>" }])))).toBe("unreadable");
    expect(await reason(blob(zipBuffer([{ name: "autre.xml", data: "<a/>" }])))).toBe("unreadable");
    // A document that declares entities is refused rather than expanded.
    expect(await reason(blob(zipBuffer([{ name: "word/document.xml", data: `<!DOCTYPE d [<!ENTITY a "aaaa">]><w:document><w:body><w:p><w:r><w:t>&a;</w:t></w:r></w:p></w:body></w:document>` }])))).toBe("unreadable");
    expect(await reason(blob(zipBuffer([{ name: "word/document.xml", data: Buffer.alloc(30 * 1024 * 1024, 0x20) }])))).toBe("too-large");
  });
});

describe("Excel", () => {
  it("reads sheets in order, with text, numbers, booleans and formula results", async () => {
    const book = xlsx([
      { name: "Budget", rows: [["Poste", "Montant", "Payé"], ["Décors", 1200.5, true], ["Costumes", 0.1 + 0.2, false], ["Total", { f: "SUM(B2:B3)", v: 1200.8 }, { f: 'IF(1,"oui","non")', v: "oui" }]] },
      { name: "Notes", rows: [["Une seule cellule"]] },
    ]);
    const { sheets, truncated } = await readXlsx(blob(book));
    expect(truncated).toBe(false);
    expect(sheets.map((s) => s.name)).toEqual(["Budget", "Notes"]);
    expect(sheets[0].rows).toEqual([["Poste", "Montant", "Payé"], ["Décors", "1200,5", "VRAI"], ["Costumes", "0,3", "FAUX"], ["Total", "1200,8", "oui"]]);
    expect(sheets[1].rows).toEqual([["Une seule cellule"]]);
  });

  it("shows dates, date-times and percentages as such, in both date systems", async () => {
    // 46340 is 2026-11-14 in the 1900 system.
    const rows = [[{ v: 46340, s: 1 }, { v: 0.125, s: 2 }, { v: 46340.75, s: 3 }, { v: 46340, s: 0 }]];
    expect((await readXlsx(blob(xlsx([{ name: "A", rows }])))).sheets[0].rows).toEqual([["2026-11-14", "12,5 %", "2026-11-14 18:00", "46340"]]);
    expect((await readXlsx(blob(xlsx([{ name: "A", rows: [[{ v: 44878, s: 1 }]] }], { date1904: true })))).sheets[0].rows).toEqual([["2026-11-14"]]);
  });

  it("keeps the position of cells across empty rows and columns", async () => {
    const { sheets } = await readXlsx(blob(xlsx([{ name: "A", rows: [["a", null, "c"], [], [], [null, "b2"]] }])));
    expect(sheets[0].rows).toEqual([["a", "", "c"], ["", "", ""], ["", "", ""], ["", "b2", ""]]);
  });

  it("shows hidden sheets, flagged as hidden", async () => {
    const { sheets } = await readXlsx(blob(xlsx([{ name: "Visible", rows: [[1]] }, { name: "Marges", rows: [["confidentiel"]], hidden: true }])));
    expect(sheets.map((s) => [s.name, s.hidden])).toEqual([["Visible", false], ["Marges", true]]);
    expect(sheets[1].rows).toEqual([["confidentiel"]]);
  });

  it("caps rows and columns and says the sheet is cut", async () => {
    const tall = Array.from({ length: MAX_SHEET_ROWS + 50 }, (_, i) => [i]);
    const wide = [Array.from({ length: MAX_SHEET_COLS + 5 }, (_, i) => i)];
    const { sheets } = await readXlsx(blob(xlsx([{ name: "Haute", rows: tall }, { name: "Large", rows: wide }, { name: "Petite", rows: [[1]] }])));
    expect(sheets[0].rows).toHaveLength(MAX_SHEET_ROWS);
    expect(sheets[0].truncated).toBe(true);
    expect(sheets[1].rows[0]).toHaveLength(MAX_SHEET_COLS);
    expect(sheets[1].truncated).toBe(true);
    expect(sheets[2].truncated).toBe(false);
  });

  it("never follows a relationship that points outside the file", async () => {
    const rels = `<Relationships><Relationship Id="rId1" Target="https://exemple.invalid/feuille.xml" TargetMode="External"/></Relationships>`;
    const book = zipBuffer([
      { name: "[Content_Types].xml", data: "<Types/>" },
      { name: "xl/workbook.xml", data: `<workbook xmlns:r="urn:r"><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", data: rels },
      { name: "xl/worksheets/sheet1.xml", data: `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>locale</t></is></c></row></sheetData></worksheet>` },
    ]);
    // The external link is ignored; the sheet falls back to its conventional place in the file.
    expect((await readXlsx(blob(book))).sheets[0].rows).toEqual([["locale"]]);
  });

  it("knows its cell references and number formats", () => {
    expect([columnIndex("A1"), columnIndex("Z9"), columnIndex("AA10"), columnIndex("xfd1"), columnIndex("12")]).toEqual([0, 25, 26, 16383, -1]);
    expect([0, 25, 26, 16383].map(columnName)).toEqual(["A", "Z", "AA", "XFD"]);
    expect(classifyFormat("yyyy-mm-dd")).toBe("date");
    expect(classifyFormat('[$-C0C]d mmmm yyyy;@')).toBe("date");
    expect(classifyFormat("h:mm AM/PM")).toBe("time");
    expect(classifyFormat("dd/mm/yyyy hh:mm")).toBe("datetime");
    expect(classifyFormat("0.00%")).toBe("percent");
    expect(classifyFormat('#,##0.00 "$"')).toBeNull();
    expect(classifyFormat('0.0 "jours"')).toBeNull(); // the d, y, h and s of quoted text do not count
    expect(classifyFormat("[Red]0.00")).toBeNull();
    // A number format is never megabytes long; one that is must not cost anything to look at.
    const start = performance.now();
    expect(classifyFormat("[".repeat(2_000_000))).toBeNull();
    expect(performance.now() - start).toBeLessThan(500);
    expect(showNumber(0.1 + 0.2)).toBe("0,3");
    expect(showNumber(2026)).toBe("2026");
    expect(serialToText(46340.5, "datetime")).toBe("2026-11-14 12:00");
    expect(serialToText(0.5, "time")).toBe("12:00");
  });
});

describe("size limits", () => {
  it("refuses a document whose parts add up to more than the preview will inflate", async () => {
    // Fifty slides of 3 MB each: every part is under the per-part limit, the whole is not.
    const filler = `<!-- ${"x".repeat(3 * 1024 * 1024)} -->`;
    const slide = `<p:sld><p:cSld><p:spTree>${filler}</p:spTree></p:cSld></p:sld>`;
    const parts = Array.from({ length: 50 }, (_, i) => ({ name: `ppt/slides/slide${i + 1}.xml`, data: slide }));
    const deck = zipBuffer([{ name: "ppt/presentation.xml", data: "<p:presentation/>" }, ...parts]);
    expect(deck.length).toBeLessThan(2 * 1024 * 1024); // small on disk
    let reason = "none";
    try {
      await readPptx(blob(deck));
    } catch (e) {
      reason = e instanceof OfficeError ? e.reason : "other";
    }
    expect(reason).toBe("too-large");
  }, 30_000);
});

describe("PowerPoint", () => {
  it("reads slides in show order, not file order, with titles, bullets and levels", async () => {
    const deck = pptx([
      { title: "Présentation du projet", lines: ["Sous-titre"] },
      { title: "Calendrier", lines: ["Préproduction", { text: "Repérages", level: 1 }, "Tournage"] },
      { lines: ["Diapositive sans titre"] },
    ]);
    const { slides, truncated } = await readPptx(blob(deck));
    expect(truncated).toBe(false);
    expect(slides.map((s) => s.title)).toEqual(["Présentation du projet", "Calendrier", null]);
    expect(slides[1].lines).toEqual([{ text: "Préproduction", level: 0 }, { text: "Repérages", level: 1 }, { text: "Tournage", level: 0 }]);
    expect(slides[2].lines).toEqual([{ text: "Diapositive sans titre", level: 0 }]);
  });

  it("brings out speaker notes and hidden slides", async () => {
    const { slides } = await readPptx(blob(pptx([{ title: "Visible", notes: "Ne pas mentionner le budget." }, { title: "Annexe", hidden: true }])));
    expect(slides.map((s) => [s.title, s.hidden, s.notes])).toEqual([["Visible", false, "Ne pas mentionner le budget."], ["Annexe", true, ""]]);
  });

  it("falls back to file order when the presentation does not list its slides", async () => {
    const deck = zipBuffer([
      { name: "ppt/presentation.xml", data: "<p:presentation/>" },
      { name: "ppt/slides/slide10.xml", data: "<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>dix</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>" },
      { name: "ppt/slides/slide2.xml", data: "<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>deux</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>" },
    ]);
    expect((await readPptx(blob(deck))).slides.map((s) => s.lines[0].text)).toEqual(["deux", "dix"]);
  });
});

describe("part paths", () => {
  it("resolves relative and absolute targets without leaving the archive root", () => {
    expect(resolvePart("xl", "worksheets/sheet1.xml")).toBe("xl/worksheets/sheet1.xml");
    expect(resolvePart("ppt/slides", "../notesSlides/notesSlide1.xml")).toBe("ppt/notesSlides/notesSlide1.xml");
    expect(resolvePart("xl", "/xl/worksheets/sheet2.xml")).toBe("xl/worksheets/sheet2.xml");
    expect(resolvePart("xl", "../../../../etc/passwd")).toBe("etc/passwd");
  });
});

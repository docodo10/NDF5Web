import { describe, expect, it } from "vitest";
import { cleanText, fold, indexText, MAX_TEXT_CHARS, queryTerms, searchText } from "@/lib/search";

const doc = (...pages: string[]) => indexText({ pages });

describe("folding", () => {
  it("lowers case and removes accents, one character for one character", () => {
    expect(fold("Décors d’Été — ÇA, Noël, où, Œuvre")).toBe("decors d’ete — ca, noel, ou, œuvre");
    for (const s of ["Éléphant à l’île", "ßtraße İstanbul", "日本語 text", "emoji 🎬 fin", "á décomposé"]) expect(fold(s).length, s).toBe(s.length);
  });

  it("splits a query into folded words", () => {
    expect(queryTerms("  Clause   DÉCORS ")).toEqual(["clause", "decors"]);
    expect(queryTerms("")).toEqual([]);
  });
});

describe("cleaning extracted text", () => {
  it("collapses spaces, keeps paragraphs, and drops control and direction characters", () => {
    expect(cleanText("  Titre \t du document \r\n\r\n\r\n\r\n  Suite\u0000 du‮ texte  ")).toBe("Titre du document\n\nSuite du texte");
  });

  it("composes characters so that accents are single characters", () => {
    expect(cleanText("décors")).toBe("décors");
  });
});

describe("searching a document", () => {
  const contract = doc("Entente de coproduction\nEntre les parties soussignées.", "Article 4 — Les décors seront livrés à Montréal avant le tournage. Les Décors restent la propriété du producteur.", "Annexe : calendrier de tournage.");

  it("finds a word whatever its case or accents, and says where", () => {
    const hit = searchText(contract, "DECORS")!;
    expect(hit.page).toBe(1);
    expect(hit.match).toBe("décors");
    expect(hit.before.endsWith("Les ")).toBe(true);
    expect(hit.after.startsWith(" seront livrés")).toBe(true);
    expect(hit.count).toBe(2);
  });

  it("shows the phrase when the words appear together", () => {
    const hit = searchText(contract, "calendrier de tournage")!;
    expect(hit).toMatchObject({ page: 2, match: "calendrier de tournage", phrase: true });
  });

  it("requires every word, anywhere in the document", () => {
    const hit = searchText(contract, "montréal coproduction")!;
    expect(hit.phrase).toBe(false);
    expect(hit.match).toBe("Montréal");
    expect(searchText(contract, "montréal licorne")).toBeNull();
  });

  it("ignores queries too short to mean anything", () => {
    expect(searchText(contract, "de")).toBeNull();
    expect(searchText(contract, " a ")).toBeNull();
    expect(searchText(contract, "")).toBeNull();
  });

  it("cuts the excerpt from the original text, with ellipses where it was cut", () => {
    const long = doc(`${"mot ".repeat(100)}Clause confidentielle numéro quarante-deux ${"fin ".repeat(100)}`);
    const hit = searchText(long, "confidentielle")!;
    expect(hit.before.startsWith("…")).toBe(true);
    expect(hit.after.endsWith("…")).toBe(true);
    expect(`${hit.before}${hit.match}${hit.after}`).toContain("Clause confidentielle numéro quarante-deux");
    expect(hit.before.length).toBeLessThan(70);
    const short = doc("Clause unique.");
    expect(searchText(short, "clause")).toMatchObject({ before: "", match: "Clause", after: " unique." });
  });

  it("puts an excerpt that spans lines on one line", () => {
    expect(searchText(doc("Première ligne\nmot cherché\nligne suivante"), "cherché")).toMatchObject({ before: "Première ligne mot ", after: " ligne suivante" });
  });

  it("treats the document as text, whatever it contains", () => {
    const hit = searchText(doc("Avant <script>alert(1)</script> après"), "alert")!;
    expect(`${hit.before}${hit.match}${hit.after}`).toBe("Avant <script>alert(1)</script> après");
    expect(searchText(doc("prix (net) [2026] .* $"), "(net) [2026] .*")).toMatchObject({ match: "(net) [2026] .*" });
  });
});

describe("limits", () => {
  it("keeps at most a fixed amount of text per document", () => {
    const big = "abcdefghi ".repeat(150_000); // 1.5 million characters per page
    const indexed = indexText({ pages: [big, `${big} aiguille`, "troisième"] });
    expect(indexed.pages.reduce((n, p) => n + p.length, 0)).toBeLessThanOrEqual(MAX_TEXT_CHARS);
    expect(indexed.pages[2]).toBe("");
    expect(searchText(indexed, "aiguille")).toBeNull();
    for (const [i, p] of indexed.pages.entries()) expect(indexed.folded[i].length).toBe(p.length);
  });

  it("searches a large document quickly", () => {
    const indexed = indexText({ pages: Array.from({ length: 300 }, (_, i) => `Page ${i} ${"lorem ipsum dolor sit amet ".repeat(200)}`) });
    const start = performance.now();
    for (let i = 0; i < 20; i++) expect(searchText(indexed, "introuvable ailleurs")).toBeNull();
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

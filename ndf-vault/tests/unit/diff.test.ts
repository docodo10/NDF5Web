import { describe, expect, it } from "vitest";
import { diffText, foldUnchanged, words, type DiffPart } from "@/lib/diff";

const shape = (parts: DiffPart[]) => parts.map((p) => `${p.type === "same" ? "=" : p.type === "added" ? "+" : "-"}${p.text}`);
const rebuild = (parts: DiffPart[], side: "before" | "after") => parts.filter((p) => p.type === "same" || p.type === (side === "before" ? "removed" : "added")).map((p) => p.text).join("");

describe("cutting a text into words", () => {
  it("keeps every character, so the pieces join back into the text", () => {
    for (const text of ["Le prix est de 250 $, payable à l’ordre de la société.", "  deux  espaces\n\nnouvelle ligne\t", "", "aujourd’hui c’est l’avant-première"]) expect(words(text).join("")).toBe(text);
  });

  it("treats a word with an apostrophe or a hyphen as one word", () => {
    expect(words("l’avant-première d'hier")).toEqual(["l’avant-première", " ", "d'hier"]);
  });
});

describe("comparing two versions", () => {
  it("reports nothing when the texts are the same", () => {
    const r = diffText("Texte identique.", "Texte identique.");
    expect(shape(r.parts)).toEqual(["=Texte identique."]);
    expect(r).toMatchObject({ added: 0, removed: 0, rewritten: false, unit: "words" });
  });

  it("shows a replaced word as a removal followed by an addition", () => {
    const r = diffText("Le prix est de 100 dollars.", "Le prix est de 250 dollars.");
    expect(shape(r.parts)).toEqual(["=Le prix est de ", "-100", "+250", "= dollars."]);
    expect(r).toMatchObject({ added: 1, removed: 1 });
  });

  it("finds additions and removals anywhere in the text", () => {
    const before = "Article 1. Le producteur livre le film. Article 2. Le distributeur paie.";
    const after = "Préambule. Article 1. Le producteur livre le film terminé. Article 2. Le distributeur paie.";
    const r = diffText(before, after);
    expect(r.parts.filter((p) => p.type === "added").map((p) => p.text.trim())).toEqual(["Préambule.", "terminé"]);
    expect(r.parts.some((p) => p.type === "removed")).toBe(false);
    expect(r.added).toBe(2);
  });

  it("always describes both texts exactly", () => {
    const pairs: [string, string][] = [
      ["", "tout est nouveau"],
      ["tout disparaît", ""],
      ["a b c d e f", "f e d c b a"],
      ["Première ligne\nDeuxième ligne\n", "Première ligne\nUne ligne ajoutée\nDeuxième ligne modifiée\n"],
      ["même début, fin différente", "même début, fin changée"],
    ];
    for (const [before, after] of pairs) {
      const r = diffText(before, after);
      expect(rebuild(r.parts, "before"), before).toBe(before);
      expect(rebuild(r.parts, "after"), after).toBe(after);
    }
  });

  it("compares very long texts line by line, and still gets them right", () => {
    const line = (i: number) => `Ligne ${i} : ${"mot ".repeat(8)}\n`;
    const before = Array.from({ length: 2500 }, (_, i) => line(i)).join("");
    const after = before.replace(line(1200), "Ligne 1200 réécrite entièrement\n") + "Une ligne de plus à la fin\n";
    const r = diffText(before, after);
    expect(r.unit).toBe("lines");
    expect(rebuild(r.parts, "after")).toBe(after);
    expect(r.parts.filter((p) => p.type === "added").map((p) => p.text)).toEqual(["Ligne 1200 réécrite entièrement\n", "Une ligne de plus à la fin\n"]);
  });

  it("says so when the two texts have nothing in common, instead of pretending to list changes", () => {
    const before = Array.from({ length: 5000 }, (_, i) => `avant${i}`).join(" ");
    const after = Array.from({ length: 5000 }, (_, i) => `après${i}`).join(" ");
    const r = diffText(before, after);
    expect(r.rewritten).toBe(true);
    expect(shape(r.parts).map((s) => s[0])).toEqual(["-", "+"]);
    expect(r).toMatchObject({ added: 5000, removed: 5000 });
  });

  it("stays fast on a long contract with scattered edits", () => {
    const before = Array.from({ length: 9000 }, (_, i) => `mot${i % 700}`).join(" ");
    const after = before.replace(/mot350/g, "terme350");
    const start = performance.now();
    const r = diffText(before, after);
    expect(performance.now() - start).toBeLessThan(3000);
    expect(r.rewritten).toBe(false);
    expect(r.added).toBe(r.removed);
  });
});

describe("folding what did not change", () => {
  it("keeps the changes with a little context and folds the long stretches between them", () => {
    const filler = "x".repeat(1000);
    const view = foldUnchanged([{ type: "same", text: filler }, { type: "removed", text: "ancien" }, { type: "added", text: "nouveau" }, { type: "same", text: filler }, { type: "added", text: "fin" }, { type: "same", text: "court" }], 100);
    expect(view.map((p) => (p.type === "gap" ? `gap ${p.hidden}` : `${p.type} ${p.text.length}`))).toEqual(["gap 900", "same 100", "removed 6", "added 7", "same 100", "gap 800", "same 100", "added 3", "same 5"]);
  });

  it("leaves a short text whole", () => {
    const parts: DiffPart[] = [{ type: "same", text: "Un texte court. " }, { type: "added", text: "Un ajout." }];
    expect(foldUnchanged(parts)).toEqual(parts);
  });
});

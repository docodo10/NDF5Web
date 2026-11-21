import { afterEach, describe, expect, it } from "vitest";
import { localizeFiles, localizeFolders, localizeProjects, sampleFileName } from "@/lib/builtin";
import { count, formatDate, formatMoment, formatSize, formatTime, KIND_LABEL, STATUS_LABEL } from "@/lib/format";
import { getLang, localized, parseLang, setLangForTests, subscribeLang, t } from "@/lib/i18n";
import { journalText } from "@/lib/journal";
import { PROTECTION_HINT, PROTECTION_LABEL, PROTECTION_LABEL_FR } from "@/lib/protection";
import { FILES, FOLDERS, PROJECTS, USERS } from "@/lib/sample-data";

const inEnglish = <T>(work: () => T): T => {
  setLangForTests("en");
  try {
    return work();
  } finally {
    setLangForTests("fr");
  }
};

afterEach(() => setLangForTests("fr"));

describe("choosing the text", () => {
  it("answers in the current language, and follows a change at once", () => {
    expect(t("Téléverser", "Upload")).toBe("Téléverser");
    expect(inEnglish(() => t("Téléverser", "Upload"))).toBe("Upload");
    expect(t("Téléverser", "Upload")).toBe("Téléverser");
  });

  it("keeps label tables live instead of freezing them at load", () => {
    const labels = localized({ draft: ["Brouillon", "Draft"], final: ["Final", "Final"] });
    expect(labels.draft).toBe("Brouillon");
    expect(inEnglish(() => labels.draft)).toBe("Draft");
    expect(Object.keys(labels)).toEqual(["draft", "final"]);
    expect(inEnglish(() => ({ ...labels }))).toEqual({ draft: "Draft", final: "Final" });
  });

  it("tells whoever listens", () => {
    let calls = 0;
    const stop = subscribeLang(() => calls++);
    setLangForTests("en");
    setLangForTests("fr");
    stop();
    setLangForTests("en");
    expect(calls).toBe(2);
  });

  it("reads a language from what an address or a setting may hold", () => {
    expect(parseLang("fr")).toBe("fr");
    expect(parseLang("FR-ca")).toBe("fr");
    expect(parseLang(" en ")).toBe("en");
    expect(parseLang("en-US")).toBe("en");
    for (const bad of ["", "es", "de", null, undefined, 5, "<script>", "f"]) expect(parseLang(bad), String(bad)).toBeNull();
    expect(getLang()).toBe("fr");
  });
});

describe("dates, times and sizes", () => {
  it("are written the way each language writes them", () => {
    expect(formatDate("2026-11-14T15:04:00")).toBe("14 nov. 2026");
    expect(formatDate("2026-12-01")).toBe("1er déc. 2026");
    expect(formatTime("2026-11-14T15:04:00")).toBe("15 h 04");
    expect(formatSize(2_516_582)).toBe("2,4 Mo");
    inEnglish(() => {
      expect(formatDate("2026-11-14T15:04:00")).toBe("Nov 14, 2026");
      expect(formatDate("2026-12-01")).toBe("Dec 1, 2026");
      expect(formatTime("2026-11-14T15:04:00")).toBe("3:04 PM");
      expect(formatTime("2026-11-14T00:07:00")).toBe("12:07 AM");
      expect(formatTime("2026-11-14T12:00:00")).toBe("12:00 PM");
      expect(formatTime("2026-11-14T09:30:00")).toBe("9:30 AM");
      expect(formatSize(2_516_582)).toBe("2.4 MB");
      expect(formatSize(512)).toBe("512 B");
      expect(formatSize(84 * 1024)).toBe("84 KB");
      expect(formatSize(3.2 * 1024 ** 3)).toBe("3.2 GB");
      expect(formatMoment(new Date(2026, 10, 14, 15, 4))).toBe("Nov 14, 2026, 3:04 PM");
      expect(count(1, "file")).toBe("1 file");
      expect(count(3, "file")).toBe("3 files");
    });
  });

  it("name file kinds, statuses and protection levels in both", () => {
    expect([KIND_LABEL.xlsx, STATUS_LABEL["In Review"], PROTECTION_LABEL.view]).toEqual(["Tableur", "En révision", "Consultation seule"]);
    inEnglish(() => {
      expect([KIND_LABEL.xlsx, KIND_LABEL.pptx, KIND_LABEL.txt]).toEqual(["Spreadsheet", "Presentation", "Text"]);
      expect([STATUS_LABEL.Draft, STATUS_LABEL["In Review"], STATUS_LABEL.Approved, STATUS_LABEL.Archived]).toEqual(["Draft", "In review", "Approved", "Archived"]);
      expect([PROTECTION_LABEL.standard, PROTECTION_LABEL.view, PROTECTION_LABEL.high]).toEqual(["Standard", "View only", "High protection"]);
      expect(PROTECTION_HINT.high).toMatch(/passphrase/);
      // The journal's own wording does not move with the interface.
      expect(PROTECTION_LABEL_FR.view).toBe("Consultation seule");
    });
  });
});

describe("what the vault ships with", () => {
  it("is shown in English without being stored in English", () => {
    const folders = inEnglish(() => localizeFolders(FOLDERS));
    const name = (id: string) => folders.find((f) => f.id === id)!.name;
    expect(["start", "overview", "screenplays", "story", "production", "business", "legal", "talent", "to-sign", "signed", "qa"].map(name)).toEqual(["Start Here", "Saga Overview", "Screenplays", "Story Development", "Production", "Business and Finance", "Legal and Chain of Title", "Talent and Packaging", "To Sign", "Signed", "Q&A"]);
    expect(folders.find((f) => f.id === "legal")!.access).toBe("Level 2");
    // The stored list is untouched, and French shows it as it is.
    expect(FOLDERS.find((f) => f.id === "legal")!.name).toBe("Juridique et chaîne de titres");
    expect(localizeFolders(FOLDERS)).toBe(FOLDERS);
  });

  it("leaves alone what a person renamed, and what a person created", () => {
    const mine = [...FOLDERS.map((f) => (f.id === "legal" ? { ...f, name: "Contrats et droits" } : f)), { id: "d-x", name: "Scénarios", parentId: "root" }];
    const shown = inEnglish(() => localizeFolders(mine));
    expect(shown.find((f) => f.id === "legal")!.name).toBe("Contrats et droits");
    // Same words as a built-in folder, but someone's own folder: not touched.
    expect(shown.find((f) => f.id === "d-x")!.name).toBe("Scénarios");
    expect(shown.find((f) => f.id === "screenplays")!.name).toBe("Screenplays");
  });

  it("has an English name for every sample file, project text and department", () => {
    inEnglish(() => {
      const files = localizeFiles(FILES);
      for (const [i, f] of files.entries()) {
        expect(f.name, FILES[i].name).not.toBe(FILES[i].name);
        expect(f.name, f.name).not.toMatch(/[àâçéèêëîïôûùüœ]/i);
        for (const tag of f.tags) expect(tag, `${f.name}: ${tag}`).not.toMatch(/[àâçéèêëîïôûùüœ]/i);
      }
      expect(files[0].name).toBe("FS1 Film Part 1 Screenplay");
      for (const p of localizeProjects(PROJECTS)) expect(`${p.period} ${p.summary}`).not.toMatch(/[àâçéèêëîïôûùüœ]|prévu|Espace/i);
      expect(USERS.map((u) => [u.name, u.role, u.initials])).toEqual([["Admin NDF5", "Administration", "AN"], ["Production Office", "Production", "PO"], ["Legal Affairs", "Legal", "LA"], ["Finance Office", "Finance", "FO"], ["Story Department", "Writing", "SD"]]);
    });
    expect(USERS[1].name).toBe("Bureau de production");
  });

  it("never renames a file someone uploaded, even one named like a sample", () => {
    const uploaded = { ...FILES[0], id: "f-up", sample: false };
    expect(inEnglish(() => localizeFiles([uploaded]))[0].name).toBe(FILES[0].name);
    expect(inEnglish(() => sampleFileName("Mon contrat"))).toBe("Mon contrat");
  });
});

describe("the journal", () => {
  const entry = (verb: string, target = "") => ({ verb, target });

  it("is left as written in French", () => {
    expect(journalText(entry("a téléversé", "Contrat.pdf"))).toEqual({ verb: "a téléversé", target: "Contrat.pdf" });
  });

  it("is shown in English, entry by entry", () => {
    const en = (verb: string, target = "") => inEnglish(() => journalText(entry(verb, target)));
    expect(en("a téléversé", "Contrat.pdf")).toEqual({ verb: "uploaded", target: "Contrat.pdf" });
    expect(en("a téléversé", "3 fichiers")).toEqual({ verb: "uploaded", target: "3 files" });
    expect(en("a supprimé", "1 fichier").target).toBe("1 file");
    expect(en("a déverrouillé le Vault", "après 2 tentatives échouées")).toEqual({ verb: "unlocked the Vault", target: "after 2 failed attempts" });
    expect(en("a déverrouillé le Vault", "après 1 tentative échouée").target).toBe("after 1 failed attempt");
    expect(en("a verrouillé le Vault", "automatiquement, après une période sans activité").target).toBe("automatically, after a period of inactivity");
    expect(en("a verrouillé le Vault", "automatiquement, après 5 phrases secrètes refusées").target).toBe("automatically, after 5 refused passphrases");
    expect(en("a vérifié l’intégrité du Vault :", "3 originaux intacts")).toEqual({ verb: "checked the Vault’s integrity:", target: "3 originals intact" });
    expect(en("a vérifié l’intégrité du Vault :", "1 problème sur 2 originaux").target).toBe("1 problem in 2 originals");
    expect(en("a vérifié l’intégrité du Vault :", "aucun original à vérifier").target).toBe("no originals to check");
    expect(en("a créé une sauvegarde chiffrée", "2 originaux")).toEqual({ verb: "created an encrypted backup", target: "2 originals" });
    expect(en("a réglé la protection sur « Haute protection » pour", "Contrat.pdf").verb).toBe("set protection to “High protection” for");
    expect(en("a activé l’effacement après 10 tentatives échouées").verb).toBe("turned on erase after 10 failed attempts");
    expect(en("a laissé la corbeille se vider :", "2 fichiers supprimés depuis plus de 30 jours")).toEqual({ verb: "let the trash empty itself:", target: "2 files deleted more than 30 days ago" });
    // A sample file is named as the interface names it.
    expect(en("a mis à jour", "Extrait du modèle prévisionnel.pdf").target).toBe("Forecast Model Excerpt.pdf");
  });

  it("shows a wording it does not know as it was written, rather than guess", () => {
    expect(inEnglish(() => journalText(entry("a fait quelque chose d’inconnu", "Mon fichier.pdf")))).toEqual({ verb: "a fait quelque chose d’inconnu", target: "Mon fichier.pdf" });
  });
});

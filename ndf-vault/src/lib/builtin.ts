import { getLang } from "./i18n";
import type { Folder, Project, VaultFile } from "./types";

/**
 * English for what the vault ships with: the numbered index, the two sample
 * projects and the sample files.
 *
 * These are stored once, under their French names, and shown in English when
 * the interface is in English. Anything a person has renamed keeps the name
 * they gave it, in both languages: only a name that is still the built-in one
 * is swapped.
 */

const FOLDER: Record<string, { fr: string; en: string }> = {
  start: { fr: "Commencer ici", en: "Start Here" },
  overview: { fr: "Aperçu de la saga", en: "Saga Overview" },
  screenplays: { fr: "Scénarios", en: "Screenplays" },
  story: { fr: "Développement de l’histoire", en: "Story Development" },
  production: { fr: "Production", en: "Production" },
  fs1: { fr: "Film et série 1", en: "Film and Series 1" },
  fs2: { fr: "Film et série 2", en: "Film and Series 2" },
  fs3: { fr: "Film et série 3", en: "Film and Series 3" },
  fs4: { fr: "Film et série 4", en: "Film and Series 4" },
  fs5: { fr: "Film et série 5", en: "Film and Series 5" },
  business: { fr: "Affaires et finances", en: "Business and Finance" },
  legal: { fr: "Juridique et chaîne de titres", en: "Legal and Chain of Title" },
  talent: { fr: "Talents et packaging", en: "Talent and Packaging" },
  "to-sign": { fr: "À signer", en: "To Sign" },
  signed: { fr: "Signés", en: "Signed" },
  qa: { fr: "Questions et réponses", en: "Q&A" },
};

const ACCESS: Record<string, string> = {
  "Tous les invités": "All guests",
  "Talents, producteurs, studios (lecture seule)": "Talent, producers, studios (read only)",
  "Producteurs, studios": "Producers, studios",
  "Producteurs, financiers, partenaires": "Producers, financiers, partners",
  "Niveau 2": "Level 2",
  "Groupe talents (par rôle)": "Talent group (by role)",
  "Par invité": "Per guest",
  "Par groupe": "Per group",
};

const PROJECT_TEXT: Record<string, string> = {
  "Production prévue en 2029": "Production planned for 2029",
  "Activités de production prévues de 2031 à 2033": "Production activities planned from 2031 to 2033",
  "Espace de travail des années FS1 et FS2.": "Workspace for the FS1 and FS2 years.",
  "Espace de travail des années FS3, FS4 et FS5.": "Workspace for the FS3, FS4 and FS5 years.",
  "Dates à définir": "Dates to be set",
  "Nouvel espace de projet.": "New project workspace.",
};

/** Sample file names. The film parts keep their codes, never a title. */
const FILE: Record<string, string> = {
  "Scénario FS1 Film Part 1": "FS1 Film Part 1 Screenplay",
  "Scénario FS1 Film Part 2": "FS1 Film Part 2 Screenplay",
  "Scénario FS1 Série – Épisode 101": "FS1 Series Screenplay – Episode 101",
  "Scénario FS1 Série – Épisode 102": "FS1 Series Screenplay – Episode 102",
  "Scénario FS2 Film Part 1": "FS2 Film Part 1 Screenplay",
  "Aperçu de la chronologie de la saga": "Saga Timeline Overview",
  "Bible des personnages": "Character Bible",
  "Synopsis FS3": "FS3 Synopsis",
  "Sommaire du budget de production PB1": "PB1 Production Budget Summary",
  "Budget PB1 – Page sommaire": "PB1 Budget – Top Sheet",
  "Budget préliminaire PB2": "PB2 Preliminary Budget",
  "Extrait du modèle prévisionnel": "Forecast Model Excerpt",
  "Plan d’affaires NDF5": "NDF5 Business Plan",
  "Sommaire exécutif": "Executive Summary",
  "Présentation aux investisseurs": "Investor Presentation",
  "Aperçu de la structure de financement": "Financing Structure Overview",
  "Liste de contacts investisseurs": "Investor Contact List",
  "Bible de l’industrie": "Industry Bible",
  "Bible de l’industrie – Annexe": "Industry Bible – Appendix",
  "Liste de souhaits – Distribution": "Casting Wish List",
  "Liste de l’équipe – Montréal": "Crew List – Montreal",
  "Contacts des chefs de département": "Department Head Contacts",
  "Calendrier de tournage PB1": "PB1 Shooting Schedule",
  "Calendrier de production PB1": "PB1 Production Calendar",
  "Échéancier de production PB2": "PB2 Production Timeline",
  "Modèle d’entente de confidentialité": "NDA Template",
  "Modèle de contrat d’option": "Option Agreement Template",
  "Liste de vérification – Chaîne de titres": "Chain of Title Checklist",
  "Stratégie de distribution": "Distribution Strategy",
  "Aperçu des fenêtres de diffusion": "Release Windows Overview",
  "Présentation de la saga": "Saga Presentation",
  "Concept d’affiche 01": "Poster Concept 01",
  "Notes de presse": "Press Notes",
  "Dépouillement des scènes FS1": "FS1 Scene Breakdown",
  "Planche de repérage": "Location Scouting Board",
  "Plan de saison – Série FS2": "Season Outline – FS2 Series",
  "Notes de repérage FS3": "FS3 Scouting Notes",
  "Premier traitement": "First Treatment",
  "Ébauche de budget remplacée": "Superseded Budget Draft",
  "Mot de bienvenue": "Welcome Note",
  "Comment utiliser le Vault": "How to Use the Vault",
  "Bible de la saga": "Saga Bible",
};

const TAG: Record<string, string> = {
  scénario: "screenplay",
  film: "film",
  série: "series",
  chronologie: "timeline",
  histoire: "story",
  personnages: "characters",
  synopsis: "synopsis",
  budget: "budget",
  prévisions: "forecast",
  modèle: "template",
  "plan d’affaires": "business plan",
  sommaire: "summary",
  investisseurs: "investors",
  présentation: "presentation",
  financement: "financing",
  contacts: "contacts",
  bible: "bible",
  industrie: "industry",
  "distribution des rôles": "casting",
  équipe: "crew",
  Montréal: "Montreal",
  calendrier: "schedule",
  échéancier: "timeline",
  confidentialité: "confidentiality",
  contrat: "agreement",
  "liste de vérification": "checklist",
  distribution: "distribution",
  diffusion: "release",
  fenêtres: "windows",
  affiche: "poster",
  image: "image",
  presse: "press",
  dépouillement: "breakdown",
  repérage: "scouting",
  plan: "outline",
  traitement: "treatment",
  bienvenue: "welcome",
  guide: "guide",
  saga: "saga",
};

const english = () => getLang() === "en";

/** The English name of a sample file, when `name` is one; the name itself otherwise. */
export function sampleFileName(name: string): string {
  return english() ? (FILE[name] ?? name) : name;
}

export function localizeFolders(folders: Folder[]): Folder[] {
  if (!english()) return folders;
  return folders.map((f) => {
    const known = FOLDER[f.id];
    const name = known && f.name === known.fr ? known.en : f.name;
    const access = f.access ? (ACCESS[f.access] ?? f.access) : f.access;
    return name === f.name && access === f.access ? f : { ...f, name, access };
  });
}

export function localizeProjects(projects: Project[]): Project[] {
  if (!english()) return projects;
  return projects.map((p) => {
    const period = PROJECT_TEXT[p.period] ?? p.period;
    const summary = PROJECT_TEXT[p.summary] ?? p.summary;
    return period === p.period && summary === p.summary ? p : { ...p, period, summary };
  });
}

/** Only sample files are touched: a file someone uploaded keeps the name it came with. */
export function localizeFiles(files: VaultFile[]): VaultFile[] {
  if (!english()) return files;
  return files.map((f) => {
    if (!f.sample || !FILE[f.name]) return f;
    return { ...f, name: FILE[f.name], tags: f.tags.map((tag) => TAG[tag] ?? tag) };
  });
}

const FILE_FR = new Map(Object.entries(FILE).map(([fr, en]) => [en, fr]));
const FOLDER_BY_FR = new Map(Object.values(FOLDER).map(({ fr, en }) => [fr, en]));
const FOLDER_BY_EN = new Map(Object.values(FOLDER).map(({ fr, en }) => [en, fr]));

/** The English name of a built-in folder, when `name` is one; the name itself otherwise. */
export function builtinFolderName(name: string): string {
  return english() ? (FOLDER_BY_FR.get(name) ?? name) : name;
}

/**
 * The name under which something built-in is stored, whatever language it was
 * read in: "NDA Template.pdf" → "Modèle d’entente de confidentialité.pdf".
 * The journal records these, so that an entry reads the same in both languages.
 */
export function storedName(shown: string): string {
  const folder = FOLDER_BY_EN.get(shown);
  if (folder) return folder;
  const dot = shown.lastIndexOf(".");
  const stem = dot > 0 ? shown.slice(0, dot) : shown;
  const file = FILE_FR.get(stem);
  return file ? `${file}${dot > 0 ? shown.slice(dot) : ""}` : shown;
}

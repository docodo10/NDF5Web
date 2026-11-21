import { t } from "./i18n";
import type { ActivityItem, FileKind, FileStatus, Folder, Project, User, VaultFile } from "./types";

/**
 * SAMPLE DATA
 * Everything in this file is placeholder content so the interface can be
 * reviewed before real documents are uploaded. No entry has a stored file
 * behind it, and none of it describes real figures, contracts or approvals.
 */

/** A sample department, named in the language of the interface each time it is read. */
const department = (id: string, fr: [name: string, role: string, initials: string], en: [name: string, role: string, initials: string]): User => ({
  id,
  get name() {
    return t(fr, en)[0];
  },
  get role() {
    return t(fr, en)[1];
  },
  get initials() {
    return t(fr, en)[2];
  },
});

export const USERS: User[] = [
  department("u-admin", ["Admin NDF5", "Administration", "AN"], ["Admin NDF5", "Administration", "AN"]),
  department("u-prod", ["Bureau de production", "Production", "BP"], ["Production Office", "Production", "PO"]),
  department("u-legal", ["Affaires juridiques", "Juridique", "AJ"], ["Legal Affairs", "Legal", "LA"]),
  department("u-fin", ["Bureau des finances", "Finances", "BF"], ["Finance Office", "Finance", "FO"]),
  department("u-story", ["Service scénario", "Écriture", "SS"], ["Story Department", "Writing", "SD"]),
];

export const CURRENT_USER_ID = "u-admin";

/** Numbered vault index and its planned default access, from the NDF5 Vault data-room plan. */
export const FOLDERS: Folder[] = [
  { id: "root", name: "NDF SAGA", parentId: null },
  { id: "start", index: "00", name: "Commencer ici", access: "Tous les invités", parentId: "root" },
  { id: "overview", index: "01", name: "Aperçu de la saga", access: "Tous les invités", parentId: "root" },
  { id: "screenplays", index: "02", name: "Scénarios", access: "Talents, producteurs, studios (lecture seule)", parentId: "root" },
  { id: "story", index: "03", name: "Développement de l’histoire", access: "Producteurs, studios", parentId: "root" },
  { id: "production", index: "04", name: "Production", access: "Producteurs, financiers, partenaires", parentId: "root" },
  { id: "pb1", name: "Production Blitz One", code: "PB1", parentId: "production" },
  { id: "fs1", name: "Film et série 1", code: "FS1", parentId: "pb1" },
  { id: "fs2", name: "Film et série 2", code: "FS2", parentId: "pb1" },
  { id: "pb2", name: "Production Blitz Two", code: "PB2", parentId: "production" },
  { id: "fs3", name: "Film et série 3", code: "FS3", parentId: "pb2" },
  { id: "fs4", name: "Film et série 4", code: "FS4", parentId: "pb2" },
  { id: "fs5", name: "Film et série 5", code: "FS5", parentId: "pb2" },
  { id: "business", index: "05", name: "Affaires et finances", access: "Niveau 2", parentId: "root" },
  { id: "legal", index: "06", name: "Juridique et chaîne de titres", access: "Niveau 2", parentId: "root" },
  { id: "talent", index: "07", name: "Talents et packaging", access: "Groupe talents (par rôle)", parentId: "root" },
  { id: "to-sign", index: "08", name: "À signer", access: "Par invité", parentId: "root" },
  { id: "signed", index: "09", name: "Signés", access: "Par invité", parentId: "root" },
  { id: "qa", index: "10", name: "Questions et réponses", access: "Par groupe", parentId: "root" },
];

export const PROJECTS: Project[] = [
  {
    id: "pb1",
    code: "PB1",
    name: "Production Blitz One",
    period: "Production prévue en 2029",
    summary: "Espace de travail des années FS1 et FS2.",
    storyYears: ["FS1", "FS2"],
    folderId: "pb1",
    archived: false,
  },
  {
    id: "pb2",
    code: "PB2",
    name: "Production Blitz Two",
    period: "Activités de production prévues de 2031 à 2033",
    summary: "Espace de travail des années FS3, FS4 et FS5.",
    storyYears: ["FS3", "FS4", "FS5"],
    folderId: "pb2",
    archived: false,
  },
];

export const EXT_KIND: Record<string, FileKind> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  pptx: "pptx",
  txt: "txt",
  csv: "csv",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
};

type Seed = [
  name: string,
  ext: string,
  folderId: string,
  projectId: string | null,
  ownerId: string,
  modified: string,
  status: FileStatus,
  sizeKB: number,
  pages: number,
  tags: string[],
  flags?: string,
];

// flags: f = favorite, p = pinned, x = private, s = shared with me, a = archived
const SEEDS: Seed[] = [
  ["Scénario FS1 Film Part 1", "pdf", "screenplays", "pb1", "u-story", "2026-11-12", "In Review", 1420, 6, ["scénario", "film", "FS1"], "f"],
  ["Scénario FS1 Film Part 2", "pdf", "screenplays", "pb1", "u-story", "2026-11-10", "Draft", 1380, 6, ["scénario", "film", "FS1"]],
  ["Scénario FS1 Série – Épisode 101", "docx", "screenplays", "pb1", "u-story", "2026-11-09", "Draft", 412, 4, ["scénario", "série", "FS1"], "s"],
  ["Scénario FS1 Série – Épisode 102", "docx", "screenplays", "pb1", "u-story", "2026-11-06", "Draft", 398, 4, ["scénario", "série", "FS1"], "s"],
  ["Scénario FS2 Film Part 1", "pdf", "screenplays", "pb1", "u-story", "2026-10-28", "Draft", 1290, 6, ["scénario", "film", "FS2"]],
  ["Aperçu de la chronologie de la saga", "pdf", "story", null, "u-story", "2026-10-21", "Approved", 640, 4, ["chronologie", "histoire"], "f"],
  ["Bible des personnages", "docx", "story", null, "u-story", "2026-10-30", "In Review", 880, 5, ["personnages", "histoire"]],
  ["Synopsis FS3", "docx", "story", "pb2", "u-story", "2026-09-18", "Draft", 236, 3, ["synopsis", "FS3"]],
  ["Sommaire du budget de production PB1", "xlsx", "business", "pb1", "u-fin", "2026-11-11", "In Review", 628, 3, ["budget", "PB1"], "p"],
  ["Budget PB1 – Page sommaire", "pdf", "business", "pb1", "u-fin", "2026-11-04", "Draft", 310, 2, ["budget", "PB1"], "s"],
  ["Budget préliminaire PB2", "xlsx", "business", "pb2", "u-fin", "2026-10-02", "Draft", 540, 3, ["budget", "PB2"]],
  ["Extrait du modèle prévisionnel", "pdf", "business", null, "u-fin", "2026-11-13", "In Review", 2240, 4, ["prévisions", "modèle"], "fx"],
  ["Plan d’affaires NDF5", "pdf", "business", null, "u-admin", "2026-10-15", "Approved", 1960, 6, ["plan d’affaires"], "f"],
  ["Sommaire exécutif", "docx", "business", null, "u-admin", "2026-10-19", "In Review", 184, 2, ["sommaire"]],
  ["Présentation aux investisseurs", "pptx", "business", null, "u-admin", "2026-11-08", "Approved", 5120, 5, ["investisseurs", "présentation"], "p"],
  ["Aperçu de la structure de financement", "pdf", "business", null, "u-fin", "2026-10-26", "In Review", 472, 3, ["financement"], "x"],
  ["Liste de contacts investisseurs", "csv", "business", null, "u-admin", "2026-10-12", "Draft", 28, 1, ["investisseurs", "contacts"], "x"],
  ["Bible de l’industrie", "pdf", "overview", null, "u-admin", "2026-11-05", "Approved", 3360, 6, ["bible", "industrie"], "f"],
  ["Bible de l’industrie – Annexe", "docx", "overview", null, "u-admin", "2026-10-08", "Draft", 502, 4, ["bible"]],
  ["Liste de souhaits – Distribution", "xlsx", "talent", "pb1", "u-prod", "2026-11-07", "Draft", 96, 2, ["distribution des rôles"], "x"],
  ["Liste de l’équipe – Montréal", "xlsx", "pb1", "pb1", "u-prod", "2026-10-24", "Draft", 118, 2, ["équipe", "Montréal"], "s"],
  ["Contacts des chefs de département", "csv", "pb1", "pb1", "u-prod", "2026-10-11", "Draft", 14, 1, ["équipe", "contacts"]],
  ["Calendrier de tournage PB1", "xlsx", "pb1", "pb1", "u-prod", "2026-11-12", "In Review", 780, 3, ["calendrier", "PB1"], "s"],
  ["Calendrier de production PB1", "pdf", "pb1", "pb1", "u-prod", "2026-11-01", "Draft", 356, 2, ["calendrier", "PB1"]],
  ["Échéancier de production PB2", "pdf", "pb2", "pb2", "u-prod", "2026-09-27", "Draft", 298, 2, ["échéancier", "PB2"]],
  ["Modèle d’entente de confidentialité", "pdf", "legal", null, "u-legal", "2026-10-29", "Approved", 220, 4, ["confidentialité", "modèle"], "p"],
  ["Modèle de contrat d’option", "docx", "legal", null, "u-legal", "2026-10-17", "Draft", 164, 3, ["modèle", "contrat"], "x"],
  ["Liste de vérification – Chaîne de titres", "pdf", "legal", null, "u-legal", "2026-10-05", "In Review", 132, 2, ["liste de vérification"], "s"],
  ["Stratégie de distribution", "pptx", "business", null, "u-admin", "2026-10-22", "Draft", 3880, 4, ["distribution"]],
  ["Aperçu des fenêtres de diffusion", "pdf", "business", null, "u-admin", "2026-10-14", "Draft", 410, 3, ["diffusion", "fenêtres"]],
  ["Présentation de la saga", "pptx", "overview", null, "u-admin", "2026-11-03", "Final", 6240, 5, ["présentation"], "f"],
  ["Concept d’affiche 01", "png", "overview", null, "u-admin", "2026-09-30", "Draft", 2870, 1, ["affiche", "image"]],
  ["Notes de presse", "txt", "overview", null, "u-admin", "2026-09-22", "Draft", 9, 1, ["presse"]],
  ["Dépouillement des scènes FS1", "xlsx", "fs1", "pb1", "u-prod", "2026-11-02", "In Review", 448, 3, ["dépouillement", "FS1"]],
  ["Planche de repérage", "jpg", "fs1", "pb1", "u-prod", "2026-10-09", "Draft", 4120, 1, ["repérage", "image"]],
  ["Plan de saison – Série FS2", "docx", "fs2", "pb1", "u-story", "2026-10-03", "Draft", 204, 3, ["plan", "série", "FS2"]],
  ["Notes de repérage FS3", "txt", "fs3", "pb2", "u-prod", "2026-09-12", "Draft", 6, 1, ["repérage", "FS3"]],
  ["Premier traitement", "pdf", "story", null, "u-story", "2026-03-14", "Archived", 720, 4, ["traitement"], "a"],
  ["Ébauche de budget remplacée", "xlsx", "business", "pb1", "u-fin", "2026-05-20", "Archived", 502, 3, ["budget"], "a"],
  ["Mot de bienvenue", "pdf", "start", null, "u-admin", "2026-11-13", "Final", 84, 1, ["bienvenue"]],
  ["Comment utiliser le Vault", "pdf", "start", null, "u-admin", "2026-11-12", "Approved", 126, 2, ["guide"]],
  ["Bible de la saga", "pdf", "overview", null, "u-story", "2026-11-06", "Approved", 4180, 6, ["bible", "saga"], "f"],
];

/** Sample files were "added" a few days before their last change, so the two dates differ. */
function daysBefore(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export const FILES: VaultFile[] = SEEDS.map((s, i) => {
  const [name, ext, folderId, projectId, ownerId, modified, status, sizeKB, pages, tags, flags = ""] = s;
  const hour = 9 + (i % 8);
  return {
    id: `f-${i + 1}`,
    name,
    ext,
    kind: EXT_KIND[ext],
    size: sizeKB * 1024,
    folderId,
    projectId,
    ownerId,
    createdAt: `${daysBefore(modified, (i * 5) % 23)}T0${(i % 4) + 8}:15:00`,
    modifiedAt: `${modified}T${String(hour).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00`,
    status,
    tags,
    notes: "",
    favorite: flags.includes("f"),
    pinned: flags.includes("p"),
    visibility: flags.includes("x") ? "private" : "team",
    sharedWithMe: flags.includes("s"),
    archived: flags.includes("a"),
    deleted: false,
    pages,
    sample: true,
  };
});

const VERBS = ["a téléversé", "a mis à jour", "a renommé", "a déplacé", "a partagé", "a changé le statut de", "a commenté"];

export const ACTIVITY: ActivityItem[] = [...FILES]
  .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  .slice(0, 22)
  .map((f, i) => ({
    id: `a-${i + 1}`,
    at: f.modifiedAt,
    userId: f.ownerId,
    verb: VERBS[i % VERBS.length],
    target: `${f.name}.${f.ext}`,
    projectId: f.projectId,
  }));

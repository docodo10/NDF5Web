import { dueOf } from "./due";
import type { VaultFile } from "./types";

/**
 * What deserves attention right now: dates that are close or past, and gaps
 * in the vault's own protection. Computed from the state, never stored.
 */

export type NoticeAction = { kind: "file"; fileId: string } | { kind: "dialog"; dialog: "protect" | "recovery" | "backup" } | { kind: "bin" };

export interface Notice {
  id: string;
  tone: "alert" | "warn";
  title: string;
  detail: string;
  action: NoticeAction;
}

export interface NoticeInput {
  files: VaultFile[];
  protected: boolean;
  canProtect: boolean;
  hasRecoveryCode: boolean;
  lastBackupAt: string | null;
  binDays: number;
  now?: Date;
}

const DAY = 86_400_000;
const name = (f: VaultFile) => `${f.name}.${f.ext}`;

export function buildNotices({ files, protected: isProtected, canProtect, hasRecoveryCode, lastBackupAt, binDays, now = new Date() }: NoticeInput): Notice[] {
  const out: Notice[] = [];
  const live = files.filter((f) => !f.deleted && !f.archived);

  // Dates first, the most pressing first.
  const dated = live.map((f) => ({ f, due: dueOf(f.dueAt, now) })).filter((x): x is { f: VaultFile; due: NonNullable<ReturnType<typeof dueOf>> } => x.due !== null && x.due.state !== "later");
  dated.sort((a, b) => a.due.days - b.due.days);
  for (const { f, due } of dated) {
    out.push({ id: `due-${f.id}`, tone: due.state === "soon" ? "warn" : "alert", title: f.dueLabel ? `${f.dueLabel} — ${name(f)}` : name(f), detail: due.state === "overdue" ? due.label : `Échéance : ${due.label.toLowerCase()}`, action: { kind: "file", fileId: f.id } });
  }

  const uploaded = files.some((f) => !f.sample);
  if (uploaded && !isProtected && canProtect) out.push({ id: "protect", tone: "alert", title: "Le Vault n’est pas protégé", detail: "Vos fichiers sont lisibles par quiconque ouvre ce navigateur.", action: { kind: "dialog", dialog: "protect" } });
  if (isProtected && !hasRecoveryCode) out.push({ id: "recovery", tone: "warn", title: "Aucun code de récupération", detail: "Une phrase secrète oubliée rendrait le contenu irrécupérable.", action: { kind: "dialog", dialog: "recovery" } });
  if (uploaded) {
    const age = lastBackupAt ? Math.floor((now.getTime() - Date.parse(lastBackupAt)) / DAY) : null;
    if (age === null) out.push({ id: "backup", tone: "warn", title: "Aucune sauvegarde chiffrée", detail: "Si cet appareil est perdu, vos fichiers le sont aussi.", action: { kind: "dialog", dialog: "backup" } });
    else if (age > 30) out.push({ id: "backup", tone: "warn", title: "Sauvegarde ancienne", detail: `La dernière date de ${age} jours.`, action: { kind: "dialog", dialog: "backup" } });
  }

  // Files about to leave the bin for good.
  const leaving = files.filter((f) => f.deleted && f.deletedAt && Date.parse(f.deletedAt) + binDays * DAY - now.getTime() < 3 * DAY);
  if (leaving.length) out.push({ id: "bin", tone: "warn", title: leaving.length === 1 ? "1 fichier va quitter la corbeille" : `${leaving.length} fichiers vont quitter la corbeille`, detail: "Effacement définitif dans moins de trois jours.", action: { kind: "bin" } });
  return out;
}

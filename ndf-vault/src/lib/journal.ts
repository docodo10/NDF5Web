import { sampleFileName } from "./builtin";
import { getLang } from "./i18n";
import type { ActivityItem } from "./types";

/**
 * The journal in the language of the interface.
 *
 * Entries are stored once, in French, whatever the language at the time: a
 * record should not change with a setting. They are put into English here,
 * when shown or exported. A wording this file does not know is shown as it
 * was written.
 */

const VERB: Record<string, string> = {
  "a téléversé": "uploaded",
  "a téléversé une nouvelle version de": "uploaded a new version of",
  "a mis à jour": "updated",
  "a renommé": "renamed",
  "a déplacé": "moved",
  "a partagé": "shared",
  "a changé le statut de": "changed the status of",
  "a commenté": "commented on",
  "a ouvert": "opened",
  "a copié": "copied",
  "a archivé": "archived",
  "a restauré": "restored",
  "a supprimé": "deleted",
  "a supprimé définitivement": "permanently deleted",
  "a modifié les détails de": "edited the details of",
  "a téléchargé": "downloaded",
  "a téléchargé avec filigrane": "downloaded a watermarked copy of",
  "a téléchargé une version de": "downloaded a version of",
  "a restauré une version de": "restored a version of",
  "a supprimé une version de": "deleted a version of",
  "a exporté en ZIP": "exported as ZIP",
  "a créé le dossier": "created the folder",
  "a renommé le dossier": "renamed the folder",
  "a déplacé le dossier": "moved the folder",
  "a supprimé le dossier": "deleted the folder",
  "a créé le projet": "created the project",
  "a modifié le projet": "edited the project",
  "a archivé le projet": "archived the project",
  "a restauré le projet": "restored the project",
  "a fixé une échéance pour": "set a due date for",
  "a retiré l’échéance de": "removed the due date from",
  "a laissé la corbeille se vider :": "let the trash empty itself:",
  "a activé la protection par phrase secrète": "turned on passphrase protection",
  "a désactivé la protection par phrase secrète": "turned off passphrase protection",
  "a changé la phrase secrète": "changed the passphrase",
  "a choisi une nouvelle phrase secrète avec le code de récupération": "set a new passphrase with the recovery code",
  "a créé un code de récupération": "created a recovery code",
  "a remplacé le code de récupération": "replaced the recovery code",
  "a verrouillé le Vault": "locked the Vault",
  "a déverrouillé le Vault": "unlocked the Vault",
  "a détecté un fichier altéré :": "detected an altered file:",
  "a vérifié l’intégrité du Vault :": "checked the Vault’s integrity:",
  "a créé une sauvegarde chiffrée": "created an encrypted backup",
  "a restauré la sauvegarde du": "restored the backup of",
  "a tenté de télécharger un document en consultation seule :": "tried to download a view-only document:",
  "a pressé une touche de capture d’écran pendant la consultation de": "pressed a screen-capture key while viewing",
  "a désactivé l’effacement après tentatives échouées": "turned off erase after failed attempts",
};

const LEVEL: Record<string, string> = { Standard: "Standard", "Consultation seule": "View only", "Haute protection": "High protection" };

const plural = (n: string, one: string, many: string) => `${n} ${Number(n) > 1 ? many : one}`;

function verbInEnglish(verb: string): string {
  if (VERB[verb]) return VERB[verb];
  let m = /^a réglé la protection sur « (.+) » pour$/.exec(verb);
  if (m) return `set protection to “${LEVEL[m[1]] ?? m[1]}” for`;
  m = /^a activé l’effacement après (\d+) tentatives échouées$/.exec(verb);
  if (m) return `turned on erase after ${m[1]} failed attempts`;
  return verb;
}

function targetInEnglish(target: string): string {
  // A sample file, named as the sample data names it.
  const dot = target.lastIndexOf(".");
  if (dot > 0) {
    const name = sampleFileName(target.slice(0, dot));
    if (name !== target.slice(0, dot)) return `${name}${target.slice(dot)}`;
  }
  let m = /^(\d+) fichiers?$/.exec(target);
  if (m) return plural(m[1], "file", "files");
  m = /^(\d+) origina(?:l|ux)$/.exec(target);
  if (m) return plural(m[1], "original", "originals");
  m = /^(\d+) origina(?:l intact|ux intacts)$/.exec(target);
  if (m) return `${plural(m[1], "original", "originals")} intact`;
  m = /^(\d+) problèmes? sur (\d+) origina(?:l|ux)$/.exec(target);
  if (m) return `${plural(m[1], "problem", "problems")} in ${plural(m[2], "original", "originals")}`;
  if (target === "aucun original à vérifier") return "no originals to check";
  m = /^après (\d+) tentatives? échouées?$/.exec(target);
  if (m) return `after ${plural(m[1], "failed attempt", "failed attempts")}`;
  if (target === "automatiquement, après une période sans activité") return "automatically, after a period of inactivity";
  m = /^automatiquement, après (\d+) phrases secrètes refusées$/.exec(target);
  if (m) return `automatically, after ${m[1]} refused passphrases`;
  m = /^(\d+) fichiers? supprimés? depuis plus de (\d+) jours$/.exec(target);
  if (m) return `${plural(m[1], "file", "files")} deleted more than ${m[2]} days ago`;
  return target;
}

/** What an entry says, in the language of the interface. */
export function journalText(item: Pick<ActivityItem, "verb" | "target">): { verb: string; target: string } {
  if (getLang() !== "en") return { verb: item.verb, target: item.target };
  return { verb: verbInEnglish(item.verb), target: targetInEnglish(item.target) };
}

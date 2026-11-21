"use client";

import { CircleAlert, CircleCheck, Download, HardDriveDownload, HardDriveUpload, KeyRound, LockKeyhole, RotateCcw, ScanSearch } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useVault } from "@/lib/store";
import { requestPersistence, storageUsage } from "@/lib/db";
import { USERS } from "@/lib/sample-data";
import { formatMoment, formatSize } from "@/lib/format";
import { t } from "@/lib/i18n";
import { watermarkText } from "@/lib/stamp";
import { Ndf5Logo } from "@/components/brand/Brand";
import { INPUT, SwitchRow } from "@/components/dialog-kit";
import { PROTECTION_HINT, PROTECTION_LABEL, PROTECTION_LEVELS, type Protection } from "@/lib/protection";
import { Avatar, Button, Chip, Kbd, PageHeader } from "@/components/ui";

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-3 border-t border-line py-7 first:border-t-0 first:pt-0 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-[19px] text-neutral-500">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Line({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hair py-2 first:border-t-0">
      <div className="min-w-0 flex-1 basis-[220px]">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {hint && <p className="text-[12px] leading-[17px] text-neutral-500">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

type StepState = "done" | "partial" | "pending";

// Functions, so that the texts follow the language at the time they are drawn.
const steps = (): { label: string; hint: string; state: StepState }[] => [
  { label: "Interface", hint: t("Navigation, tables, dialogues, visionneuse, recherche", "Navigation, tables, dialogs, viewer, search"), state: "done" },
  {
    label: t("Téléversement", "Upload"),
    hint: t("Plusieurs fichiers, glisser-déposer, contrôle du format, de la taille et du contenu", "Multiple files, drag and drop, checks on format, size and content"),
    state: "done",
  },
  { label: t("Stockage persistant", "Persistent storage"), hint: t("Dans ce navigateur : vos changements survivent au rechargement", "In this browser: your changes survive a reload"), state: "done" },
  {
    label: t("Protection par phrase secrète", "Passphrase protection"),
    hint: t("Chiffrement AES-256 de tout ce qui est stocké, verrouillage manuel et automatique", "AES-256 encryption of everything stored, manual and automatic lock"),
    state: "done",
  },
  {
    label: t("Intégrité et journal", "Integrity and activity log"),
    hint: t("Empreinte SHA-256 vérifiée à chaque ouverture, journal des accès exportable", "SHA-256 fingerprint verified at each opening, exportable access log"),
    state: "done",
  },
  {
    label: t("Téléchargement et export", "Download and export"),
    hint: t("Originaux, copies filigranées (PDF et images), export ZIP", "Originals, watermarked copies (PDF and images), ZIP export"),
    state: "done",
  },
  {
    label: t("Historique des versions", "Version history"),
    hint: t("Nouvelles versions, restauration et téléchargement des précédentes", "New versions, restoring and downloading earlier ones"),
    state: "done",
  },
  {
    label: t("Récupération et sauvegarde", "Recovery and backup"),
    hint: t(
      "Code de récupération si la phrase est oubliée, sauvegarde chiffrée de tout le Vault et restauration",
      "Recovery code if the passphrase is forgotten, encrypted backup of the whole Vault and restore",
    ),
    state: "done",
  },
  {
    label: t("Aperçu réel", "Real preview"),
    hint: t("PDF, images, texte, CSV, et le contenu des fichiers Word, Excel et PowerPoint", "PDF, images, text, CSV, and the content of Word, Excel and PowerPoint files"),
    state: "done",
  },
  {
    label: t("Recherche dans le contenu", "Content search"),
    hint: t(
      "Le texte des PDF, des fichiers Office et des fichiers texte, indexé sur cet appareil et chiffré comme le reste",
      "The text of PDFs, Office files and text files, indexed on this device and encrypted like the rest",
    ),
    state: "done",
  },
  {
    label: t("Protection des documents", "Document protection"),
    hint: t(
      "Consultation seule, lecture protégée par bande, filigrane incrusté et code de consultation, capture d’écran détectée",
      "View only, band-protected reading, embedded watermark and viewing code, screenshots detected",
    ),
    state: "done",
  },
  {
    label: t("Accès des invités", "Guest access"),
    hint: t("Connexion par courriel, niveaux d’accès, conditions et NDA à signer", "Sign-in by email, access levels, terms and an NDA to sign"),
    state: "pending",
  },
  { label: t("Serveur", "Server"), hint: t("Stockage privé partagé entre appareils et utilisateurs", "Private storage shared across devices and users"), state: "pending" },
];

const stepChip = (state: StepState): ReactNode => {
  switch (state) {
    case "done":
      return <Chip className="!border-emerald-300 !text-emerald-700">{t("Fonctionnel", "Working")}</Chip>;
    case "partial":
      return <Chip className="!border-amber-300 !text-amber-700">{t("Partiel", "Partial")}</Chip>;
    case "pending":
      return <Chip className="border-dashed text-neutral-500">{t("À venir", "Upcoming")}</Chip>;
  }
};

const autoLock = (): { value: number; label: string }[] => [
  { value: 1, label: "1 minute" },
  { value: 5, label: "5 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: t("1 heure", "1 hour") },
  { value: 0, label: t("Jamais", "Never") },
];

export function SettingsView() {
  const v = useVault();
  const { security, persistent, files, folders, projects } = v;
  const box = "rounded-xl border border-line bg-white px-4 py-1.5 shadow-xs";
  const uploaded = files.filter((f) => !f.sample);
  const uploadedBytes = uploaded.reduce((n, f) => n + f.size + (f.versions ?? []).reduce((m, x) => m + x.size, 0), 0);

  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [durable, setDurable] = useState<boolean | null>(null);
  useEffect(() => {
    void storageUsage().then(setUsage);
    void navigator.storage?.persisted?.().then(setDurable, () => setDurable(null));
  }, [files.length]);

  const [name, setName] = useState(v.profile.name);
  const [company, setCompany] = useState(v.profile.company);
  const [email, setEmail] = useState(v.profile.email);
  const dirty = name !== v.profile.name || company !== v.profile.company || email !== v.profile.email;

  // What a careful owner would have in place. Each line says where things stand and offers the missing step.
  const fresh = (iso: string | null) => iso !== null && Date.now() - Date.parse(iso) < 30 * 86_400_000;
  const checks: { ok: boolean; label: string; hint: string; action?: [string, () => void] }[] = [
    {
      ok: security.protected,
      label: t("Protection par phrase secrète", "Passphrase protection"),
      hint: security.protected ? t("Tout ce qui est stocké est chiffré.", "Everything stored is encrypted.") : t("Sans elle, quiconque ouvre ce navigateur lit le Vault.", "Without it, anyone who opens this browser can read the Vault."),
      action: !security.protected && security.available ? [t("Activer", "Turn on"), () => v.openDialog({ type: "protect" })] : undefined,
    },
    {
      ok: security.recoveryAt !== null,
      label: t("Code de récupération", "Recovery code"),
      hint:
        security.recoveryAt !== null
          ? t("Une phrase secrète oubliée n’est pas fatale.", "A forgotten passphrase is not fatal.")
          : t("Sans code, une phrase secrète oubliée rend le contenu irrécupérable.", "Without a code, a forgotten passphrase makes the content unrecoverable."),
      action: security.protected && security.recoveryAt === null ? [t("Créer", "Create"), () => v.openDialog({ type: "recovery" })] : undefined,
    },
    {
      ok: security.protected && security.autoLockMinutes > 0 && security.autoLockMinutes <= 15,
      label: t("Verrouillage automatique en 15 minutes ou moins", "Automatic lock in 15 minutes or less"),
      hint: !security.protected
        ? t("Disponible une fois la protection activée.", "Available once protection is turned on.")
        : security.autoLockMinutes === 0
          ? t("Réglé sur « Jamais » : un poste laissé ouvert reste ouvert.", "Set to “Never”: a computer left open stays open.")
          : t(`Réglé sur ${security.autoLockMinutes} minute${security.autoLockMinutes > 1 ? "s" : ""}.`, `Set to ${security.autoLockMinutes} ${security.autoLockMinutes > 1 ? "minutes" : "minute"}.`),
    },
    {
      ok: fresh(v.lastBackupAt),
      label: t("Sauvegarde chiffrée de moins de 30 jours", "Encrypted backup less than 30 days old"),
      hint: v.lastBackupAt
        ? t(`Dernière sauvegarde le ${formatMoment(v.lastBackupAt)}.`, `Last backup on ${formatMoment(v.lastBackupAt)}.`)
        : t("Aucune sauvegarde faite depuis cet appareil.", "No backup made from this device."),
      action: fresh(v.lastBackupAt) ? undefined : [t("Sauvegarder", "Back up"), () => v.openDialog({ type: "backup" })],
    },
    {
      ok: fresh(v.lastAuditAt),
      label: t("Intégrité vérifiée depuis moins de 30 jours", "Integrity checked within the last 30 days"),
      hint: v.lastAuditAt
        ? t(`Dernière vérification le ${formatMoment(v.lastAuditAt)}.`, `Last check on ${formatMoment(v.lastAuditAt)}.`)
        : t("Les originaux n’ont pas encore été vérifiés d’un bloc.", "The originals have not yet been checked all at once."),
      action: fresh(v.lastAuditAt) || !persistent ? undefined : [t("Vérifier", "Check"), () => v.openDialog({ type: "audit" })],
    },
    {
      ok: durable === true,
      label: t("Stockage durable", "Durable storage"),
      hint: durable
        ? t("Le navigateur ne supprimera pas ces données pour faire de la place.", "The browser will not delete this data to make room.")
        : t("Le navigateur peut effacer ces données si le disque se remplit.", "The browser may erase this data if the disk fills up."),
    },
  ];
  const passed = checks.filter((c) => c.ok).length;

  return (
    <div className="max-w-[980px]">
      <PageHeader title={t("Réglages", "Settings")} description={t("Sécurité, profil, stockage et état de cette version.", "Security, profile, storage and the status of this version.")} />

      <div className="mt-8">
        <Panel title={t("Langue", "Language")} description={t("L’interface existe en anglais et en français.", "The interface comes in English and in French.")}>
          <div className={box}>
            <Line
              label={t("Langue de l’interface", "Interface language")}
              hint={t(
                "Le Vault s’ouvre en anglais, ou en français quand on y arrive depuis le côté français du site. Ce choix est gardé sur cet appareil ; les documents, eux, restent dans la langue où ils ont été écrits.",
                "The Vault opens in English, or in French when reached from the French side of the site. This choice is kept on this device; the documents themselves stay in the language they were written in.",
              )}
            >
              <LanguageSwitch />
            </Line>
          </div>
        </Panel>

        <Panel title={t("Bilan de sécurité", "Security checkup")} description={t("Ce qui est en place sur cet appareil, et ce qu’il reste à faire.", "What is in place on this device, and what is left to do.")}>
          <div data-checkup className={box}>
            <div className="flex items-center gap-4 py-3">
              <p className="shrink-0 text-[13px] font-medium text-ink">
                <span className="text-[20px] font-semibold tabular-nums tracking-[-0.02em]">{passed}</span> {t("sur", "of")} {checks.length}
              </p>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-200">
                <div className={`h-full rounded-full transition-[width] duration-300 ${passed === checks.length ? "bg-emerald-600" : "bg-ink"}`} style={{ width: `${(passed / checks.length) * 100}%` }} />
              </div>
            </div>
            <ul aria-label={t("Points de contrôle", "Checkpoints")}>
              {checks.map((c) => (
                <li key={c.label} data-check={c.ok} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hair py-2">
                  {c.ok ? (
                    <CircleCheck aria-label={t("En place", "In place")} className="size-[18px] shrink-0 text-emerald-600" strokeWidth={1.75} />
                  ) : (
                    <CircleAlert aria-label={t("À faire", "To do")} className="size-[18px] shrink-0 text-amber-500" strokeWidth={1.75} />
                  )}
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <p className="text-[13px] font-medium text-ink">{c.label}</p>
                    <p className="text-[12px] leading-[17px] text-neutral-500">{c.hint}</p>
                  </div>
                  {c.action && (
                    <Button size="sm" onClick={c.action[1]}>
                      {c.action[0]}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel title={t("Sécurité", "Security")} description={t("Protégez ce qui est stocké sur cet appareil avec une phrase secrète.", "Protect what is stored on this device with a passphrase.")}>
          <div className={box}>
            <Line
              label={t("Protection par phrase secrète", "Passphrase protection")}
              hint={
                !security.available
                  ? t("Indisponible : ce navigateur refuse le stockage ou le chiffrement.", "Unavailable: this browser refuses storage or encryption.")
                  : security.protected
                    ? t("Tout ce qui est stocké est chiffré (AES-256). La phrase est demandée à chaque ouverture.", "Everything stored is encrypted (AES-256). The passphrase is asked for each time the Vault is opened.")
                    : t("Sans protection, toute personne ayant accès à cet appareil peut ouvrir le Vault.", "Without protection, anyone with access to this device can open the Vault.")
              }
            >
              {security.protected ? (
                <>
                  <Chip className="!border-emerald-300 !text-emerald-700">{t("Activée", "On")}</Chip>
                  <Button size="sm" onClick={() => v.openDialog({ type: "passphrase" })}>
                    {t("Changer", "Change")}
                  </Button>
                  <Button size="sm" onClick={() => v.openDialog({ type: "unprotect" })}>
                    {t("Désactiver", "Turn off")}
                  </Button>
                </>
              ) : (
                <>
                  <Chip className="border-dashed">{t("Désactivée", "Off")}</Chip>
                  <Button size="sm" variant="primary" disabled={!security.available} onClick={() => v.openDialog({ type: "protect" })}>
                    {t("Activer", "Turn on")}
                  </Button>
                </>
              )}
            </Line>
            <Line
              label={t("Code de récupération", "Recovery code")}
              hint={
                !security.protected
                  ? t("Créé avec la protection : il permet de choisir une nouvelle phrase secrète si la vôtre est oubliée.", "Created along with protection: it lets you choose a new passphrase if yours is forgotten.")
                  : security.recoveryAt !== null
                    ? t(
                        `${security.recoveryAt ? `Créé le ${formatMoment(security.recoveryAt)}. ` : ""}Il permet de choisir une nouvelle phrase secrète si la vôtre est oubliée.`,
                        `${security.recoveryAt ? `Created on ${formatMoment(security.recoveryAt)}. ` : ""}It lets you choose a new passphrase if yours is forgotten.`,
                      )
                    : t("Aucun code : si la phrase secrète est oubliée, le contenu du Vault sur cet appareil est perdu.", "No code: if the passphrase is forgotten, the Vault’s content on this device is lost.")
              }
            >
              {security.protected && security.recoveryAt === null && <Chip className="!border-amber-300 !text-amber-700">{t("Aucun", "None")}</Chip>}
              <Button size="sm" icon={KeyRound} disabled={!security.protected} onClick={() => v.openDialog({ type: "recovery" })}>
                {security.recoveryAt !== null ? t("Remplacer le code", "Replace the code") : t("Créer un code", "Create a code")}
              </Button>
            </Line>
            <Line label={t("Verrouillage automatique", "Automatic lock")} hint={t("Verrouille le Vault après une période sans activité.", "Locks the Vault after a period of inactivity.")}>
              <label className="sr-only" htmlFor="auto-lock">
                {t("Verrouillage automatique", "Automatic lock")}
              </label>
              <select id="auto-lock" value={security.autoLockMinutes} disabled={!security.protected} onChange={(e) => v.setAutoLock(Number(e.target.value))} className={`${INPUT} !h-8 !w-auto pr-8 disabled:opacity-50`}>
                {autoLock().map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Line>
            <Line label={t("Verrouiller maintenant", "Lock now")} hint={t("Ferme la session : la phrase secrète sera demandée pour rouvrir.", "Ends the session: the passphrase will be asked for to reopen.")}>
              <Button size="sm" icon={LockKeyhole} disabled={!security.protected} onClick={() => void v.lockNow()}>
                {t("Verrouiller", "Lock")}
              </Button>
            </Line>
            <Line
              label={t("Intégrité des fichiers", "File integrity")}
              hint={t("Recalcule l’empreinte de chaque original et la compare à celle prise au téléversement.", "Recomputes the fingerprint of each original and compares it with the one taken at upload.")}
            >
              <Button size="sm" icon={ScanSearch} disabled={!persistent} onClick={() => v.openDialog({ type: "audit" })}>
                {t("Vérifier", "Check")}
              </Button>
            </Line>
            <div className="border-t border-hair">
              <SwitchRow
                on={v.privacy}
                onChange={v.setPrivacy}
                label={t("Écran de confidentialité", "Privacy screen")}
                hint={t(
                  "Masque le contenu dès que la fenêtre n’est plus active : autre onglet, autre application, partage d’écran.",
                  "Hides the content as soon as the window is no longer active: another tab, another app, screen sharing.",
                )}
              />
            </div>
            {security.protected && (
              <>
                <div className="border-t border-hair">
                  <SwitchRow
                    on={security.wipeAfter > 0}
                    onChange={v.setWipeAfter}
                    label={t("Effacement après 10 tentatives", "Erase after 10 attempts")}
                    hint={t(
                      "Après 10 phrases secrètes ou codes refusés d’affilée, le Vault s’efface de cet appareil. À n’activer qu’avec une sauvegarde chiffrée à jour.",
                      "After 10 passphrases or codes refused in a row, the Vault erases itself from this device. Turn on only with an up-to-date encrypted backup.",
                    )}
                  />
                </div>
                <Line
                  label={t("Verrouillage d’urgence", "Emergency lock")}
                  hint={t("Trois appuis rapprochés sur Échap verrouillent le Vault aussitôt, où que vous soyez dans l’application.", "Three quick presses of Esc lock the Vault at once, wherever you are in the app.")}
                >
                  <span className="flex items-center gap-1.5 text-[12.5px] text-neutral-500">
                    <Kbd>{t("Échap", "Esc")}</Kbd> × 3
                  </span>
                </Line>
              </>
            )}
          </div>
        </Panel>

        <Panel title={t("Protection des documents", "Document protection")} description={t("Jusqu’où un document peut être lu sans pouvoir être emporté.", "How far a document can be read without being taken away.")}>
          <div className={box}>
            <Line
              label={t("Niveau des nouveaux fichiers", "Level for new files")}
              hint={t(
                "Appliqué à chaque téléversement. Le niveau d’un fichier se change ensuite dans son menu, sous « Protection ».",
                "Applied to each upload. A file’s level can then be changed in its menu, under “Protection”.",
              )}
            >
              <label className="sr-only" htmlFor="default-protection">
                {t("Niveau des nouveaux fichiers", "Level for new files")}
              </label>
              <select id="default-protection" value={v.defaultProtection} onChange={(e) => v.setDefaultProtection(e.target.value as Protection)} className={`${INPUT} !h-8 !w-auto pr-8`}>
                {PROTECTION_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {PROTECTION_LABEL[l]}
                  </option>
                ))}
              </select>
            </Line>
            {PROTECTION_LEVELS.map((l) => (
              <div key={l} className="border-t border-hair py-2.5">
                <p className="text-[13px] font-medium text-ink">{PROTECTION_LABEL[l]}</p>
                <p className="mt-0.5 text-[12px] leading-[17px] text-neutral-500">{PROTECTION_HINT[l]}</p>
              </div>
            ))}
            <p className="border-t border-hair py-2.5 text-[12px] leading-[17px] text-neutral-500">
              {t(
                "Aucune application ne peut empêcher de photographier un écran. Ces protections font qu’une photo ne montre qu’une bande du document, et que son filigrane porte un code qui désigne la consultation dans le journal.",
                "No app can stop someone from photographing a screen. These protections mean that a photo shows only a band of the document, and that its watermark carries a code that identifies the viewing in the activity log.",
              )}
            </p>
          </div>
        </Panel>

        <Panel title={t("Profil", "Profile")} description={t("Qui consulte ce Vault. Ces informations servent au filigrane personnel.", "Who is viewing this Vault. This information is used for the personal watermark.")}>
          <form
            className={box}
            onSubmit={(e) => {
              e.preventDefault();
              v.setProfile({ name, company, email });
            }}
          >
            <div className="grid gap-3 py-2.5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-neutral-700">{t("Nom", "Name")}</span>
                <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" className={INPUT} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-neutral-700">{t("Société", "Company")}</span>
                <input id="profile-company" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={80} autoComplete="organization" className={INPUT} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[12.5px] font-medium text-neutral-700">{t("Courriel", "Email")}</span>
                <input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} autoComplete="email" className={INPUT} />
              </label>
            </div>
            <div className="flex justify-end border-t border-hair py-2.5">
              <Button size="sm" variant="primary" type="submit" disabled={!dirty || !name.trim()}>
                {t("Enregistrer le profil", "Save profile")}
              </Button>
            </div>
          </form>
        </Panel>

        <Panel title={t("Filigranes", "Watermarks")} description={t("Dissuadent la copie et rappellent d’où vient chaque page.", "They deter copying and recall where each page comes from.")}>
          <div className={box}>
            <SwitchRow
              on={v.watermark}
              onChange={v.setWatermark}
              label={t("Filigrane NDF5", "NDF5 watermark")}
              hint={t("La marque NDF5 Productions en fond de page et sur les pages des documents.", "The NDF5 Productions mark in the page background and on document pages.")}
            />
            <div className="border-t border-hair">
              <SwitchRow
                on={v.personalMark}
                onChange={v.setPersonalMark}
                label={t("Filigrane personnel", "Personal watermark")}
                hint={t("Votre nom, la date et l’heure sur chaque page consultée.", "Your name, the date and the time on every page viewed.")}
              />
            </div>
            <p className="border-t border-hair py-2.5 text-[12px] leading-[17px] text-neutral-500">
              {t("Texte actuel :", "Current text:")} <span className="text-neutral-700">{watermarkText(v.profile)}</span>
            </p>
          </div>
        </Panel>

        <Panel title={t("Stockage", "Storage")} description={t("Où sont gardés vos fichiers et vos changements.", "Where your files and changes are kept.")}>
          <div className={box}>
            <Line
              label={t("Emplacement", "Location")}
              hint={
                persistent
                  ? t("Sur cet appareil seulement. Rien n’est envoyé sur un serveur ni partagé.", "On this device only. Nothing is sent to a server or shared.")
                  : t("Ce navigateur refuse le stockage : tout disparaît au rechargement et le téléversement est désactivé.", "This browser refuses storage: everything disappears on reload and upload is disabled.")
              }
            >
              <Chip className={persistent ? "!border-emerald-300 !text-emerald-700" : "border-dashed"}>
                {persistent ? (security.protected ? t("Ce navigateur, chiffré", "This browser, encrypted") : t("Ce navigateur", "This browser")) : t("Mémoire seulement", "Memory only")}
              </Chip>
            </Line>
            <Line label={t("Fichiers téléversés", "Uploaded files")}>
              <span className="text-[13px] tabular-nums text-neutral-700">
                {uploaded.length}
                {uploaded.length > 0 && ` · ${formatSize(uploadedBytes)}`}
              </span>
            </Line>
            <Line label={t("Fichiers d’exemple", "Sample files")}>
              <span className="text-[13px] tabular-nums text-neutral-700">{files.filter((f) => f.sample).length}</span>
            </Line>
            <Line label={t("Dossiers et projets", "Folders and projects")}>
              <span className="text-[13px] tabular-nums text-neutral-700">
                {folders.length} · {projects.length}
              </span>
            </Line>
            {usage && (
              <Line label={t("Espace utilisé par ce site", "Space used by this site")} hint={t("Estimation du navigateur, tout compris.", "The browser’s estimate, everything included.")}>
                <span className="text-[13px] tabular-nums text-neutral-700">
                  {formatSize(usage.usage)} {t("sur", "of")} {formatSize(usage.quota)}
                </span>
              </Line>
            )}
            {persistent && durable !== null && (
              <Line
                label={t("Stockage durable", "Durable storage")}
                hint={
                  durable
                    ? t("Le navigateur ne supprimera pas ces données pour libérer de l’espace.", "The browser will not delete this data to free up space.")
                    : t("Sans cela, le navigateur peut effacer ces données si le disque se remplit.", "Without it, the browser may erase this data if the disk fills up.")
                }
              >
                {durable ? (
                  <Chip className="!border-emerald-300 !text-emerald-700">{t("Accordé", "Granted")}</Chip>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      void requestPersistence().then((ok) => (setDurable(ok), v.notify(ok ? t("Stockage durable accordé", "Durable storage granted") : t("Le navigateur n’a pas accordé le stockage durable.", "The browser did not grant durable storage."))))
                    }
                  >
                    {t("Demander", "Request")}
                  </Button>
                )}
              </Line>
            )}
            <Line
              label={t("Sauvegarde chiffrée", "Encrypted backup")}
              hint={t(
                "Tout le Vault dans un seul fichier, chiffré par une phrase secrète : dossiers, projets, journal, originaux et versions. À garder hors de cet appareil.",
                "The whole Vault in a single file, encrypted with a passphrase: folders, projects, activity log, originals and versions. Keep it off this device.",
              )}
            >
              <Button size="sm" icon={HardDriveDownload} onClick={() => v.openDialog({ type: "backup" })}>
                {t("Sauvegarder", "Back up")}
              </Button>
              <Button size="sm" icon={HardDriveUpload} disabled={!persistent} onClick={() => v.openDialog({ type: "restore" })}>
                {t("Restaurer", "Restore")}
              </Button>
            </Line>
            <Line
              label={t("Exporter tout le Vault", "Export the whole Vault")}
              hint={t("Une archive ZIP de vos originaux, rangés par dossier, avec un manifeste. Non chiffrée.", "A ZIP archive of your originals, arranged by folder, with a manifest. Not encrypted.")}
            >
              <Button size="sm" icon={Download} disabled={uploaded.length === 0} onClick={() => (security.protected ? v.openDialog({ type: "exportVault" }) : void v.exportVault())}>
                {t("Exporter", "Export")}
              </Button>
            </Line>
            <Line
              label={t("Réinitialiser le Vault", "Reset the Vault")}
              hint={t("Efface tout ce qui a été ajouté dans ce navigateur et remet les données d’exemple.", "Erases everything added in this browser and puts the sample data back.")}
            >
              <Button size="sm" icon={RotateCcw} onClick={() => v.openDialog({ type: "reset" })}>
                {t("Réinitialiser", "Reset")}
              </Button>
            </Line>
          </div>
        </Panel>

        <Panel title={t("Aide", "Help")} description={t("Revoir le fonctionnement du Vault.", "Review how the Vault works.")}>
          <div className={box}>
            <Line label={t("Visite guidée", "Guided tour")} hint={t("Le tour de l’interface, en moins d’une minute.", "A tour of the interface, in under a minute.")}>
              <Button size="sm" onClick={v.startTour}>
                {t("Lancer la visite", "Start the tour")}
              </Button>
            </Line>
          </div>
        </Panel>

        <Panel title={t("État de la version", "Version status")} description={t("Ce qui fonctionne déjà et ce qui reste à construire.", "What already works and what remains to be built.")}>
          <div className={box}>
            {steps().map((s, i) => (
              <Line key={s.label} label={`${i + 1}. ${s.label}`} hint={s.hint}>
                {stepChip(s.state)}
              </Line>
            ))}
          </div>
        </Panel>

        <Panel title={t("Membres", "Members")} description={t("Services d’exemple, en attendant la connexion des invités.", "Sample departments, until guest sign-in arrives.")}>
          <div className={box}>
            {USERS.map((u) => (
              <div key={u.id} className="flex min-h-[52px] items-center gap-3 border-t border-hair py-2 first:border-t-0">
                <Avatar user={u} size={30} />
                <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{u.name}</p>
                <p className="text-[13px] text-neutral-500">{u.role}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t("À propos", "About")}>
          <div className="flex items-center gap-4">
            <Ndf5Logo className="h-9 w-auto text-brand" />
            <div className="text-[13px] leading-[19px]">
              <p className="font-medium text-ink">NDF Vault</p>
              <p className="text-neutral-500">{t("The New Drago Family — gestion des documents et de la production", "The New Drago Family — document and production management")}</p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

"use client";

import { Download, HardDriveDownload, HardDriveUpload, KeyRound, LockKeyhole, RotateCcw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useVault } from "@/lib/store";
import { requestPersistence, storageUsage } from "@/lib/db";
import { USERS } from "@/lib/sample-data";
import { formatMoment, formatSize } from "@/lib/format";
import { watermarkText } from "@/lib/stamp";
import { Ndf5Logo } from "@/components/brand/Brand";
import { INPUT, SwitchRow } from "@/components/dialog-kit";
import { Avatar, Button, Chip, PageHeader } from "@/components/ui";

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

const STEPS: { label: string; hint: string; state: StepState }[] = [
  { label: "Interface", hint: "Navigation, tables, dialogues, visionneuse, recherche", state: "done" },
  { label: "Téléversement", hint: "Plusieurs fichiers, glisser-déposer, contrôle du format, de la taille et du contenu", state: "done" },
  { label: "Stockage persistant", hint: "Dans ce navigateur : vos changements survivent au rechargement", state: "done" },
  { label: "Protection par phrase secrète", hint: "Chiffrement AES-256 de tout ce qui est stocké, verrouillage manuel et automatique", state: "done" },
  { label: "Intégrité et journal", hint: "Empreinte SHA-256 vérifiée à chaque ouverture, journal des accès exportable", state: "done" },
  { label: "Téléchargement et export", hint: "Originaux, copies filigranées (PDF et images), export ZIP", state: "done" },
  { label: "Historique des versions", hint: "Nouvelles versions, restauration et téléchargement des précédentes", state: "done" },
  { label: "Récupération et sauvegarde", hint: "Code de récupération si la phrase est oubliée, sauvegarde chiffrée de tout le Vault et restauration", state: "done" },
  { label: "Aperçu réel", hint: "PDF, images, texte, CSV, et le contenu des fichiers Word, Excel et PowerPoint", state: "done" },
  { label: "Accès des invités", hint: "Connexion par courriel, niveaux d’accès, conditions et NDA à signer", state: "pending" },
  { label: "Serveur", hint: "Stockage privé partagé entre appareils et utilisateurs", state: "pending" },
];

const STEP_CHIP: Record<StepState, ReactNode> = {
  done: <Chip className="!border-emerald-300 !text-emerald-700">Fonctionnel</Chip>,
  partial: <Chip className="!border-amber-300 !text-amber-700">Partiel</Chip>,
  pending: <Chip className="border-dashed text-neutral-500">À venir</Chip>,
};

const AUTO_LOCK = [
  { value: 1, label: "1 minute" },
  { value: 5, label: "5 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 heure" },
  { value: 0, label: "Jamais" },
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

  return (
    <div className="max-w-[980px]">
      <PageHeader title="Réglages" description="Sécurité, profil, stockage et état de cette version." />

      <div className="mt-8">
        <Panel title="Sécurité" description="Protégez ce qui est stocké sur cet appareil avec une phrase secrète.">
          <div className={box}>
            <Line
              label="Protection par phrase secrète"
              hint={
                !security.available
                  ? "Indisponible : ce navigateur refuse le stockage ou le chiffrement."
                  : security.protected
                    ? "Tout ce qui est stocké est chiffré (AES-256). La phrase est demandée à chaque ouverture."
                    : "Sans protection, toute personne ayant accès à cet appareil peut ouvrir le Vault."
              }
            >
              {security.protected ? (
                <>
                  <Chip className="!border-emerald-300 !text-emerald-700">Activée</Chip>
                  <Button size="sm" onClick={() => v.openDialog({ type: "passphrase" })}>
                    Changer
                  </Button>
                  <Button size="sm" onClick={() => v.openDialog({ type: "unprotect" })}>
                    Désactiver
                  </Button>
                </>
              ) : (
                <>
                  <Chip className="border-dashed">Désactivée</Chip>
                  <Button size="sm" variant="primary" disabled={!security.available} onClick={() => v.openDialog({ type: "protect" })}>
                    Activer
                  </Button>
                </>
              )}
            </Line>
            <Line
              label="Code de récupération"
              hint={
                !security.protected
                  ? "Créé avec la protection : il permet de choisir une nouvelle phrase secrète si la vôtre est oubliée."
                  : security.recoveryAt !== null
                    ? `${security.recoveryAt ? `Créé le ${formatMoment(security.recoveryAt)}. ` : ""}Il permet de choisir une nouvelle phrase secrète si la vôtre est oubliée.`
                    : "Aucun code : si la phrase secrète est oubliée, le contenu du Vault sur cet appareil est perdu."
              }
            >
              {security.protected && security.recoveryAt === null && <Chip className="!border-amber-300 !text-amber-700">Aucun</Chip>}
              <Button size="sm" icon={KeyRound} disabled={!security.protected} onClick={() => v.openDialog({ type: "recovery" })}>
                {security.recoveryAt !== null ? "Remplacer le code" : "Créer un code"}
              </Button>
            </Line>
            <Line label="Verrouillage automatique" hint="Verrouille le Vault après une période sans activité.">
              <label className="sr-only" htmlFor="auto-lock">
                Verrouillage automatique
              </label>
              <select id="auto-lock" value={security.autoLockMinutes} disabled={!security.protected} onChange={(e) => v.setAutoLock(Number(e.target.value))} className={`${INPUT} !h-8 !w-auto pr-8 disabled:opacity-50`}>
                {AUTO_LOCK.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Line>
            <Line label="Verrouiller maintenant" hint="Ferme la session : la phrase secrète sera demandée pour rouvrir.">
              <Button size="sm" icon={LockKeyhole} disabled={!security.protected} onClick={() => void v.lockNow()}>
                Verrouiller
              </Button>
            </Line>
          </div>
        </Panel>

        <Panel title="Profil" description="Qui consulte ce Vault. Ces informations servent au filigrane personnel.">
          <form
            className={box}
            onSubmit={(e) => {
              e.preventDefault();
              v.setProfile({ name, company, email });
            }}
          >
            <div className="grid gap-3 py-2.5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-neutral-700">Nom</span>
                <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" className={INPUT} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-neutral-700">Société</span>
                <input id="profile-company" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={80} autoComplete="organization" className={INPUT} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[12.5px] font-medium text-neutral-700">Courriel</span>
                <input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} autoComplete="email" className={INPUT} />
              </label>
            </div>
            <div className="flex justify-end border-t border-hair py-2.5">
              <Button size="sm" variant="primary" type="submit" disabled={!dirty || !name.trim()}>
                Enregistrer le profil
              </Button>
            </div>
          </form>
        </Panel>

        <Panel title="Filigranes" description="Dissuadent la copie et rappellent d’où vient chaque page.">
          <div className={box}>
            <SwitchRow on={v.watermark} onChange={v.setWatermark} label="Filigrane NDF5" hint="La marque NDF5 Productions en fond de page et sur les pages des documents." />
            <div className="border-t border-hair">
              <SwitchRow on={v.personalMark} onChange={v.setPersonalMark} label="Filigrane personnel" hint="Votre nom, la date et l’heure sur chaque page consultée." />
            </div>
            <p className="border-t border-hair py-2.5 text-[12px] leading-[17px] text-neutral-500">
              Texte actuel : <span className="text-neutral-700">{watermarkText(v.profile)}</span>
            </p>
          </div>
        </Panel>

        <Panel title="Stockage" description="Où sont gardés vos fichiers et vos changements.">
          <div className={box}>
            <Line label="Emplacement" hint={persistent ? "Sur cet appareil seulement. Rien n’est envoyé sur un serveur ni partagé." : "Ce navigateur refuse le stockage : tout disparaît au rechargement et le téléversement est désactivé."}>
              <Chip className={persistent ? "!border-emerald-300 !text-emerald-700" : "border-dashed"}>{persistent ? (security.protected ? "Ce navigateur, chiffré" : "Ce navigateur") : "Mémoire seulement"}</Chip>
            </Line>
            <Line label="Fichiers téléversés">
              <span className="text-[13px] tabular-nums text-neutral-700">
                {uploaded.length}
                {uploaded.length > 0 && ` · ${formatSize(uploadedBytes)}`}
              </span>
            </Line>
            <Line label="Fichiers d’exemple">
              <span className="text-[13px] tabular-nums text-neutral-700">{files.filter((f) => f.sample).length}</span>
            </Line>
            <Line label="Dossiers et projets">
              <span className="text-[13px] tabular-nums text-neutral-700">
                {folders.length} · {projects.length}
              </span>
            </Line>
            {usage && (
              <Line label="Espace utilisé par ce site" hint="Estimation du navigateur, tout compris.">
                <span className="text-[13px] tabular-nums text-neutral-700">
                  {formatSize(usage.usage)} sur {formatSize(usage.quota)}
                </span>
              </Line>
            )}
            {persistent && durable !== null && (
              <Line label="Stockage durable" hint={durable ? "Le navigateur ne supprimera pas ces données pour libérer de l’espace." : "Sans cela, le navigateur peut effacer ces données si le disque se remplit."}>
                {durable ? (
                  <Chip className="!border-emerald-300 !text-emerald-700">Accordé</Chip>
                ) : (
                  <Button size="sm" onClick={() => void requestPersistence().then((ok) => (setDurable(ok), v.notify(ok ? "Stockage durable accordé" : "Le navigateur n’a pas accordé le stockage durable.")))}>
                    Demander
                  </Button>
                )}
              </Line>
            )}
            <Line label="Sauvegarde chiffrée" hint="Tout le Vault dans un seul fichier, chiffré par une phrase secrète : dossiers, projets, journal, originaux et versions. À garder hors de cet appareil.">
              <Button size="sm" icon={HardDriveDownload} onClick={() => v.openDialog({ type: "backup" })}>
                Sauvegarder
              </Button>
              <Button size="sm" icon={HardDriveUpload} disabled={!persistent} onClick={() => v.openDialog({ type: "restore" })}>
                Restaurer
              </Button>
            </Line>
            <Line label="Exporter tout le Vault" hint="Une archive ZIP de vos originaux, rangés par dossier, avec un manifeste. Non chiffrée.">
              <Button size="sm" icon={Download} disabled={uploaded.length === 0} onClick={() => void v.exportVault()}>
                Exporter
              </Button>
            </Line>
            <Line label="Réinitialiser le Vault" hint="Efface tout ce qui a été ajouté dans ce navigateur et remet les données d’exemple.">
              <Button size="sm" icon={RotateCcw} onClick={() => v.openDialog({ type: "reset" })}>
                Réinitialiser
              </Button>
            </Line>
          </div>
        </Panel>

        <Panel title="Aide" description="Revoir le fonctionnement du Vault.">
          <div className={box}>
            <Line label="Visite guidée" hint="Le tour de l’interface, en moins d’une minute.">
              <Button size="sm" onClick={v.startTour}>
                Lancer la visite
              </Button>
            </Line>
          </div>
        </Panel>

        <Panel title="État de la version" description="Ce qui fonctionne déjà et ce qui reste à construire.">
          <div className={box}>
            {STEPS.map((s, i) => (
              <Line key={s.label} label={`${i + 1}. ${s.label}`} hint={s.hint}>
                {STEP_CHIP[s.state]}
              </Line>
            ))}
          </div>
        </Panel>

        <Panel title="Membres" description="Services d’exemple, en attendant la connexion des invités.">
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

        <Panel title="À propos">
          <div className="flex items-center gap-4">
            <Ndf5Logo className="h-9 w-auto text-brand" />
            <div className="text-[13px] leading-[19px]">
              <p className="font-medium text-ink">NDF Vault</p>
              <p className="text-neutral-500">The New Drago Family — gestion des documents et de la production</p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

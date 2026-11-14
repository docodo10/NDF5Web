"use client";

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useVault } from "@/lib/store";
import { USERS } from "@/lib/sample-data";
import { formatSize } from "@/lib/format";
import { Ndf5Logo } from "@/components/brand/Brand";
import { SwitchRow } from "@/components/Dialogs";
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
    <div className="flex min-h-11 items-center justify-between gap-4 border-t border-hair py-2 first:border-t-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {hint && <p className="text-[12px] text-neutral-500">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

type StepState = "done" | "partial" | "pending";

const STEPS: { label: string; hint: string; state: StepState }[] = [
  { label: "Interface", hint: "Navigation, tables, dialogues, visionneuse, recherche", state: "done" },
  { label: "Téléversement", hint: "Plusieurs fichiers, glisser-déposer, validation du format et de la taille", state: "done" },
  { label: "Stockage persistant", hint: "Dans ce navigateur : vos changements survivent au rechargement", state: "done" },
  { label: "Téléchargement des originaux", hint: "Pour chaque fichier téléversé", state: "done" },
  { label: "Aperçu réel", hint: "PDF, images, texte et CSV. Les fichiers Office se téléchargent pour l’instant", state: "partial" },
  { label: "Historique des versions", hint: "Versions conservées par fichier", state: "pending" },
  { label: "Accès des invités", hint: "Connexion par courriel, niveaux d’accès, conditions et NDA à signer, filigrane personnel", state: "pending" },
  { label: "Serveur", hint: "Stockage privé partagé, base de données et journal d’activité", state: "pending" },
];

const STEP_CHIP: Record<StepState, ReactNode> = {
  done: <Chip className="!border-emerald-300 !text-emerald-700">Fonctionnel</Chip>,
  partial: <Chip className="!border-amber-300 !text-amber-700">Partiel</Chip>,
  pending: <Chip className="border-dashed text-neutral-500">À venir</Chip>,
};

export function SettingsView() {
  const { watermark, setWatermark, files, folders, projects, persistent, openDialog, startTour } = useVault();
  const box = "rounded-xl border border-line bg-white px-4 py-1.5 shadow-xs";
  const uploaded = files.filter((f) => !f.sample);
  const uploadedBytes = uploaded.reduce((n, f) => n + f.size, 0);

  return (
    <div className="max-w-[980px]">
      <PageHeader title="Réglages" description="Préférences de l’espace de travail et état de cette version." />

      <div className="mt-8">
        <Panel title="Apparence" description="La présence de la marque NDF5 dans l’espace de travail.">
          <div className={box}>
            <SwitchRow on={watermark} onChange={setWatermark} label="Filigrane NDF5" hint="Affiche la marque NDF5 Productions en fond de page et sur les pages des documents." />
          </div>
        </Panel>

        <Panel title="Stockage" description="Où sont gardés vos fichiers et vos changements.">
          <div className={box}>
            <Line label="Emplacement" hint={persistent ? "Sur cet appareil seulement. Rien n’est envoyé sur un serveur ni partagé." : "Ce navigateur refuse le stockage : tout disparaît au rechargement et le téléversement est désactivé."}>
              <Chip className={persistent ? "!border-emerald-300 !text-emerald-700" : "border-dashed"}>{persistent ? "Ce navigateur" : "Mémoire seulement"}</Chip>
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
            <Line label="Réinitialiser le Vault" hint="Efface tout ce qui a été ajouté dans ce navigateur et remet les données d’exemple.">
              <Button size="sm" icon={RotateCcw} onClick={() => openDialog({ type: "reset" })}>
                Réinitialiser
              </Button>
            </Line>
          </div>
        </Panel>

        <Panel title="Aide" description="Revoir le fonctionnement du Vault.">
          <div className={box}>
            <Line label="Visite guidée" hint="Le tour de l’interface en six étapes, en moins d’une minute.">
              <Button size="sm" onClick={startTour}>
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

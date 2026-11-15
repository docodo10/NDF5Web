"use client";

import { Archive, Files, Trash2, User, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { BIN_DAYS, useVault } from "@/lib/store";
import type { VaultFile } from "@/lib/types";
import { CURRENT_USER_ID } from "@/lib/sample-data";
import { activeFiles, byModifiedDesc } from "@/lib/selectors";
import { count } from "@/lib/format";
import { ExplorerToolbar, useFileFilters, type KindGroup } from "@/components/files/Explorer";
import { FileGrid } from "@/components/files/FileGrid";
import { FileTable } from "@/components/files/FileTable";
import { useViewMode } from "@/components/files/view-mode";
import { Button, PageHeader, SegmentedTabs, TextTabs, type TabItem } from "@/components/ui";
import { AddFileMenu, kindTabs, UploadButton } from "./shared";

export type FilesMode = "files" | "private" | "shared" | "favorites" | "recent" | "archived";

const RECENT_COUNT = 20;

const MODES: Record<FilesMode, { title: string; description: string; emptyTitle: string; emptyHint: string }> = {
  files: {
    title: "Tous les fichiers",
    description: "Tous les documents du Vault, tous projets et dossiers confondus.",
    emptyTitle: "Aucun fichier ne correspond",
    emptyHint: "Essayez un autre type, effacez la recherche ou réinitialisez les filtres.",
  },
  private: {
    title: "Fichiers privés",
    description: "Fichiers à visibilité restreinte. Vous seul les voyez.",
    emptyTitle: "Aucun fichier privé",
    emptyHint: "Passez un fichier en Privé depuis Partager et il apparaîtra ici.",
  },
  shared: {
    title: "Partagés avec moi",
    description: "Fichiers que d’autres services ont partagés avec vous.",
    emptyTitle: "Rien n’est partagé avec vous",
    emptyHint: "Les fichiers partagés par d’autres services apparaîtront ici.",
  },
  favorites: {
    title: "Favoris",
    description: "Les fichiers marqués d’une étoile, pour y revenir vite.",
    emptyTitle: "Aucun favori pour l’instant",
    emptyHint: "Survolez un fichier et cliquez sur l’étoile à côté de son nom.",
  },
  recent: {
    title: "Fichiers récents",
    description: `Les ${RECENT_COUNT} fichiers ajoutés ou modifiés le plus récemment.`,
    emptyTitle: "Aucun fichier récent",
    emptyHint: "Les fichiers ajoutés ou modifiés apparaîtront ici.",
  },
  archived: {
    title: "Fichiers archivés",
    description: "Fichiers archivés et supprimés. Les deux peuvent être restaurés.",
    emptyTitle: "Aucun fichier archivé",
    emptyHint: "Archivez un fichier depuis son menu d’actions et il apparaîtra ici.",
  },
};

type Owner = "all" | "mine" | "shared";
type Bin = "archived" | "deleted";

export function FilesView({ mode }: { mode: FilesMode }) {
  const v = useVault();
  const cfg = MODES[mode];
  const [owner, setOwner] = useState<Owner>("all");
  const [bin, setBin] = useState<Bin>("archived");

  const archived = useMemo(() => v.files.filter((f) => f.archived && !f.deleted), [v.files]);
  const deleted = useMemo(() => v.files.filter((f) => f.deleted), [v.files]);

  const base = useMemo<VaultFile[]>(() => {
    const active = activeFiles(v.files);
    switch (mode) {
      case "private":
        return active.filter((f) => f.visibility === "private");
      case "shared":
        return active.filter((f) => f.sharedWithMe);
      case "favorites":
        return active.filter((f) => f.favorite);
      case "recent":
        return [...active].sort(byModifiedDesc).slice(0, RECENT_COUNT);
      case "archived":
        return bin === "archived" ? archived : deleted;
      default:
        return active;
    }
  }, [v.files, mode, bin, archived, deleted]);

  // "View All / My Files / Shared Files" only makes sense where ownership varies.
  const ownerTabs = mode === "files" || mode === "favorites" || mode === "recent";
  const scoped = useMemo(() => {
    if (!ownerTabs || owner === "all") return base;
    return owner === "mine" ? base.filter((f) => f.ownerId === CURRENT_USER_ID) : base.filter((f) => f.sharedWithMe);
  }, [base, owner, ownerTabs]);

  const filters = useFileFilters(scoped);

  const ownerItems: TabItem<Owner>[] = [
    { id: "all", label: "Tout voir", icon: Files },
    { id: "mine", label: "Mes fichiers", icon: User },
    { id: "shared", label: "Partagés", icon: Users },
  ];
  const binItems: TabItem<Bin>[] = [
    { id: "archived", label: "Archivés", icon: Archive, count: archived.length },
    { id: "deleted", label: "Supprimés", icon: Trash2, count: deleted.length },
  ];

  const left =
    mode === "archived" ? (
      <TextTabs<Bin> label="Archivés ou supprimés" items={binItems} value={bin} onChange={setBin} />
    ) : ownerTabs ? (
      <TextTabs<Owner> label="Propriétaire" items={ownerItems} value={owner} onChange={setOwner} />
    ) : (
      <p className="text-[13px] text-neutral-500">
        <span className="font-medium tabular-nums text-ink">{count(filters.filtered.length, "fichier")}</span>
      </p>
    );

  const trash = mode === "archived" && bin === "deleted";
  const [view, setView] = useViewMode();
  // The bin is always a list: restoring and erasing work on selections.
  const grid = view === "grid" && !trash;

  return (
    <div className="space-y-6">
      <PageHeader
        title={cfg.title}
        description={cfg.description}
        actions={
          mode === "archived" ? undefined : (
            <>
              <UploadButton />
              <AddFileMenu />
            </>
          )
        }
      />

      <SegmentedTabs<KindGroup> label="Type de fichier" items={kindTabs(true)} value={filters.state.kind} onChange={(kind) => filters.setState((s) => ({ ...s, kind }))} />

      <div className="space-y-4">
        <ExplorerToolbar left={left} filters={filters} view={trash ? undefined : view} onView={setView} />
        {trash && (
          <div data-bin-notice className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-subtle px-4 py-3">
            <p className="text-[13px] leading-[19px] text-neutral-600">
              Les fichiers supprimés sont conservés <span className="font-medium text-ink">{BIN_DAYS} jours</span>, puis effacés définitivement, originaux et versions compris.
            </p>
            <Button size="sm" icon={Trash2} disabled={deleted.length === 0} onClick={() => v.openDialog({ type: "purge", fileIds: deleted.map((f) => f.id) })}>
              Vider la corbeille
            </Button>
          </div>
        )}
        {grid ? (
          <FileGrid files={filters.filtered} emptyTitle={base.length === 0 ? cfg.emptyTitle : "Aucun fichier ne correspond"} emptyHint={base.length === 0 ? cfg.emptyHint : "Essayez un autre type, effacez la recherche ou réinitialisez les filtres."} />
        ) : (
          <FileTable
            key={trash ? "deleted" : "files"}
            files={filters.filtered}
            trash={trash}
            emptyTitle={trash ? "Aucun fichier supprimé" : base.length === 0 ? cfg.emptyTitle : "Aucun fichier ne correspond"}
            emptyHint={trash ? `Un fichier supprimé reste ici ${BIN_DAYS} jours : le temps de le restaurer.` : base.length === 0 ? cfg.emptyHint : "Essayez un autre type, effacez la recherche ou réinitialisez les filtres."}
          />
        )}
      </div>
    </div>
  );
}

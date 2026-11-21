"use client";

import { Archive, Files, Trash2, User, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { BIN_DAYS, useVault } from "@/lib/store";
import type { VaultFile } from "@/lib/types";
import { CURRENT_USER_ID } from "@/lib/sample-data";
import { activeFiles, byModifiedDesc } from "@/lib/selectors";
import { count } from "@/lib/format";
import { t } from "@/lib/i18n";
import { ExplorerToolbar, useFileFilters, type KindGroup } from "@/components/files/Explorer";
import { FileGrid } from "@/components/files/FileGrid";
import { FileTable } from "@/components/files/FileTable";
import { useViewMode } from "@/components/files/view-mode";
import { Button, PageHeader, SegmentedTabs, TextTabs, type TabItem } from "@/components/ui";
import { AddFileMenu, kindTabs, UploadButton } from "./shared";

export type FilesMode = "files" | "private" | "shared" | "favorites" | "recent" | "archived";

const RECENT_COUNT = 20;

// A function, so that the texts follow the language at the time they are drawn.
const modes = (): Record<FilesMode, { title: string; description: string; emptyTitle: string; emptyHint: string }> => ({
  files: {
    title: t("Tous les fichiers", "All files"),
    description: t("Tous les documents du Vault, tous projets et dossiers confondus.", "Every document in the Vault, across all projects and folders."),
    emptyTitle: t("Aucun fichier ne correspond", "No files match"),
    emptyHint: t("Essayez un autre type, effacez la recherche ou réinitialisez les filtres.", "Try another type, clear the search or reset the filters."),
  },
  private: {
    title: t("Fichiers privés", "Private files"),
    description: t("Fichiers à visibilité restreinte. Vous seul les voyez.", "Files with restricted visibility. Only you can see them."),
    emptyTitle: t("Aucun fichier privé", "No private files"),
    emptyHint: t("Passez un fichier en Privé depuis Partager et il apparaîtra ici.", "Set a file to Private from Share and it will appear here."),
  },
  shared: {
    title: t("Partagés avec moi", "Shared with me"),
    description: t("Fichiers que d’autres services ont partagés avec vous.", "Files that other departments have shared with you."),
    emptyTitle: t("Rien n’est partagé avec vous", "Nothing is shared with you"),
    emptyHint: t("Les fichiers partagés par d’autres services apparaîtront ici.", "Files shared by other departments will appear here."),
  },
  favorites: {
    title: t("Favoris", "Favorites"),
    description: t("Les fichiers marqués d’une étoile, pour y revenir vite.", "Files marked with a star, so you can get back to them quickly."),
    emptyTitle: t("Aucun favori pour l’instant", "No favorites yet"),
    emptyHint: t("Survolez un fichier et cliquez sur l’étoile à côté de son nom.", "Hover over a file and click the star next to its name."),
  },
  recent: {
    title: t("Fichiers récents", "Recent files"),
    description: t(`Les ${RECENT_COUNT} fichiers ajoutés ou modifiés le plus récemment.`, `The ${RECENT_COUNT} most recently added or modified files.`),
    emptyTitle: t("Aucun fichier récent", "No recent files"),
    emptyHint: t("Les fichiers ajoutés ou modifiés apparaîtront ici.", "Files that are added or modified will appear here."),
  },
  archived: {
    title: t("Fichiers archivés", "Archived files"),
    description: t("Fichiers archivés et supprimés. Les deux peuvent être restaurés.", "Archived and deleted files. Both can be restored."),
    emptyTitle: t("Aucun fichier archivé", "No archived files"),
    emptyHint: t("Archivez un fichier depuis son menu d’actions et il apparaîtra ici.", "Archive a file from its actions menu and it will appear here."),
  },
});

type Owner = "all" | "mine" | "shared";
type Bin = "archived" | "deleted";

export function FilesView({ mode }: { mode: FilesMode }) {
  const v = useVault();
  const cfg = modes()[mode];
  const noMatchTitle = t("Aucun fichier ne correspond", "No files match");
  const noMatchHint = t("Essayez un autre type, effacez la recherche ou réinitialisez les filtres.", "Try another type, clear the search or reset the filters.");
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
    { id: "all", label: t("Tout voir", "View all"), icon: Files },
    { id: "mine", label: t("Mes fichiers", "My files"), icon: User },
    { id: "shared", label: t("Partagés", "Shared"), icon: Users },
  ];
  const binItems: TabItem<Bin>[] = [
    { id: "archived", label: t("Archivés", "Archived"), icon: Archive, count: archived.length },
    { id: "deleted", label: t("Supprimés", "Deleted"), icon: Trash2, count: deleted.length },
  ];

  const left =
    mode === "archived" ? (
      <TextTabs<Bin> label={t("Archivés ou supprimés", "Archived or deleted")} items={binItems} value={bin} onChange={setBin} />
    ) : ownerTabs ? (
      <TextTabs<Owner> label={t("Propriétaire", "Owner")} items={ownerItems} value={owner} onChange={setOwner} />
    ) : (
      <p className="text-[13px] text-neutral-500">
        <span className="font-medium tabular-nums text-ink">{t(count(filters.filtered.length, "fichier"), count(filters.filtered.length, "file"))}</span>
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

      <SegmentedTabs<KindGroup> label={t("Type de fichier", "File type")} items={kindTabs(true)} value={filters.state.kind} onChange={(kind) => filters.setState((s) => ({ ...s, kind }))} />

      <div className="space-y-4">
        <ExplorerToolbar left={left} filters={filters} view={trash ? undefined : view} onView={setView} />
        {trash && (
          <div data-bin-notice className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-subtle px-4 py-3">
            <p className="text-[13px] leading-[19px] text-neutral-600">
              {t(
                <>
                  Les fichiers supprimés sont conservés <span className="font-medium text-ink">{BIN_DAYS} jours</span>, puis effacés définitivement, originaux et versions compris.
                </>,
                <>
                  Deleted files are kept for <span className="font-medium text-ink">{BIN_DAYS} days</span>, then erased permanently, originals and versions included.
                </>,
              )}
            </p>
            <Button size="sm" icon={Trash2} disabled={deleted.length === 0} onClick={() => v.openDialog({ type: "purge", fileIds: deleted.map((f) => f.id) })}>
              {t("Vider la corbeille", "Empty trash")}
            </Button>
          </div>
        )}
        {grid ? (
          <FileGrid files={filters.filtered} emptyTitle={base.length === 0 ? cfg.emptyTitle : noMatchTitle} emptyHint={base.length === 0 ? cfg.emptyHint : noMatchHint} />
        ) : (
          <FileTable
            key={trash ? "deleted" : "files"}
            files={filters.filtered}
            trash={trash}
            emptyTitle={trash ? t("Aucun fichier supprimé", "No deleted files") : base.length === 0 ? cfg.emptyTitle : noMatchTitle}
            emptyHint={trash ? t(`Un fichier supprimé reste ici ${BIN_DAYS} jours : le temps de le restaurer.`, `A deleted file stays here for ${BIN_DAYS} days: time enough to restore it.`) : base.length === 0 ? cfg.emptyHint : noMatchHint}
          />
        )}
      </div>
    </div>
  );
}

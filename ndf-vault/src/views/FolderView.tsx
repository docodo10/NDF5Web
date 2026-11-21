"use client";

import { FolderPlus, FolderSearch } from "lucide-react";
import { FolderIcon } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import { useVault } from "@/lib/store";
import { activeFiles } from "@/lib/selectors";
import { count, descendantIds, folderLabel, folderPath } from "@/lib/format";
import { t } from "@/lib/i18n";
import { ExplorerToolbar, useFileFilters } from "@/components/files/Explorer";
import { FileGrid } from "@/components/files/FileGrid";
import { FileTable } from "@/components/files/FileTable";
import { useFolderDrop } from "@/components/files/drop";
import { useViewMode } from "@/components/files/view-mode";
import { Button, EmptyState, PageHeader, TextTabs, type TabItem } from "@/components/ui";
import { Breadcrumbs, FolderMenu, SectionTitle, UploadButton } from "./shared";

/** A subfolder tile that takes the files dropped on it. */
function FolderCard({ folderId, children }: { folderId: string; children: ReactNode }) {
  const drop = useFolderDrop(folderId);
  return (
    <li {...drop.props} data-drop-folder={folderId} className={drop.over ? "rounded-[10px] ring-2 ring-ink ring-offset-2" : undefined}>
      {children}
    </li>
  );
}

type Depth = "direct" | "nested";

export function FolderView({ id }: { id: string }) {
  const v = useVault();
  const folder = v.folders.find((f) => f.id === id);

  const subfolders = useMemo(() => v.folders.filter((f) => f.parentId === id), [v.folders, id]);
  const active = useMemo(() => activeFiles(v.files), [v.files]);
  const direct = useMemo(() => active.filter((f) => f.folderId === id), [active, id]);
  const nested = useMemo(() => {
    const ids = descendantIds(v.folders, id);
    return active.filter((f) => ids.has(f.folderId));
  }, [active, v.folders, id]);

  // A folder that only holds subfolders opens on everything beneath it.
  const [depth, setDepth] = useState<Depth>(() => (direct.length === 0 && nested.length > 0 ? "nested" : "direct"));
  const filters = useFileFilters(depth === "direct" ? direct : nested);
  const [view, setView] = useViewMode();

  if (!folder) {
    return (
      <div className="rounded-xl border border-line bg-white">
        <EmptyState icon={FolderSearch} title={t("Dossier introuvable", "Folder not found")} hint={t("Ce dossier n’existe pas ou a été retiré.", "This folder does not exist or has been removed.")} />
        <div className="-mt-8 flex justify-center pb-12">
          <Button onClick={() => v.navigate({ view: "files" })}>{t("Voir tous les fichiers", "View all files")}</Button>
        </div>
      </div>
    );
  }

  const path = folderPath(v.folders, id);
  const countIn = (folderId: string) => {
    const ids = descendantIds(v.folders, folderId);
    return active.filter((f) => ids.has(f.folderId)).length;
  };

  const depthItems: TabItem<Depth>[] = [
    { id: "direct", label: t("Ce dossier", "This folder"), count: direct.length },
    { id: "nested", label: t("Avec les sous-dossiers", "With subfolders"), count: nested.length },
  ];
  const emptyFolder = depth === "direct" && direct.length === 0;
  const emptyTitle = emptyFolder ? t("Ce dossier est vide", "This folder is empty") : t("Aucun fichier ne correspond", "No files match");
  const emptyHint = emptyFolder
    ? t("Glissez des fichiers ou un dossier ici, ou utilisez Téléverser.", "Drag files or a folder here, or use Upload.")
    : t("Effacez la recherche ou réinitialisez les filtres.", "Clear the search or reset the filters.");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={path.length > 1 ? <Breadcrumbs items={path.map((f) => ({ label: f.name, onClick: () => v.navigate({ view: "folder", id: f.id }) }))} /> : undefined}
        title={folderLabel(folder)}
        description={t(
          `${count(nested.length, "fichier")} · ${count(subfolders.length, "sous-dossier")}${folder.access ? ` · Accès prévu : ${folder.access}` : ""}`,
          `${count(nested.length, "file")} · ${count(subfolders.length, "subfolder")}${folder.access ? ` · Planned access: ${folder.access}` : ""}`,
        )}
        actions={
          <>
            <Button icon={FolderPlus} onClick={() => v.openDialog({ type: "newFolder", parentId: id })}>
              {t("Nouveau dossier", "New folder")}
            </Button>
            <UploadButton folderId={id} />
            <FolderMenu folder={folder} fileIds={nested.map((f) => f.id)} />
          </>
        }
      />

      {subfolders.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>{t("Dossiers", "Folders")}</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {subfolders.map((f) => {
              const n = countIn(f.id);
              return (
                <FolderCard key={f.id} folderId={f.id}>
                  <button
                    type="button"
                    onClick={() => v.navigate({ view: "folder", id: f.id })}
                    title={f.access ? t(`Accès prévu : ${f.access}`, `Planned access: ${f.access}`) : undefined}
                    className="flex h-[60px] w-full items-center gap-3 rounded-[10px] border border-line bg-white px-3 text-left shadow-xs transition-colors duration-150 hover:border-neutral-300 hover:bg-subtle"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-fill text-neutral-700">
                      {f.index ? <span className="text-[13px] font-semibold tabular-nums">{f.index}</span> : <FolderIcon weight="fill" className="size-[19px]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{f.name}</span>
                      <span className="block truncate text-[12.5px] text-neutral-500">
                        {f.code ? `${f.code} · ` : ""}
                        {t(count(n, "fichier"), count(n, "file"))}
                        {f.access ? ` · ${f.access}` : ""}
                      </span>
                    </span>
                  </button>
                </FolderCard>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <SectionTitle>{t("Fichiers", "Files")}</SectionTitle>
        <ExplorerToolbar left={subfolders.length > 0 ? <TextTabs<Depth> label={t("Profondeur", "Depth")} items={depthItems} value={depth} onChange={setDepth} /> : undefined} filters={filters} view={view} onView={setView} />
        {view === "grid" ? <FileGrid files={filters.filtered} emptyTitle={emptyTitle} emptyHint={emptyHint} /> : <FileTable files={filters.filtered} emptyTitle={emptyTitle} emptyHint={emptyHint} />}
      </section>
    </div>
  );
}

"use client";

import { FolderPlus, FolderSearch } from "lucide-react";
import { FolderIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useVault } from "@/lib/store";
import { activeFiles } from "@/lib/selectors";
import { count, descendantIds, folderLabel, folderPath } from "@/lib/format";
import { ExplorerToolbar, useFileFilters } from "@/components/files/Explorer";
import { FileTable } from "@/components/files/FileTable";
import { Button, EmptyState, PageHeader, TextTabs, type TabItem } from "@/components/ui";
import { AddFileMenu, Breadcrumbs, SectionTitle, UploadButton } from "./shared";

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

  if (!folder) {
    return (
      <div className="rounded-xl border border-line bg-white">
        <EmptyState icon={FolderSearch} title="Dossier introuvable" hint="Ce dossier n’existe pas ou a été retiré." />
        <div className="-mt-8 flex justify-center pb-12">
          <Button onClick={() => v.navigate({ view: "files" })}>Voir tous les fichiers</Button>
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
    { id: "direct", label: "Ce dossier", count: direct.length },
    { id: "nested", label: "Avec les sous-dossiers", count: nested.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={path.length > 1 ? <Breadcrumbs items={path.map((f) => ({ label: f.name, onClick: () => v.navigate({ view: "folder", id: f.id }) }))} /> : undefined}
        title={folderLabel(folder)}
        description={`${count(nested.length, "fichier")} · ${count(subfolders.length, "sous-dossier")}${folder.access ? ` · Accès prévu : ${folder.access}` : ""}`}
        actions={
          <>
            <Button icon={FolderPlus} onClick={() => v.openDialog({ type: "newFolder", parentId: id })}>
              Nouveau dossier
            </Button>
            <UploadButton folderId={id} />
            <AddFileMenu folderId={id} />
          </>
        }
      />

      {subfolders.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Dossiers</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {subfolders.map((f) => {
              const n = countIn(f.id);
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => v.navigate({ view: "folder", id: f.id })}
                    title={f.access ? `Accès prévu : ${f.access}` : undefined}
                    className="flex h-[60px] w-full items-center gap-3 rounded-[10px] border border-line bg-white px-3 text-left shadow-xs transition-colors duration-150 hover:border-neutral-300 hover:bg-subtle"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-fill text-neutral-700">
                      {f.index ? <span className="text-[13px] font-semibold tabular-nums">{f.index}</span> : <FolderIcon weight="fill" className="size-[19px]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{f.name}</span>
                      <span className="block truncate text-[12.5px] text-neutral-500">
                        {f.code ? `${f.code} · ` : ""}
                        {count(n, "fichier")}
                        {f.access ? ` · ${f.access}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <SectionTitle>Fichiers</SectionTitle>
        <ExplorerToolbar left={subfolders.length > 0 ? <TextTabs<Depth> label="Profondeur" items={depthItems} value={depth} onChange={setDepth} /> : undefined} filters={filters} />
        <FileTable
          files={filters.filtered}
          emptyTitle={depth === "direct" && direct.length === 0 ? "Ce dossier est vide" : "Aucun fichier ne correspond"}
          emptyHint={depth === "direct" && direct.length === 0 ? "Téléversez des fichiers ici, ou déplacez-en depuis un menu d’actions." : "Effacez la recherche ou réinitialisez les filtres."}
        />
      </section>
    </div>
  );
}

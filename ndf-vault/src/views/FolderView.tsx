"use client";

import { Folder as FolderIcon, FolderPlus, FolderSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { useVault } from "@/lib/store";
import { activeFiles } from "@/lib/selectors";
import { descendantIds, folderLabel, folderPath } from "@/lib/format";
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
        <EmptyState icon={FolderSearch} title="Folder not found" hint="This folder does not exist or was removed." />
        <div className="-mt-8 flex justify-center pb-12">
          <Button onClick={() => v.navigate({ view: "files" })}>Go to All Files</Button>
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
    { id: "direct", label: "This folder", count: direct.length },
    { id: "nested", label: "Including subfolders", count: nested.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={path.length > 1 ? <Breadcrumbs items={path.map((f) => ({ label: f.name, onClick: () => v.navigate({ view: "folder", id: f.id }) }))} /> : undefined}
        title={folderLabel(folder)}
        description={`${nested.length} ${nested.length === 1 ? "file" : "files"} · ${subfolders.length} ${subfolders.length === 1 ? "subfolder" : "subfolders"}`}
        actions={
          <>
            <Button icon={FolderPlus} onClick={() => v.openDialog({ type: "newFolder", parentId: id })}>
              New Folder
            </Button>
            <UploadButton folderId={id} />
            <AddFileMenu folderId={id} />
          </>
        }
      />

      {subfolders.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Folders</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {subfolders.map((f) => {
              const n = countIn(f.id);
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => v.navigate({ view: "folder", id: f.id })}
                    className="flex h-[60px] w-full items-center gap-3 rounded-[10px] border border-line bg-white px-3 text-left shadow-xs transition-colors duration-150 hover:border-neutral-300 hover:bg-subtle"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-neutral-600 shadow-xs">
                      <FolderIcon className="size-[17px]" strokeWidth={1.6} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{f.name}</span>
                      <span className="block truncate text-[12.5px] text-neutral-500">
                        {f.code ? `${f.code} · ` : ""}
                        {n} {n === 1 ? "file" : "files"}
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
        <SectionTitle>Files</SectionTitle>
        <ExplorerToolbar left={subfolders.length > 0 ? <TextTabs<Depth> label="Folder depth" items={depthItems} value={depth} onChange={setDepth} /> : undefined} filters={filters} />
        <FileTable
          files={filters.filtered}
          emptyTitle={depth === "direct" && direct.length === 0 ? "This folder has no files yet" : "No files match this view"}
          emptyHint={depth === "direct" && direct.length === 0 ? "Move files here from any actions menu. Uploads arrive with the storage step." : "Clear the search or reset the filters."}
        />
      </section>
    </div>
  );
}

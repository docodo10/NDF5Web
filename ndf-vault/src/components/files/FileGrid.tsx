"use client";

import { FolderSearch, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useVault } from "@/lib/store";
import type { VaultFile } from "@/lib/types";
import { startFileDrag } from "@/lib/dnd";
import { formatDate, fullName, KIND_LABEL } from "@/lib/format";
import { PROTECTION_LABEL } from "@/lib/protection";
import { Button, EmptyState } from "../ui";
import { FileContextMenu, FileIcon, RowMenu } from "./FileTable";

const STEP = 48;

/** A small picture of an image file. Only for images that may be shown freely: a protected one never leaves the viewer. */
function Thumb({ file }: { file: VaultFile }) {
  const { readOriginal } = useVault();
  const [url, setUrl] = useState<string | null>(null);
  const showable = file.kind === "image" && !file.sample && !file.protection;
  useEffect(() => {
    if (!showable) return;
    let alive = true;
    let made: string | null = null;
    void readOriginal(file).then((r) => {
      if (!alive || r.status !== "ok") return;
      made = URL.createObjectURL(r.blob);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // Reloaded when the content changes, not on every edit of the file's details.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, file.sha256, showable]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" draggable={false} className="h-full w-full object-cover" /> : <FileIcon kind={file.kind} size={52} />;
}

/** Files as tiles, the way file services show them when asked for a grid. Same actions as the list: click, right click, drag. */
export function FileGrid({ files, emptyTitle, emptyHint }: { files: VaultFile[]; emptyTitle: string; emptyHint?: string }) {
  const v = useVault();
  const [shown, setShown] = useState(STEP);
  const listIds = files.map((f) => f.id);
  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-white">
        <EmptyState icon={FolderSearch} title={emptyTitle} hint={emptyHint} />
      </div>
    );
  }
  return (
    <div>
      <ul aria-label="Fichiers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {files.slice(0, shown).map((f) => (
          <FileContextMenu key={f.id} file={f} listIds={listIds}>
            <li
              data-file-tile
              draggable={!f.deleted}
              onDragStart={(e) => startFileDrag(e, [f.id])}
              className="group relative overflow-hidden rounded-xl border border-line bg-white shadow-xs transition-colors duration-150 hover:border-neutral-300"
            >
              <button type="button" onClick={() => v.openPreview(f.id, listIds)} title={fullName(f)} aria-label={`Ouvrir ${fullName(f)}`} className="block w-full text-left">
                <span className="flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-hair bg-subtle">
                  <Thumb file={f} />
                </span>
                <span className="block px-3 pb-3 pt-2.5">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-medium text-ink">{f.name}</span>
                    {f.protection && <Lock aria-label={PROTECTION_LABEL[f.protection]} className="size-3.5 shrink-0 text-neutral-500" strokeWidth={2} />}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-neutral-500">
                    {KIND_LABEL[f.kind]} · {formatDate(f.modifiedAt)}
                  </span>
                </span>
              </button>
              <div className="absolute right-1.5 top-1.5 rounded-lg bg-white/90 opacity-0 shadow-xs transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                <RowMenu file={f} listIds={listIds} vertical />
              </div>
            </li>
          </FileContextMenu>
        ))}
      </ul>
      {files.length > shown && (
        <div className="mt-4 flex justify-center">
          <Button onClick={() => setShown((n) => n + STEP)}>Afficher plus ({files.length - shown} restants)</Button>
        </div>
      )}
    </div>
  );
}

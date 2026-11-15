"use client";

import { useState, type DragEvent } from "react";
import { useVault } from "@/lib/store";
import { droppedFileIds, isFileDrag } from "@/lib/dnd";

/**
 * Make an element a place to drop files of the vault: dropping moves them into
 * the folder. `over` is true while a drag is above it, to light it up.
 */
export function useFolderDrop(folderId: string) {
  const { files, moveFiles } = useVault();
  const [over, setOver] = useState(false);
  const props = {
    onDragEnter: (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(false);
      // Files already in this folder have nowhere to go.
      const ids = droppedFileIds(e).filter((id) => files.some((f) => f.id === id && f.folderId !== folderId && !f.deleted));
      if (ids.length) moveFiles(ids, folderId);
    },
  };
  return { over, props };
}

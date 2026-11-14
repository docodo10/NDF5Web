"use client";

import { Archive, Files, Trash2, User, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useVault } from "@/lib/store";
import type { VaultFile } from "@/lib/types";
import { CURRENT_USER_ID } from "@/lib/sample-data";
import { activeFiles, byModifiedDesc } from "@/lib/selectors";
import { ExplorerToolbar, useFileFilters, type KindGroup } from "@/components/files/Explorer";
import { FileTable } from "@/components/files/FileTable";
import { PageHeader, SegmentedTabs, TextTabs, type TabItem } from "@/components/ui";
import { AddFileMenu, kindTabs, UploadButton } from "./shared";

export type FilesMode = "files" | "private" | "shared" | "favorites" | "recent" | "archived";

const RECENT_COUNT = 20;

const MODES: Record<FilesMode, { title: string; description: string; emptyTitle: string; emptyHint: string }> = {
  files: {
    title: "All Files",
    description: "Every document in the vault, across all projects and folders.",
    emptyTitle: "No files match this view",
    emptyHint: "Try another file type, clear the search, or reset the filters.",
  },
  private: {
    title: "Private Files",
    description: "Files with restricted visibility. Only you can see them.",
    emptyTitle: "No private files",
    emptyHint: "Set a file to Private in Share or Edit Details and it will appear here.",
  },
  shared: {
    title: "Shared With Me",
    description: "Files that other departments have shared with you.",
    emptyTitle: "Nothing shared with you",
    emptyHint: "Files shared with you by other departments will appear here.",
  },
  favorites: {
    title: "Favorites",
    description: "Files you starred for quick access.",
    emptyTitle: "No favorites yet",
    emptyHint: "Hover a file and click the star next to its name to add it here.",
  },
  recent: {
    title: "Recent Files",
    description: `The ${RECENT_COUNT} most recently added or updated files.`,
    emptyTitle: "No recent files",
    emptyHint: "Files you add or update will appear here.",
  },
  archived: {
    title: "Archived Files",
    description: "Archived and deleted files. Both can be restored.",
    emptyTitle: "No archived files",
    emptyHint: "Archive a file from its actions menu and it will appear here.",
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
    { id: "all", label: "View All", icon: Files },
    { id: "mine", label: "My Files", icon: User },
    { id: "shared", label: "Shared Files", icon: Users },
  ];
  const binItems: TabItem<Bin>[] = [
    { id: "archived", label: "Archived", icon: Archive, count: archived.length },
    { id: "deleted", label: "Deleted", icon: Trash2, count: deleted.length },
  ];

  const left =
    mode === "archived" ? (
      <TextTabs<Bin> label="Archived or deleted" items={binItems} value={bin} onChange={setBin} />
    ) : ownerTabs ? (
      <TextTabs<Owner> label="Ownership" items={ownerItems} value={owner} onChange={setOwner} />
    ) : (
      <p className="text-[13px] text-neutral-500">
        <span className="font-medium tabular-nums text-ink">{filters.filtered.length}</span> {filters.filtered.length === 1 ? "file" : "files"}
      </p>
    );

  const trash = mode === "archived" && bin === "deleted";

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

      <SegmentedTabs<KindGroup> label="File type" items={kindTabs(true)} value={filters.state.kind} onChange={(kind) => filters.setState((s) => ({ ...s, kind }))} />

      <div className="space-y-4">
        <ExplorerToolbar left={left} filters={filters} />
        <FileTable
          key={trash ? "deleted" : "files"}
          files={filters.filtered}
          trash={trash}
          emptyTitle={trash ? "No deleted files" : base.length === 0 ? cfg.emptyTitle : "No files match this view"}
          emptyHint={trash ? "Deleted files stay here until they are restored." : base.length === 0 ? cfg.emptyHint : "Try another file type, clear the search, or reset the filters."}
        />
      </div>
    </div>
  );
}

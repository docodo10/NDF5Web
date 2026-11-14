"use client";

import { FileSpreadsheet, FileType, FolderKanban, FolderPlus, Pin, PinOff, Plus } from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";
import { useVault } from "@/lib/store";
import { activeFiles, byCreatedDesc, byModifiedDesc } from "@/lib/selectors";
import { formatSize } from "@/lib/format";
import { ExplorerToolbar, useFileFilters, type KindGroup } from "@/components/files/Explorer";
import { FileIcon, FileTable } from "@/components/files/FileTable";
import { PageHeader, SampleNotice, SegmentedTabs, TextTabs, type TabItem } from "@/components/ui";
import { kindTabs, SectionTitle } from "./shared";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

type Scope = "recent" | "modified" | "shared" | "all";

const SCOPES: TabItem<Scope>[] = [
  { id: "recent", label: "Recent files" },
  { id: "modified", label: "Recently modified" },
  { id: "shared", label: "Shared with me" },
  { id: "all", label: "All files" },
];

const RECENT_COUNT = 14;

function ActionCard({ icon: Icon, label, onClick }: { icon: IconType; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-[88px] flex-col justify-between rounded-[10px] border border-line bg-white p-3.5 text-left shadow-xs transition-colors duration-150 hover:border-neutral-300 hover:bg-subtle"
    >
      <span className="flex items-start justify-between">
        <span className="flex size-8 items-center justify-center rounded-lg border border-line bg-white text-neutral-700 shadow-xs">
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <Plus className="size-4 text-neutral-400 transition-colors duration-150 group-hover:text-ink" strokeWidth={1.75} />
      </span>
      <span className="text-[13px] font-medium text-ink">{label}</span>
    </button>
  );
}

export function Home() {
  const v = useVault();
  const active = useMemo(() => activeFiles(v.files), [v.files]);
  const [scope, setScope] = useState<Scope>("recent");

  const scoped = useMemo(() => {
    switch (scope) {
      case "recent":
        return [...active].sort(byCreatedDesc).slice(0, RECENT_COUNT);
      case "modified":
        return [...active].sort(byModifiedDesc).slice(0, RECENT_COUNT);
      case "shared":
        return active.filter((f) => f.sharedWithMe);
      default:
        return active;
    }
  }, [active, scope]);

  const filters = useFileFilters(scoped);
  const pinned = useMemo(() => active.filter((f) => f.pinned).sort(byModifiedDesc), [active]);
  const pinnedIds = pinned.map((f) => f.id);

  return (
    <div className="space-y-8">
      <PageHeader title="Welcome to NDF Vault" description="The New Drago Family — Production & Document Management" actions={<SampleNotice />} />

      <section aria-label="Quick actions" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <ActionCard icon={FileType} label="New Document" onClick={() => v.notReady("New Document")} />
        <ActionCard icon={FileSpreadsheet} label="New Spreadsheet" onClick={() => v.notReady("New Spreadsheet")} />
        <ActionCard icon={FolderPlus} label="New Folder" onClick={() => v.openDialog({ type: "newFolder", parentId: "root" })} />
        <ActionCard icon={FolderKanban} label="New Project" onClick={() => v.openDialog({ type: "newProject" })} />
      </section>

      <section className="space-y-4">
        <SectionTitle>File explorer</SectionTitle>

        <ExplorerToolbar
          left={<SegmentedTabs<KindGroup> label="File type" items={kindTabs(false)} value={filters.state.kind} onChange={(kind) => filters.setState((s) => ({ ...s, kind }))} />}
          filters={filters}
        />

        {pinned.length > 0 ? (
          <ul aria-label="Pinned files" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pinned.map((f) => (
              <li key={f.id} className="group relative flex h-[60px] items-center gap-3 rounded-[10px] border border-line bg-white pl-3 pr-2 shadow-xs transition-colors duration-150 hover:border-neutral-300">
                <FileIcon kind={f.kind} />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => v.openPreview(f.id, pinnedIds)}
                    className="block max-w-full truncate text-left text-[13.5px] font-medium text-ink before:absolute before:inset-0 before:rounded-[10px] before:content-['']"
                  >
                    {f.name}
                  </button>
                  <p className="truncate text-[12.5px] text-neutral-500">
                    {formatSize(f.size)} · {f.ext}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Unpin ${f.name}`}
                  title="Unpin from Home"
                  onClick={() => v.togglePinned(f.id)}
                  className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors duration-150 hover:bg-fill hover:text-ink"
                >
                  <Pin className="size-4 group-hover:hidden" strokeWidth={1.75} />
                  <PinOff className="hidden size-4 group-hover:block" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[10px] border border-dashed border-line bg-subtle px-4 py-3.5 text-[13px] text-neutral-500">
            No pinned files. Use <span className="font-medium text-neutral-700">Pin to Home</span> in a file&rsquo;s actions menu to keep it here.
          </p>
        )}

        <TextTabs<Scope> label="File scope" items={SCOPES} value={scope} onChange={setScope} />

        <FileTable
          variant="compact"
          files={filters.filtered}
          emptyTitle="No files match this view"
          emptyHint="Try another file type, clear the search, or reset the filters."
        />
      </section>
    </div>
  );
}

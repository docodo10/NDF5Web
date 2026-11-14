"use client";

import clsx from "clsx";
import * as Popover from "@radix-ui/react-popover";
import { ListFilter, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useVault } from "@/lib/store";
import type { FileKind, FileStatus, Folder, Project, VaultFile } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { USERS } from "@/lib/sample-data";
import { formatDate, KIND_LABEL } from "@/lib/format";
import { Button } from "../ui";
import { POPOVER_CONTENT } from "./menu-styles";

export type KindGroup = "all" | "documents" | "spreadsheets" | "pdfs" | "presentations" | "images";

export const KIND_GROUPS: { id: KindGroup; label: string; kinds: FileKind[] }[] = [
  { id: "all", label: "View all", kinds: [] },
  { id: "documents", label: "Documents", kinds: ["docx", "txt"] },
  { id: "spreadsheets", label: "Spreadsheets", kinds: ["xlsx", "csv"] },
  { id: "pdfs", label: "PDFs", kinds: ["pdf"] },
  { id: "presentations", label: "Presentations", kinds: ["pptx"] },
  { id: "images", label: "Images", kinds: ["image"] },
];

export type DateRange = "any" | "7" | "30" | "year";

const DATE_OPTIONS: { id: DateRange; label: string }[] = [
  { id: "any", label: "Any time" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "year", label: "This year" },
];

export interface FilterState {
  kind: KindGroup;
  query: string;
  projects: Set<string>; // project ids, or "none"
  statuses: Set<FileStatus>;
  date: DateRange;
}

/** Text search across filename, folder, project, type, tags, notes, date and owner. */
export function fileMatches(f: VaultFile, q: string, folders: Folder[], projects: Project[]): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const project = projects.find((p) => p.id === f.projectId);
  const hay = [
    f.name,
    f.ext,
    KIND_LABEL[f.kind],
    folders.find((d) => d.id === f.folderId)?.name ?? "",
    project ? `${project.code} ${project.name}` : "",
    f.tags.join(" "),
    f.notes,
    f.status,
    formatDate(f.modifiedAt),
    USERS.find((u) => u.id === f.ownerId)?.name ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

export function useFileFilters(base: VaultFile[]) {
  const { folders, projects } = useVault();
  const [state, setState] = useState<FilterState>({ kind: "all", query: "", projects: new Set(), statuses: new Set(), date: "any" });

  const filtered = useMemo(() => {
    const kinds = KIND_GROUPS.find((g) => g.id === state.kind)!.kinds;
    let min = "";
    if (state.date !== "any") {
      const d = new Date();
      if (state.date === "year") d.setMonth(0, 1);
      else d.setDate(d.getDate() - Number(state.date));
      min = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return base.filter(
      (f) =>
        (kinds.length === 0 || kinds.includes(f.kind)) &&
        (state.projects.size === 0 || state.projects.has(f.projectId ?? "none")) &&
        (state.statuses.size === 0 || state.statuses.has(f.status)) &&
        (!min || f.modifiedAt.slice(0, 10) >= min) &&
        fileMatches(f, state.query, folders, projects),
    );
  }, [base, state, folders, projects]);

  const activeCount = state.projects.size + state.statuses.size + (state.date !== "any" ? 1 : 0);
  return { state, setState, filtered, activeCount };
}

type Filters = ReturnType<typeof useFileFilters>;

function Pill({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        "inline-flex h-7 items-center rounded-md border px-2.5 text-[12.5px] font-medium transition-colors duration-150",
        on ? "border-ink bg-ink text-white" : "border-line bg-white text-neutral-600 hover:border-neutral-300 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function toggled<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

export function FilterButton({ filters, hideProject }: { filters: Filters; hideProject?: boolean }) {
  const { projects } = useVault();
  const { state, setState, activeCount } = filters;
  const section = "px-4 py-3.5";
  const heading = "mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400";
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button icon={ListFilter} className="data-[state=open]:bg-fill">
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-1 text-[10.5px] font-semibold text-white">{activeCount}</span>}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={12} className={clsx(POPOVER_CONTENT, "w-[320px] max-w-[calc(100vw-24px)]")}>
          <div className="flex h-11 items-center justify-between border-b border-hair px-4">
            <p className="text-[13px] font-semibold text-ink">Filters</p>
            <button
              type="button"
              disabled={activeCount === 0}
              onClick={() => setState((s) => ({ ...s, projects: new Set(), statuses: new Set(), date: "any" }))}
              className="text-[12.5px] font-medium text-neutral-500 hover:text-ink disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
          {!hideProject && (
            <div className={clsx(section, "border-b border-hair")}>
              <p className={heading}>Project</p>
              <div className="flex flex-wrap gap-1.5">
                {projects.map((p) => (
                  <Pill key={p.id} on={state.projects.has(p.id)} onClick={() => setState((s) => ({ ...s, projects: toggled(s.projects, p.id) }))}>
                    {p.code}
                  </Pill>
                ))}
                <Pill on={state.projects.has("none")} onClick={() => setState((s) => ({ ...s, projects: toggled(s.projects, "none") }))}>
                  No project
                </Pill>
              </div>
            </div>
          )}
          <div className={clsx(section, "border-b border-hair")}>
            <p className={heading}>Status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((st) => (
                <Pill key={st} on={state.statuses.has(st)} onClick={() => setState((s) => ({ ...s, statuses: toggled(s.statuses, st) }))}>
                  {st}
                </Pill>
              ))}
            </div>
          </div>
          <div className={section}>
            <p className={heading}>Last modified</p>
            <div className="flex flex-wrap gap-1.5">
              {DATE_OPTIONS.map((d) => (
                <Pill key={d.id} on={state.date === d.id} onClick={() => setState((s) => ({ ...s, date: d.id }))}>
                  {d.label}
                </Pill>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function SearchField({ value, onChange, placeholder = "Search files" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="relative block min-w-0 flex-1 sm:w-[248px] sm:flex-none">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-neutral-400" strokeWidth={1.75} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-8 text-[13px] text-ink shadow-xs transition-colors duration-150 placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-400 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="absolute right-2 top-2 flex size-5 items-center justify-center rounded text-neutral-400 hover:text-ink">
          <X className="size-3.5" strokeWidth={2} />
        </button>
      )}
    </label>
  );
}

/** Row with a left slot (tabs) and the search + filter controls on the right. */
export function ExplorerToolbar({ left, filters, hideProject }: { left?: ReactNode; filters: Filters; hideProject?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 max-w-full">{left}</div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <SearchField value={filters.state.query} onChange={(query) => filters.setState((s) => ({ ...s, query }))} />
        <FilterButton filters={filters} hideProject={hideProject} />
      </div>
    </div>
  );
}

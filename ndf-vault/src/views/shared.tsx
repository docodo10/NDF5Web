"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ChevronRight, FileImage, FileSpreadsheet, FileText, FileType, FolderPlus, History, LayoutGrid, Plus, Presentation, Upload } from "lucide-react";
import { Fragment, useMemo, type ComponentType, type ReactNode } from "react";
import { useVault } from "@/lib/store";
import type { ActivityItem } from "@/lib/types";
import { USERS } from "@/lib/sample-data";
import { formatDate, formatTime } from "@/lib/format";
import { KIND_GROUPS, type KindGroup } from "@/components/files/Explorer";
import { MENU_CONTENT, MENU_ITEM, MENU_SEPARATOR } from "@/components/files/menu-styles";
import { Avatar, Button, Chip, EmptyState, type TabItem } from "@/components/ui";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

/* ---------------------------------------------------------------- Kind tabs */

const KIND_ICON: Record<KindGroup, IconType> = {
  all: LayoutGrid,
  documents: FileType,
  spreadsheets: FileSpreadsheet,
  pdfs: FileText,
  presentations: Presentation,
  images: FileImage,
};

export function kindTabs(withIcons: boolean): TabItem<KindGroup>[] {
  // With icons this sits right above the "View All / My Files" row, so the first tab is named differently.
  return KIND_GROUPS.map((g) => ({ id: g.id, label: withIcons && g.id === "all" ? "All Types" : g.label, icon: withIcons ? KIND_ICON[g.id] : undefined }));
}

/* -------------------------------------------------------------- Breadcrumbs */

export interface Crumb {
  label: string;
  onClick?: () => void;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-[13px]">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={`${i}-${c.label}`}>
              {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-neutral-300" strokeWidth={2} />}
              <li className="min-w-0">
                {c.onClick && !last ? (
                  <button type="button" onClick={c.onClick} className="-mx-1 rounded px-1 text-neutral-500 transition-colors duration-150 hover:text-ink">
                    {c.label}
                  </button>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-ink" : "text-neutral-500"}>
                    {c.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/* ----------------------------------------------------------- Header actions */

export function UploadButton({ folderId = null }: { folderId?: string | null }) {
  const { openDialog } = useVault();
  return (
    <Button icon={Upload} onClick={() => openDialog({ type: "upload", folderId })}>
      Upload File
    </Button>
  );
}

/** Black "Add File" button with its menu: New document, New spreadsheet, New folder. */
export function AddFileMenu({ folderId = "root" }: { folderId?: string }) {
  const { openDialog, notReady } = useVault();
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button variant="primary" icon={Plus}>
          Add File
          <ChevronDown className="-mr-1 size-3.5 opacity-70" strokeWidth={2} />
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} collisionPadding={12} className={MENU_CONTENT}>
          <Dropdown.Item className={MENU_ITEM} onSelect={() => notReady("New Document")}>
            <FileType className="size-4 text-neutral-500" strokeWidth={1.75} /> New document
          </Dropdown.Item>
          <Dropdown.Item className={MENU_ITEM} onSelect={() => notReady("New Spreadsheet")}>
            <FileSpreadsheet className="size-4 text-neutral-500" strokeWidth={1.75} /> New spreadsheet
          </Dropdown.Item>
          <Dropdown.Separator className={MENU_SEPARATOR} />
          <Dropdown.Item className={MENU_ITEM} onSelect={() => openDialog({ type: "newFolder", parentId: folderId })}>
            <FolderPlus className="size-4 text-neutral-500" strokeWidth={1.75} /> New folder
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

/* ------------------------------------------------------------ Section title */

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{children}</h2>
      {aside}
    </div>
  );
}

/* ----------------------------------------------------------------- Activity */

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Activity entries grouped by day, newest first. */
export function ActivityList({ items, emptyTitle = "No activity yet", emptyHint }: { items: ActivityItem[]; emptyTitle?: string; emptyHint?: string }) {
  const { files, projects, openPreview } = useVault();

  const days = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.at.localeCompare(a.at));
    const out: { day: string; items: ActivityItem[] }[] = [];
    for (const it of sorted) {
      const day = it.at.slice(0, 10);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(it);
      else out.push({ day, items: [it] });
    }
    return out;
  }, [items]);

  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-white">
        <EmptyState icon={History} title={emptyTitle} hint={emptyHint} />
      </div>
    );
  }

  const today = todayIso();
  const yesterday = todayIso(1);
  const projectCode = new Map(projects.map((p) => [p.id, p.code]));

  return (
    <div className="space-y-6">
      {days.map(({ day, items: dayItems }) => (
        <section key={day}>
          <h3 className="mb-2 flex items-baseline gap-2 text-[12.5px] font-medium text-neutral-500">
            {day === today ? "Today" : day === yesterday ? "Yesterday" : formatDate(day)}
            {(day === today || day === yesterday) && <span className="font-normal text-neutral-400">{formatDate(day)}</span>}
          </h3>
          <ul className="overflow-hidden rounded-xl border border-line bg-white">
            {dayItems.map((it, i) => {
              const user = USERS.find((u) => u.id === it.userId);
              const file = files.find((f) => !f.deleted && `${f.name}.${f.ext}` === it.target);
              return (
                <li key={it.id} className={`flex min-h-[56px] items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-hair" : ""}`}>
                  {user && <Avatar user={user} size={30} />}
                  <p className="min-w-0 flex-1 text-[13px] leading-[19px] text-neutral-600">
                    <span className="font-medium text-ink">{user?.name ?? "Someone"}</span> {it.verb}{" "}
                    {file ? (
                      <button type="button" onClick={() => openPreview(file.id)} className="break-words text-left font-medium text-ink underline-offset-2 hover:underline">
                        {it.target}
                      </button>
                    ) : (
                      <span className="break-words font-medium text-ink">{it.target}</span>
                    )}
                  </p>
                  {it.projectId && projectCode.has(it.projectId) && <Chip className="hidden sm:inline-flex">{projectCode.get(it.projectId)}</Chip>}
                  <time dateTime={it.at} className="shrink-0 whitespace-nowrap text-[12.5px] tabular-nums text-neutral-400">
                    {formatTime(it.at)}
                  </time>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

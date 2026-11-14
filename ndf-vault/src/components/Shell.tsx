"use client";

import clsx from "clsx";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Activity, Bell, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings } from "lucide-react";
import {
  ArchiveIcon,
  ClockIcon,
  FilesIcon,
  FolderIcon,
  FolderOpenIcon,
  GearSixIcon,
  HouseIcon,
  KanbanIcon,
  LockSimpleIcon,
  PulseIcon,
  StarIcon,
  UsersIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import { useVault } from "@/lib/store";
import type { Folder, Route } from "@/lib/types";
import { CURRENT_USER_ID, USERS } from "@/lib/sample-data";
import { folderPath } from "@/lib/format";
import { AppWatermark, Ndf5Logo, VaultLockup } from "./brand/Brand";
import { Avatar, IconButton, Kbd } from "./ui";
import { MENU_CONTENT, MENU_ITEM } from "./files/menu-styles";

// Navigation uses filled icons, as in the dashboard reference; actions elsewhere stay outlined.
const NAV: { view: Route["view"]; label: string; icon: PhosphorIcon }[] = [
  { view: "home", label: "Home", icon: HouseIcon },
  { view: "files", label: "All Files", icon: FilesIcon },
  { view: "projects", label: "All Projects", icon: KanbanIcon },
  { view: "private", label: "Private Files", icon: LockSimpleIcon },
  { view: "shared", label: "Shared With Me", icon: UsersIcon },
  { view: "favorites", label: "Favorites", icon: StarIcon },
  { view: "recent", label: "Recent Files", icon: ClockIcon },
  { view: "archived", label: "Archived Files", icon: ArchiveIcon },
  { view: "activity", label: "Activity", icon: PulseIcon },
  { view: "preferences", label: "Settings", icon: GearSixIcon },
];

/* -------------------------------------------------------------- Folder tree */

function TreeNode({ folder, depth, childrenOf, expanded, toggle }: { folder: Folder; depth: number; childrenOf: Map<string, Folder[]>; expanded: Set<string>; toggle: (id: string) => void }) {
  const { route, navigate } = useVault();
  const kids = childrenOf.get(folder.id) ?? [];
  const open = expanded.has(folder.id);
  const active = route.view === "folder" && route.id === folder.id;
  const isRoot = folder.parentId === null;
  return (
    <li>
      <div
        className={clsx(
          "group flex h-[34px] items-center rounded-lg pr-1.5 text-[13.5px] font-medium transition-colors duration-150",
          active ? "bg-neutral-200/60 text-ink" : "text-neutral-600 hover:bg-neutral-200/40 hover:text-ink",
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          aria-label={open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
          aria-expanded={kids.length ? open : undefined}
          onClick={() => kids.length && toggle(folder.id)}
          className={clsx("flex size-6 shrink-0 items-center justify-center rounded text-neutral-400 hover:text-ink", !kids.length && "invisible")}
        >
          <ChevronRight className={clsx("size-3.5 transition-transform duration-150", open && "rotate-90")} strokeWidth={2} />
        </button>
        <button type="button" onClick={() => navigate({ view: "folder", id: folder.id })} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left">
          {isRoot ? null : folder.index ? (
            <span className={clsx("w-[18px] shrink-0 text-center text-[12px] font-semibold tabular-nums", active ? "text-neutral-800" : "text-neutral-400")}>{folder.index}</span>
          ) : open && kids.length ? (
            <FolderOpenIcon weight="fill" className={clsx("size-[18px] shrink-0", active ? "text-neutral-700" : "text-neutral-400")} />
          ) : (
            <FolderIcon weight="fill" className={clsx("size-[18px] shrink-0", active ? "text-neutral-700" : "text-neutral-400")} />
          )}
          <span className={clsx("truncate", isRoot && "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500")}>{folder.name}</span>
          {folder.code && <span className="shrink-0 text-[11.5px] font-medium text-neutral-400">{folder.code}</span>}
        </button>
      </div>
      {open && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <TreeNode key={k.id} folder={k} depth={depth + 1} childrenOf={childrenOf} expanded={expanded} toggle={toggle} />
          ))}
        </ul>
      )}
    </li>
  );
}

function FolderTree() {
  const { folders, route } = useVault();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["root"]));
  const childrenOf = useMemo(() => {
    const m = new Map<string, Folder[]>();
    for (const f of folders) {
      if (!f.parentId) continue;
      m.set(f.parentId, [...(m.get(f.parentId) ?? []), f]);
    }
    return m;
  }, [folders]);

  // Keep the active folder's ancestors open.
  const forced = useMemo(() => {
    if (route.view !== "folder") return expanded;
    const next = new Set(expanded);
    for (const f of folderPath(folders, route.id).slice(0, -1)) next.add(f.id);
    return next;
  }, [expanded, folders, route]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(forced);
      if (prev.has(id) || forced.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const roots = folders.filter((f) => f.parentId === null);
  return (
    <ul>
      {roots.map((r) => (
        <TreeNode key={r.id} folder={r} depth={0} childrenOf={childrenOf} expanded={forced} toggle={toggle} />
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ Sidebar */

function Sidebar() {
  const { route, navigate, setSidebarOpen, openDialog } = useVault();
  const me = USERS.find((u) => u.id === CURRENT_USER_ID)!;
  return (
    <div className="flex h-full w-[264px] flex-col border-r border-line bg-subtle">
      <div className="flex h-14 shrink-0 items-center justify-between pl-5 pr-3">
        <button type="button" onClick={() => navigate({ view: "home" })} aria-label="NDF Vault — Home" className="rounded-md py-1">
          <VaultLockup />
        </button>
        <IconButton icon={PanelLeftClose} label="Collapse sidebar" variant="ghost" size="sm" onClick={() => setSidebarOpen(false)} />
      </div>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <nav aria-label="Main">
          <ul className="space-y-0.5">
            {NAV.map(({ view, label, icon: Icon }) => {
              const active = route.view === view || (view === "projects" && route.view === "project");
              return (
                <li key={view}>
                  <button
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => navigate({ view } as Route)}
                    className={clsx(
                      "flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[14px] transition-colors duration-150",
                      active ? "bg-neutral-200/60 font-semibold text-ink" : "font-medium text-neutral-600 hover:bg-neutral-200/40 hover:text-ink",
                    )}
                  >
                    <Icon weight="fill" className={clsx("size-5 shrink-0 transition-colors duration-150", active ? "text-neutral-800" : "text-neutral-400")} />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mx-1 my-4 h-px bg-line" />

        <div className="mb-1 flex h-7 items-center justify-between pl-2.5 pr-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Browser</span>
          <IconButton icon={Plus} label="New folder" variant="ghost" size="sm" className="!size-6 !rounded-md" onClick={() => openDialog({ type: "newFolder", parentId: route.view === "folder" ? route.id : "root" })} />
        </div>
        <nav aria-label="Folders">
          <FolderTree />
        </nav>
      </div>

      <div className="shrink-0 border-t border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar user={me} size={30} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium text-ink">{me.name}</p>
            <p className="truncate text-[11.5px] text-neutral-500">Local demo workspace</p>
          </div>
          <Ndf5Logo className="h-[18px] w-auto shrink-0 text-neutral-300" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Topbar */

function Topbar() {
  const { sidebarOpen, setSidebarOpen, setPaletteOpen, navigate } = useVault();
  const me = USERS.find((u) => u.id === CURRENT_USER_ID)!;
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-white px-4 sm:px-6 lg:px-8">
      {!sidebarOpen && <IconButton icon={PanelLeftOpen} label="Open sidebar" variant="ghost" onClick={() => setSidebarOpen(true)} className="-ml-2" />}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label="Search the vault"
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-white px-3 text-left text-[13px] text-neutral-400 shadow-xs transition-colors duration-150 hover:border-neutral-300 sm:max-w-[340px]"
      >
        <Search className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="flex-1 truncate">Search files, folders, projects…</span>
        <span className="hidden items-center gap-1 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-3">
        <IconButton icon={Bell} label="Activity" onClick={() => navigate({ view: "activity" })} />
        <span className="hidden h-6 w-px bg-line sm:block" />
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <button type="button" className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-1.5 transition-colors duration-150 hover:bg-fill" aria-label="Account menu">
              <Avatar user={me} size={32} />
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[13px] font-medium text-ink">{me.name}</span>
                <span className="block text-[11.5px] text-neutral-500">{me.role}</span>
              </span>
              <ChevronDown className="hidden size-4 text-neutral-500 sm:block" strokeWidth={1.75} />
            </button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content align="end" sideOffset={6} className={MENU_CONTENT}>
              <Dropdown.Item className={MENU_ITEM} onSelect={() => navigate({ view: "preferences" })}>
                <Settings className="size-4 text-neutral-500" strokeWidth={1.75} /> Settings
              </Dropdown.Item>
              <Dropdown.Item className={MENU_ITEM} onSelect={() => navigate({ view: "activity" })}>
                <Activity className="size-4 text-neutral-500" strokeWidth={1.75} /> Activity
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------- Shell */

export function Shell({ children }: { children: ReactNode }) {
  const { sidebarOpen, setSidebarOpen, watermark } = useVault();
  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Desktop: in-flow sidebar. Tablet/phone: slide-over drawer. */}
      <aside className={clsx("hidden shrink-0 lg:block", !sidebarOpen && "lg:hidden")}>
        <Sidebar />
      </aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close sidebar" className="absolute inset-0 animate-fade bg-neutral-900/20 backdrop-blur-[2px]" onClick={() => setSidebarOpen(false)} />
          <aside className="relative h-full w-[264px] animate-fade shadow-modal">
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="vault-main" className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1360px] px-4 pb-16 pt-7 sm:px-6 lg:px-8">{children}</div>
        </main>
        {watermark && <AppWatermark />}
      </div>
    </div>
  );
}

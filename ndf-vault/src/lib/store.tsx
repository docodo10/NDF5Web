"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityItem, FileStatus, Folder, Project, Route, VaultFile } from "./types";
import { ACTIVITY, CURRENT_USER_ID, FILES, FOLDERS, PROJECTS } from "./sample-data";
import { fullName } from "./format";

/**
 * Interface-stage store.
 *
 * State lives in memory only: it resets on reload. The mutation functions
 * below are the single seam where the persistence layer (IndexedDB demo mode,
 * then Supabase) plugs in during the storage step, so the components never
 * need to change.
 */

export type DialogState =
  | { type: "rename"; fileId: string }
  | { type: "details"; fileId: string }
  | { type: "move"; fileIds: string[] }
  | { type: "share"; fileId: string }
  | { type: "versions"; fileId: string }
  | { type: "delete"; fileIds: string[] }
  | { type: "newFolder"; parentId: string }
  | { type: "newProject" }
  | { type: "upload"; folderId: string | null }
  | null;

export interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

interface PreviewState {
  fileId: string;
  listIds: string[];
  fullscreen?: boolean;
}

interface VaultContext {
  files: VaultFile[];
  folders: Folder[];
  projects: Project[];
  activity: ActivityItem[];
  route: Route;
  navigate: (r: Route) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  watermark: boolean;
  setWatermark: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  dialog: DialogState;
  openDialog: (d: DialogState) => void;
  preview: PreviewState | null;
  openPreview: (fileId: string, listIds?: string[], fullscreen?: boolean) => void;
  closePreview: () => void;
  toast: Toast | null;
  notify: (message: string, undo?: () => void) => void;
  dismissToast: () => void;
  /** For actions whose real implementation belongs to a later build step. */
  notReady: (feature: string) => void;
  // mutations
  toggleFavorite: (id: string) => void;
  togglePinned: (id: string) => void;
  renameFile: (id: string, name: string) => void;
  updateFile: (id: string, patch: Partial<VaultFile>) => void;
  moveFiles: (ids: string[], folderId: string) => void;
  copyFile: (id: string) => void;
  archiveFiles: (ids: string[]) => void;
  restoreFiles: (ids: string[]) => void;
  deleteFiles: (ids: string[]) => void;
  setStatus: (ids: string[], status: FileStatus) => void;
  addFolder: (name: string, parentId: string) => string;
  addProject: (p: { name: string; code: string; period: string }) => string;
}

const Ctx = createContext<VaultContext | null>(null);

export function useVault(): VaultContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVault must be used inside <VaultProvider>");
  return v;
}

const SIMPLE_VIEWS = ["home", "files", "projects", "private", "shared", "favorites", "recent", "archived", "activity", "preferences"] as const;

export function routeToHash(r: Route): string {
  if (r.view === "project") return `#project-${r.id}`;
  if (r.view === "folder") return `#folder-${r.id}`;
  return `#${r.view}`;
}

export function hashToRoute(hash: string): Route {
  const h = hash.replace(/^#/, "");
  if (h.startsWith("project-")) return { view: "project", id: h.slice(8) };
  if (h.startsWith("folder-")) return { view: "folder", id: h.slice(7) };
  const simple = SIMPLE_VIEWS.find((v) => v === h);
  return simple ? ({ view: simple } as Route) : { view: "home" };
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [files, setFiles] = useState<VaultFile[]>(FILES);
  const [folders, setFolders] = useState<Folder[]>(FOLDERS);
  const [projects, setProjects] = useState<Project[]>(PROJECTS);
  const [activity, setActivity] = useState<ActivityItem[]>(ACTIVITY);
  const [route, setRoute] = useState<Route>({ view: "home" });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [watermark, setWatermark] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialog, openDialog] = useState<DialogState>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hash routing: one plain #name per view.
  useEffect(() => {
    const read = () => setRoute(hashToRoute(window.location.hash));
    read();
    if (window.matchMedia("(max-width: 1023px)").matches) setSidebarOpen(false);
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const navigate = useCallback((r: Route) => {
    setRoute(r);
    const hash = routeToHash(r);
    if (window.location.hash !== hash) window.location.hash = hash;
    if (window.matchMedia("(max-width: 1023px)").matches) setSidebarOpen(false);
    document.getElementById("vault-main")?.scrollTo({ top: 0 });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);
  const notify = useCallback((message: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  const notReady = useCallback(
    (feature: string) => notify(`${feature} is not wired yet — it arrives with the storage step.`),
    [notify],
  );

  const log = useCallback((verb: string, target: string, projectId: string | null = null) => {
    setActivity((a) => [{ id: uid("a"), at: nowIso(), userId: CURRENT_USER_ID, verb, target, projectId }, ...a]);
  }, []);

  const patchMany = useCallback((ids: string[], patch: (f: VaultFile) => Partial<VaultFile>) => {
    const set = new Set(ids);
    setFiles((fs) => fs.map((f) => (set.has(f.id) ? { ...f, ...patch(f) } : f)));
  }, []);

  const value = useMemo<VaultContext>(() => {
    const byId = (id: string) => files.find((f) => f.id === id);
    const label = (ids: string[]) => {
      const first = byId(ids[0]);
      return ids.length === 1 && first ? fullName(first) : `${ids.length} files`;
    };
    return {
      files,
      folders,
      projects,
      activity,
      route,
      navigate,
      sidebarOpen,
      setSidebarOpen,
      watermark,
      setWatermark,
      paletteOpen,
      setPaletteOpen,
      dialog,
      openDialog,
      preview,
      openPreview: (fileId, listIds, fullscreen) => setPreview({ fileId, listIds: listIds && listIds.length ? listIds : [fileId], fullscreen }),
      closePreview: () => setPreview(null),
      toast,
      notify,
      dismissToast,
      notReady,
      toggleFavorite: (id) => {
        const f = byId(id);
        if (!f) return;
        patchMany([id], (x) => ({ favorite: !x.favorite }));
        notify(f.favorite ? "Removed from Favorites" : "Added to Favorites");
      },
      togglePinned: (id) => {
        const f = byId(id);
        if (!f) return;
        patchMany([id], (x) => ({ pinned: !x.pinned }));
        notify(f.pinned ? "Unpinned" : "Pinned to Home");
      },
      renameFile: (id, name) => {
        const f = byId(id);
        if (!f || !name.trim()) return;
        patchMany([id], () => ({ name: name.trim(), modifiedAt: nowIso() }));
        log("renamed", `${name.trim()}.${f.ext}`, f.projectId);
        notify("File renamed");
      },
      updateFile: (id, patch) => {
        const f = byId(id);
        if (!f) return;
        patchMany([id], () => ({ ...patch, modifiedAt: nowIso() }));
        log("updated details of", fullName(f), f.projectId);
        notify("Details saved");
      },
      moveFiles: (ids, folderId) => {
        const before = new Map(files.filter((f) => ids.includes(f.id)).map((f) => [f.id, f.folderId]));
        patchMany(ids, () => ({ folderId }));
        log("moved", label(ids));
        const dest = folders.find((f) => f.id === folderId)?.name ?? "folder";
        notify(`Moved ${label(ids)} to ${dest}`, () => patchMany(ids, (f) => ({ folderId: before.get(f.id) ?? f.folderId })));
      },
      copyFile: (id) => {
        const f = byId(id);
        if (!f) return;
        const copy: VaultFile = { ...f, id: uid("f"), name: `${f.name} (copy)`, createdAt: nowIso(), modifiedAt: nowIso(), favorite: false, pinned: false, status: "Draft" };
        setFiles((fs) => [copy, ...fs]);
        log("copied", fullName(f), f.projectId);
        notify(`Copied as “${copy.name}”`, () => setFiles((fs) => fs.filter((x) => x.id !== copy.id)));
      },
      archiveFiles: (ids) => {
        const before = new Map(files.filter((f) => ids.includes(f.id)).map((f) => [f.id, f.status]));
        patchMany(ids, () => ({ archived: true, status: "Archived" as FileStatus, pinned: false }));
        log("archived", label(ids));
        notify(`Archived ${label(ids)}`, () => patchMany(ids, (f) => ({ archived: false, status: before.get(f.id) ?? "Draft" })));
      },
      restoreFiles: (ids) => {
        patchMany(ids, () => ({ archived: false, deleted: false, status: "Draft" as FileStatus }));
        log("restored", label(ids));
        notify(`Restored ${label(ids)}`);
      },
      deleteFiles: (ids) => {
        patchMany(ids, () => ({ deleted: true }));
        log("deleted", label(ids));
        notify(`Deleted ${label(ids)}`, () => patchMany(ids, () => ({ deleted: false })));
      },
      setStatus: (ids, status) => {
        patchMany(ids, () => ({ status, archived: status === "Archived" }));
        notify(`Status set to ${status}`);
      },
      addFolder: (name, parentId) => {
        const id = uid("d");
        setFolders((fs) => [...fs, { id, name: name.trim(), parentId }]);
        log("created folder", name.trim());
        notify(`Folder “${name.trim()}” created`);
        return id;
      },
      addProject: ({ name, code, period }) => {
        const id = uid("p");
        const folderId = uid("d");
        setFolders((fs) => [...fs, { id: folderId, name: name.trim(), code: code.trim() || undefined, parentId: "root" }]);
        setProjects((ps) => [...ps, { id, code: code.trim() || name.trim().slice(0, 3).toUpperCase(), name: name.trim(), period: period.trim() || "Dates to be defined", summary: "New project workspace.", storyYears: [], folderId, archived: false }]);
        log("created project", name.trim());
        notify(`Project “${name.trim()}” created`);
        return id;
      },
    };
  }, [files, folders, projects, activity, route, navigate, sidebarOpen, watermark, paletteOpen, dialog, preview, toast, notify, dismissToast, notReady, log, patchMany]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityItem, FileStatus, Folder, Project, Route, VaultFile } from "./types";
import { ACTIVITY, CURRENT_USER_ID, FILES, FOLDERS, PROJECTS } from "./sample-data";
import { count, fullName, STATUS_LABEL } from "./format";
import * as db from "./db";
import { saveToDisk, type UploadCheck } from "./uploads";

/**
 * The vault's state and every mutation.
 *
 * Components only talk to `useVault()`. Persistence sits behind it: the state
 * is saved to IndexedDB in this browser, uploaded originals are stored there as
 * blobs, and nothing leaves the device. A real backend replaces `db` and
 * `saveToDisk` later without touching the components.
 */

export type DialogState =
  | { type: "rename"; fileId: string }
  | { type: "details"; fileId: string }
  | { type: "move"; fileIds: string[] }
  | { type: "share"; fileId: string }
  | { type: "versions"; fileId: string }
  | { type: "delete"; fileIds: string[] }
  | { type: "purge"; fileIds: string[] }
  | { type: "reset" }
  | { type: "newFolder"; parentId: string }
  | { type: "newProject" }
  | { type: "upload"; folderId: string | null; files?: File[] }
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
  /** True when changes and uploads are kept in this browser; false when it refused storage. */
  persistent: boolean;
  tourOpen: boolean;
  startTour: () => void;
  endTour: () => void;
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
  purgeFiles: (ids: string[]) => void;
  setStatus: (ids: string[], status: FileStatus) => void;
  addFolder: (name: string, parentId: string) => string;
  addProject: (p: { name: string; code: string; period: string }) => string;
  uploadFiles: (items: UploadCheck[], folderId: string, projectId: string | null) => Promise<number>;
  downloadFile: (id: string) => Promise<void>;
  resetVault: () => Promise<void>;
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

const TOUR_KEY = "ndf-vault-tour-done";

function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return false;
  }
}

export function VaultProvider({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [files, setFiles] = useState<VaultFile[]>(FILES);
  const [folders, setFolders] = useState<Folder[]>(FOLDERS);
  const [projects, setProjects] = useState<Project[]>(PROJECTS);
  const [activity, setActivity] = useState<ActivityItem[]>(ACTIVITY);
  const [watermark, setWatermark] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [persistent, setPersistent] = useState(false);
  // The provider only mounts in the browser (see VaultApp), so the first render can read the URL.
  const [route, setRoute] = useState<Route>(() => (typeof window === "undefined" ? { view: "home" } : hashToRoute(window.location.hash)));
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 1023px)").matches);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialog, openDialog] = useState<DialogState>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load what this browser saved, once. Sample data stays if there is nothing (or storage is refused).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [ok, saved] = await Promise.all([db.isAvailable(), db.loadState()]);
      if (!alive) return;
      if (saved) {
        setFiles(saved.files);
        setFolders(saved.folders);
        setProjects(saved.projects);
        setActivity(saved.activity);
        setWatermark(saved.watermark);
      }
      setPersistent(ok);
      setHydrated(true);
      if (!tourSeen()) setTourOpen(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Save after every change, shortly after the last one.
  useEffect(() => {
    if (!hydrated || !persistent) return;
    const t = setTimeout(() => {
      void db.saveState({ schema: db.SCHEMA, files, folders, projects, activity: activity.slice(0, 200), watermark });
    }, 250);
    return () => clearTimeout(t);
  }, [hydrated, persistent, files, folders, projects, activity, watermark]);

  // Hash routing: one plain #name per view.
  useEffect(() => {
    const read = () => setRoute(hashToRoute(window.location.hash));
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

  const log = useCallback((verb: string, target: string, projectId: string | null = null) => {
    setActivity((a) => [{ id: uid("a"), at: nowIso(), userId: CURRENT_USER_ID, verb, target, projectId }, ...a]);
  }, []);

  const patchMany = useCallback((ids: string[], patch: (f: VaultFile) => Partial<VaultFile>) => {
    const set = new Set(ids);
    setFiles((fs) => fs.map((f) => (set.has(f.id) ? { ...f, ...patch(f) } : f)));
  }, []);

  const startTour = useCallback(() => {
    setPreview(null);
    openDialog(null);
    setPaletteOpen(false);
    navigate({ view: "home" });
    setTourOpen(true);
  }, [navigate]);
  const endTour = useCallback(() => {
    setTourOpen(false);
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      /* the tour simply shows again next time */
    }
  }, []);

  const value = useMemo<VaultContext>(() => {
    const byId = (id: string) => files.find((f) => f.id === id);
    const label = (ids: string[]) => {
      const first = byId(ids[0]);
      return ids.length === 1 && first ? fullName(first) : count(ids.length, "fichier");
    };
    const s = (ids: string[]) => (ids.length > 1 ? "s" : "");
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
      persistent,
      tourOpen,
      startTour,
      endTour,
      toggleFavorite: (id) => {
        const f = byId(id);
        if (!f) return;
        patchMany([id], (x) => ({ favorite: !x.favorite }));
        notify(f.favorite ? "Retiré des favoris" : "Ajouté aux favoris");
      },
      togglePinned: (id) => {
        const f = byId(id);
        if (!f) return;
        patchMany([id], (x) => ({ pinned: !x.pinned }));
        notify(f.pinned ? "Désépinglé" : "Épinglé à l’accueil");
      },
      renameFile: (id, name) => {
        const f = byId(id);
        if (!f || !name.trim()) return;
        patchMany([id], () => ({ name: name.trim(), modifiedAt: nowIso() }));
        log("a renommé", `${name.trim()}.${f.ext}`, f.projectId);
        notify("Fichier renommé");
      },
      updateFile: (id, patch) => {
        const f = byId(id);
        if (!f) return;
        patchMany([id], () => ({ ...patch, modifiedAt: nowIso() }));
        log("a modifié les détails de", fullName(f), f.projectId);
        notify("Détails enregistrés");
      },
      moveFiles: (ids, folderId) => {
        const before = new Map(files.filter((f) => ids.includes(f.id)).map((f) => [f.id, f.folderId]));
        patchMany(ids, () => ({ folderId }));
        log("a déplacé", label(ids));
        const dest = folders.find((f) => f.id === folderId)?.name ?? "dossier";
        notify(`${label(ids)} déplacé${s(ids)} vers ${dest}`, () => patchMany(ids, (f) => ({ folderId: before.get(f.id) ?? f.folderId })));
      },
      copyFile: (id) => {
        const f = byId(id);
        if (!f) return;
        const copy: VaultFile = { ...f, id: uid("f"), name: `${f.name} (copie)`, createdAt: nowIso(), modifiedAt: nowIso(), favorite: false, pinned: false, status: "Draft", archived: false };
        const add = () => {
          setFiles((fs) => [copy, ...fs]);
          log("a copié", fullName(f), f.projectId);
          notify(`Copie créée : « ${copy.name} »`, () => {
            setFiles((fs) => fs.filter((x) => x.id !== copy.id));
            void db.deleteBlobs([copy.id]);
          });
        };
        if (f.sample) return add();
        // An uploaded file's copy needs its own stored original.
        void db.getBlob(f.id).then(async (blob) => {
          if (blob && (await db.putBlob(copy.id, blob))) add();
          else notify("Copie impossible : l’original est introuvable dans ce navigateur.");
        });
      },
      archiveFiles: (ids) => {
        const before = new Map(files.filter((f) => ids.includes(f.id)).map((f) => [f.id, f.status]));
        patchMany(ids, () => ({ archived: true, status: "Archived" as FileStatus, pinned: false }));
        log("a archivé", label(ids));
        notify(`${label(ids)} archivé${s(ids)}`, () => patchMany(ids, (f) => ({ archived: false, status: before.get(f.id) ?? "Draft" })));
      },
      restoreFiles: (ids) => {
        patchMany(ids, (f) => ({ archived: false, deleted: false, status: f.status === "Archived" ? ("Draft" as FileStatus) : f.status }));
        log("a restauré", label(ids));
        notify(`${label(ids)} restauré${s(ids)}`);
      },
      deleteFiles: (ids) => {
        patchMany(ids, () => ({ deleted: true, pinned: false }));
        log("a supprimé", label(ids));
        notify(`${label(ids)} supprimé${s(ids)}`, () => patchMany(ids, () => ({ deleted: false })));
      },
      purgeFiles: (ids) => {
        const what = label(ids);
        const set = new Set(ids);
        setFiles((fs) => fs.filter((f) => !set.has(f.id)));
        void db.deleteBlobs(ids);
        log("a supprimé définitivement", what);
        notify(`${what} supprimé${s(ids)} définitivement`);
      },
      setStatus: (ids, status) => {
        patchMany(ids, () => ({ status, archived: status === "Archived" }));
        notify(`Statut : ${STATUS_LABEL[status]}`);
      },
      addFolder: (name, parentId) => {
        const id = uid("d");
        setFolders((fs) => [...fs, { id, name: name.trim(), parentId }]);
        log("a créé le dossier", name.trim());
        notify(`Dossier « ${name.trim()} » créé`);
        return id;
      },
      addProject: ({ name, code, period }) => {
        const id = uid("p");
        const folderId = uid("d");
        setFolders((fs) => [...fs, { id: folderId, name: name.trim(), code: code.trim() || undefined, parentId: fs.some((f) => f.id === "production") ? "production" : "root" }]);
        setProjects((ps) => [...ps, { id, code: code.trim() || name.trim().slice(0, 3).toUpperCase(), name: name.trim(), period: period.trim() || "Dates à définir", summary: "Nouvel espace de projet.", storyYears: [], folderId, archived: false }]);
        log("a créé le projet", name.trim());
        notify(`Projet « ${name.trim()} » créé`);
        return id;
      },
      uploadFiles: async (items, folderId, projectId) => {
        const added: VaultFile[] = [];
        let refused = 0;
        for (const it of items) {
          if (it.error || !it.kind) continue;
          const id = uid("f");
          // Without storage the original cannot be kept, so the file is not added at all.
          if (!(await db.putBlob(id, it.file))) {
            refused++;
            continue;
          }
          const at = nowIso();
          added.push({
            id,
            name: it.name,
            ext: it.ext,
            kind: it.kind,
            size: it.file.size,
            folderId,
            projectId,
            ownerId: CURRENT_USER_ID,
            createdAt: at,
            modifiedAt: at,
            status: "Draft",
            tags: [],
            notes: "",
            favorite: false,
            pinned: false,
            visibility: "team",
            sharedWithMe: false,
            archived: false,
            deleted: false,
            pages: 1,
            sample: false,
            mime: it.file.type || undefined,
          });
        }
        if (added.length) {
          setFiles((fs) => [...added, ...fs]);
          log("a téléversé", added.length === 1 ? fullName(added[0]) : count(added.length, "fichier"), projectId);
        }
        if (refused) notify(`${count(refused, "fichier")} non enregistré${refused > 1 ? "s" : ""} : ce navigateur refuse le stockage ou l’espace est insuffisant.`);
        else if (added.length) notify(`${count(added.length, "fichier")} téléversé${added.length > 1 ? "s" : ""}`);
        return added.length;
      },
      downloadFile: async (id) => {
        const f = byId(id);
        if (!f) return;
        if (f.sample) return notify("Fichier d’exemple : il n’a pas d’original à télécharger.");
        const blob = await db.getBlob(id);
        if (!blob) return notify("Original introuvable dans ce navigateur.");
        const result = await saveToDisk(fullName(f), blob);
        if (result === "failed") notify("Le téléchargement n’est pas disponible dans cette vue.");
      },
      resetVault: async () => {
        await db.clearAll();
        setFiles(FILES);
        setFolders(FOLDERS);
        setProjects(PROJECTS);
        setActivity(ACTIVITY);
        setWatermark(true);
        setPreview(null);
        navigate({ view: "home" });
        notify("Vault réinitialisé : les données d’exemple sont de retour.");
      },
    };
  }, [files, folders, projects, activity, route, navigate, sidebarOpen, watermark, paletteOpen, dialog, preview, toast, notify, dismissToast, persistent, tourOpen, startTour, endTour, log, patchMany]);

  if (!hydrated) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

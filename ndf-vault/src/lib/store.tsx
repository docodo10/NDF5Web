"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ActivityItem, FileStatus, FileVersion, Folder, Profile, Project, Route, VaultFile } from "./types";
import { ACTIVITY, CURRENT_USER_ID, FILES, FOLDERS, PROJECTS, USERS } from "./sample-data";
import { count, descendantIds, folderPath, formatDate, formatMoment, formatTime, fullName, sanitizeName, STATUS_LABEL } from "./format";
import { BACKUP_EXTENSION, BackupError, createBackup as sealBackup, openBackup, type BackupProblem, type OpenedBackup } from "./backup";
import * as db from "./db";
import type { Meta, RecoverResult, UnlockResult } from "./db";
import { cryptoAvailable, sha256Hex } from "./crypto";
import { toCsv } from "./csv";
import { extractText } from "./extract";
import { indexText, searchText, type DocText, type Hit, type IndexedText } from "./search";
import { hashToRoute, routeToHash } from "./routes";
import { folderRules } from "./selectors";
import { stampImage, stampPdf, watermarkText } from "./stamp";
import { saveToDisk, type UploadCheck } from "./uploads";
import { buildZip, uniquePaths, zipPath, type ZipEntry } from "./zip";

/**
 * The vault's state and every mutation.
 *
 * Components only talk to `useVault()`. Persistence sits behind it: the state
 * is saved to IndexedDB in this browser, uploaded originals are stored there as
 * blobs, and nothing leaves the device. When the vault is protected, both are
 * encrypted and the provider shows the lock screen until the passphrase is
 * given. A real backend replaces `db` and `saveToDisk` later without touching
 * the components.
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
  | { type: "renameFolder"; folderId: string }
  | { type: "moveFolder"; folderId: string }
  | { type: "deleteFolder"; folderId: string }
  | { type: "newProject" }
  | { type: "editProject"; projectId: string }
  | { type: "upload"; folderId: string | null; files?: File[] }
  | { type: "protect" }
  | { type: "passphrase" }
  | { type: "unprotect" }
  | { type: "recovery" }
  | { type: "backup" }
  | { type: "restore" }
  | { type: "audit" }
  | { type: "exportVault" }
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
  /** Page, slide or sheet to show first, counted from 1: where a search found its match. */
  page?: number;
}

/** A document whose content matches a search. */
export interface ContentMatch {
  fileId: string;
  hit: Hit;
  /** How many pages, slides or sheets the document has. */
  pages: number;
}

/** A stored original, or why it cannot be given. "altered" means its fingerprint no longer matches. */
export type OriginalResult = { status: "ok"; blob: Blob } | { status: "missing" | "corrupt" | "altered" | "locked" };

export interface SecurityState {
  /** False when this browser cannot encrypt or cannot store: protection is then unavailable. */
  available: boolean;
  protected: boolean;
  autoLockMinutes: number;
  /** When the current recovery code was created; null when there is none. */
  recoveryAt: string | null;
}

export type AuditState = "altered" | "missing" | "unverified";

/** What a check of every stored original found. */
export interface AuditReport {
  total: number;
  intact: number;
  problems: { label: string; state: AuditState }[];
}

/** How a restore ended. "incomplete": the vault was replaced, but the device ran out of room for some originals. */
export type RestoreOutcome = "ok" | "incomplete" | "no-space" | "failed" | BackupProblem;

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
  personalMark: boolean;
  setPersonalMark: (v: boolean) => void;
  /** Hide the content whenever the window is not the active one. */
  privacy: boolean;
  setPrivacy: (v: boolean) => void;
  profile: Profile;
  setProfile: (p: Profile) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  dialog: DialogState;
  openDialog: (d: DialogState) => void;
  preview: PreviewState | null;
  openPreview: (fileId: string, listIds?: string[], fullscreen?: boolean, page?: number) => void;
  /** Search inside the uploaded documents. Best matches first. */
  searchContent: (query: string) => ContentMatch[];
  /** How far the content index is: documents read, out of those that have text to read. */
  indexStatus: { done: number; total: number };
  closePreview: () => void;
  toast: Toast | null;
  notify: (message: string, undo?: () => void) => void;
  dismissToast: () => void;
  /** True when changes and uploads are kept in this browser; false when it refused storage. */
  persistent: boolean;
  tourOpen: boolean;
  startTour: () => void;
  endTour: () => void;
  // security
  security: SecurityState;
  lockNow: (idle?: boolean) => Promise<void>;
  enableProtection: (passphrase: string) => Promise<boolean>;
  disableProtection: (passphrase: string) => Promise<boolean>;
  changePassphrase: (current: string, next: string) => Promise<boolean>;
  setAutoLock: (minutes: number) => void;
  /** True when the vault is not protected, or when this is its passphrase. */
  verifyPassphrase: (passphrase: string) => Promise<boolean>;
  /** Recompute the fingerprint of every stored original and compare it with the one taken at upload. */
  auditVault: (onProgress?: (done: number, total: number) => void) => Promise<AuditReport>;
  /** Create or replace the recovery code. Resolves the code, to show once; null when the passphrase is wrong. */
  createRecoveryCode: (passphrase: string) => Promise<string | null>;
  /** Save the whole vault as one encrypted file. */
  createBackup: (passphrase: string) => Promise<boolean>;
  /** Replace the vault with the content of a backup file. */
  restoreBackup: (file: Blob, passphrase: string) => Promise<RestoreOutcome>;
  readOriginal: (file: Pick<VaultFile, "id" | "name" | "ext" | "sha256">, blobId?: string) => Promise<OriginalResult>;
  // files
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
  uploadFiles: (items: UploadCheck[], folderId: string, projectId: string | null) => Promise<number>;
  downloadFile: (id: string, options?: { stamped?: boolean }) => Promise<void>;
  // versions
  addVersion: (fileId: string, item: UploadCheck) => Promise<boolean>;
  restoreVersion: (fileId: string, versionId: string) => Promise<void>;
  deleteVersion: (fileId: string, versionId: string) => void;
  downloadVersion: (fileId: string, versionId: string) => Promise<void>;
  // folders and projects
  addFolder: (name: string, parentId: string) => string;
  renameFolder: (id: string, name: string) => void;
  moveFolder: (id: string, parentId: string) => boolean;
  deleteFolder: (id: string) => boolean;
  addProject: (p: { name: string; code: string; period: string }) => string;
  updateProject: (id: string, patch: { name: string; code: string; period: string; summary: string }) => void;
  setProjectArchived: (id: string, archived: boolean) => void;
  // exports
  exportZip: (ids: string[], archiveName: string) => Promise<void>;
  exportVault: () => Promise<void>;
  exportJournal: (items: ActivityItem[]) => Promise<void>;
  resetVault: () => Promise<void>;
}

const Ctx = createContext<VaultContext | null>(null);

export function useVault(): VaultContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVault must be used inside <VaultProvider>");
  return v;
}

function uid(prefix: string): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `${prefix}-${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 9)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

function nowIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

const TOUR_KEY = "ndf-vault-tour-done";

function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------------- Provider */

export interface LockScreenProps {
  meta: Meta;
  unlock: (passphrase: string) => Promise<UnlockResult>;
  /** Set a new passphrase with the recovery code. The vault stays locked: unlock with the new passphrase next. */
  recover: (code: string, passphrase: string) => Promise<RecoverResult>;
  /** Erase the whole vault, protection included: the only way out when the passphrase is lost. */
  wipe: () => Promise<void>;
}

type Boot =
  | { phase: "loading" }
  | { phase: "locked"; meta: Meta }
  | { phase: "ready"; session: number; initial: db.Persisted | null; unreadable: boolean; persistent: boolean; meta: Meta; unlocked?: Unlocked; notice?: string };

interface Unlocked {
  failedBefore: number;
  /** The passphrase had just been replaced with the recovery code. */
  recovered: boolean;
}

type Ready = Extract<Boot, { phase: "ready" }>;

/**
 * Decides what is on screen: the loading splash, the lock screen, or the
 * vault. The vault itself (`VaultSession`) only mounts once its data can be
 * read, and unmounts when the vault locks, so nothing decrypted stays behind.
 */
export function VaultProvider({ children, fallback, lockScreen }: { children: ReactNode; fallback?: ReactNode; lockScreen: (props: LockScreenProps) => ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ phase: "loading" });
  const sessions = useRef(0);

  const start = useCallback(async (unlocked?: Unlocked, notice?: string) => {
    const [persistent, meta] = await Promise.all([db.isAvailable(), db.readMeta()]);
    if (meta.protected && !db.isUnlocked()) {
      setBoot({ phase: "locked", meta });
      return;
    }
    const loaded = await db.loadState();
    setBoot({ phase: "ready", session: ++sessions.current, initial: loaded.status === "ok" ? loaded.state : null, unreadable: loaded.status === "unreadable", persistent, meta, unlocked, notice });
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  const unlock = useCallback(
    async (passphrase: string) => {
      const result = await db.unlock(passphrase);
      if (result.ok) await start({ failedBefore: result.failedBefore, recovered: result.recovered });
      return result;
    },
    [start],
  );
  const recover = useCallback((code: string, passphrase: string) => db.recoverWithCode(code, passphrase), []);
  // Read the stored vault again and start a fresh session on it: after a restore, what is on disk is not what is on screen.
  const reload = useCallback((notice: string) => void start(undefined, notice), [start]);
  const wipe = useCallback(async () => {
    await db.wipeEverything();
    await start();
  }, [start]);
  const relock = useCallback(() => {
    db.lock();
    void start();
  }, [start]);

  if (boot.phase === "loading") return <>{fallback}</>;
  if (boot.phase === "locked") return <>{lockScreen({ meta: boot.meta, unlock, recover, wipe })}</>;
  return (
    <VaultSession key={boot.session} boot={boot} relock={relock} reload={reload}>
      {children}
    </VaultSession>
  );
}

/* ------------------------------------------------------------------ Session */

function VaultSession({ boot, relock, reload, children }: { boot: Ready; relock: () => void; reload: (notice: string) => void; children: ReactNode }) {
  const init = boot.initial;
  const persistent = boot.persistent;
  const [files, setFiles] = useState<VaultFile[]>(init?.files ?? FILES);
  const [folders, setFolders] = useState<Folder[]>(init?.folders ?? FOLDERS);
  const [projects, setProjects] = useState<Project[]>(init?.projects ?? PROJECTS);
  const [activity, setActivity] = useState<ActivityItem[]>(init?.activity ?? ACTIVITY);
  const [watermark, setWatermark] = useState(init?.watermark ?? true);
  const [personalMark, setPersonalMark] = useState(init?.personalMark ?? true);
  const [privacy, setPrivacy] = useState(init?.privacy === true);
  const [profile, setProfileState] = useState<Profile>(init?.profile ?? db.DEFAULT_PROFILE);
  const [meta, setMeta] = useState<Meta>(boot.meta);
  // The session only mounts in the browser (see VaultApp), so the first render can read the URL.
  const [route, setRoute] = useState<Route>(() => (typeof window === "undefined" ? { view: "home" } : hashToRoute(window.location.hash)));
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 1023px)").matches);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialog, openDialog] = useState<DialogState>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persisted = useMemo<db.Persisted>(
    () => ({ schema: db.SCHEMA, files, folders, projects, activity: activity.slice(0, 500), watermark, personalMark, profile, ...(privacy && { privacy: true }) }),
    [files, folders, projects, activity, watermark, personalMark, profile, privacy],
  );
  const latest = useRef(persisted);
  latest.current = persisted;

  // Save on every change, at once: closing the tab right after an upload must not lose it.
  // Writes go through one queue and always carry the latest state, so a slow write
  // (encryption takes a moment) can never land after a newer one and undo it.
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  // Set once a restore has started writing: from then on this session's state is stale and must not be saved.
  const frozen = useRef(false);
  const saveNow = useCallback(() => {
    if (frozen.current) return saving.current;
    saving.current = saving.current.then(
      () => db.saveState(latest.current),
      () => db.saveState(latest.current),
    );
    return saving.current;
  }, []);
  useEffect(() => {
    if (persistent) void saveNow();
  }, [persistent, persisted, saveNow]);
  useEffect(() => {
    if (!persistent) return;
    const flush = () => void saveNow();
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [persistent, saveNow]);

  // Hash routing.
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
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  /** Add a journal entry. `once` skips it when the same entry was just written. */
  const log = useCallback((verb: string, target: string, projectId: string | null = null, kind: "file" | "security" = "file", once = false) => {
    const at = nowIso();
    setActivity((a) => {
      const top = a[0];
      if (once && top && top.verb === verb && top.target === target && top.userId === CURRENT_USER_ID && top.at.slice(0, 15) === at.slice(0, 15)) return a;
      return [{ id: uid("a"), at, userId: CURRENT_USER_ID, verb, target, projectId, kind }, ...a];
    });
  }, []);

  /* ---------------------------------------------------------- Content index */

  // The text of every uploaded document, in memory only while the vault is open.
  // On disk it sits next to the originals, under "t-<file id>", encrypted like them.
  const textIndex = useRef(new Map<string, { sha256: string; text: IndexedText }>());
  const [indexedCount, setIndexedCount] = useState(0);
  const indexQueue = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const indexable = useMemo(() => files.filter((f) => !f.sample && f.kind !== "image" && f.sha256), [files]);

  useEffect(() => {
    if (!persistent || !cryptoAvailable()) return;
    const present = new Set(indexable.map((f) => f.id));
    for (const id of textIndex.current.keys()) if (!present.has(id)) textIndex.current.delete(id);
    const todo = indexable.filter((f) => textIndex.current.get(f.id)?.sha256 !== f.sha256);
    if (todo.length === 0) return;

    const read = async (f: VaultFile): Promise<IndexedText> => {
      const saved = await db.getBlob(`t-${f.id}`);
      if (saved) {
        try {
          const record = JSON.parse(await saved.text()) as { v?: number; sha256?: string; pages?: unknown };
          if (record.v === 1 && record.sha256 === f.sha256 && Array.isArray(record.pages) && record.pages.every((p) => typeof p === "string")) return indexText({ pages: record.pages as string[] });
        } catch {
          /* not a usable record: read the original again */
        }
      }
      let doc: DocText | null = null;
      const original = await db.readBlob(f.id);
      // Only an original that still matches its fingerprint feeds the search.
      if (original.status !== "ok" || (await sha256Hex(original.blob)) !== f.sha256) return indexText({ pages: [] });
      try {
        doc = await extractText(f.kind, original.blob);
      } catch {
        /* unreadable: indexed as empty, so it is not tried again at every opening */
      }
      const text = indexText(doc ?? { pages: [] });
      await db.putBlob(`t-${f.id}`, new Blob([JSON.stringify({ v: 1, sha256: f.sha256, pages: text.pages })], { type: "application/json" }));
      return text;
    };

    // One document at a time, in the background, letting the page breathe in between.
    indexQueue.current = indexQueue.current.then(async () => {
      for (const f of todo) {
        if (!alive.current || !db.isAvailableKey()) return;
        if (!f.sha256 || textIndex.current.get(f.id)?.sha256 === f.sha256) continue;
        try {
          const text = await read(f);
          if (!alive.current) return;
          textIndex.current.set(f.id, { sha256: f.sha256, text });
          setIndexedCount((n) => n + 1);
        } catch {
          /* storage refused: the document simply stays out of the search */
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
  }, [indexable, persistent]);

  const searchContent = useCallback((query: string): ContentMatch[] => {
    const out: ContentMatch[] = [];
    for (const [fileId, entry] of textIndex.current) {
      const hit = searchText(entry.text, query);
      if (hit) out.push({ fileId, hit, pages: entry.text.pages.length });
    }
    return out.sort((a, b) => Number(b.hit.phrase) - Number(a.hit.phrase) || b.hit.count - a.hit.count);
  }, []);

  const patchMany = useCallback((ids: string[], patch: (f: VaultFile) => Partial<VaultFile>) => {
    const set = new Set(ids);
    setFiles((fs) => fs.map((f) => (set.has(f.id) ? { ...f, ...patch(f) } : f)));
  }, []);

  // What happened while the vault was closed, said once when it opens.
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    if (boot.unlocked) {
      const n = boot.unlocked.failedBefore;
      log("a déverrouillé le Vault", n > 0 ? `après ${count(n, "tentative")} ${n > 1 ? "échouées" : "échouée"}` : "", null, "security");
      if (boot.unlocked.recovered) log("a choisi une nouvelle phrase secrète avec le code de récupération", "", null, "security");
      if (n > 0) notify(`${count(n, "tentative")} de déverrouillage ${n > 1 ? "échouées" : "échouée"} depuis votre dernière ouverture.`);
    }
    if (boot.notice) notify(boot.notice);
    if (boot.unreadable) notify("Les données enregistrées sont illisibles : le Vault repart des données d’exemple.");
    if (!tourSeen()) setTourOpen(true);
  }, [boot, log, notify]);

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

  /* ------------------------------------------------------------- Security */

  const lockNow = useCallback(
    async (idle = false) => {
      if (!meta.protected) return;
      // Write the last changes while the key is still there, with the lock itself in the journal, then forget the key.
      if (persistent) {
        await saveNow();
        frozen.current = true;
        const entry: ActivityItem = { id: uid("a"), at: nowIso(), userId: CURRENT_USER_ID, verb: "a verrouillé le Vault", target: idle ? "automatiquement, après une période sans activité" : "", projectId: null, kind: "security" };
        await db.saveState({ ...latest.current, activity: [entry, ...latest.current.activity].slice(0, 500) });
      }
      relock();
    },
    [meta.protected, persistent, relock, saveNow],
  );
  const lockRef = useRef(lockNow);
  lockRef.current = lockNow;

  // Lock after a period without any interaction.
  useEffect(() => {
    if (!meta.protected || meta.autoLockMinutes <= 0) return;
    const limit = meta.autoLockMinutes * 60_000;
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    const check = () => {
      if (Date.now() - last >= limit) void lockRef.current(true);
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true, capture: true });
    const timer = setInterval(check, 5000);
    document.addEventListener("visibilitychange", check);
    return () => {
      for (const e of events) window.removeEventListener(e, touch, { capture: true });
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [meta.protected, meta.autoLockMinutes]);

  const readOriginal = useCallback(
    async (file: Pick<VaultFile, "id" | "name" | "ext" | "sha256">, blobId?: string): Promise<OriginalResult> => {
      const r = await db.readBlob(blobId ?? file.id);
      if (r.status === "corrupt") log("a détecté un fichier altéré :", fullName(file), null, "security", true);
      if (r.status !== "ok") return { status: r.status };
      // The fingerprint taken at upload must still match what is stored.
      if (!blobId && file.sha256 && cryptoAvailable() && (await sha256Hex(r.blob)) !== file.sha256) {
        log("a détecté un fichier altéré :", fullName(file), null, "security", true);
        return { status: "altered" };
      }
      return r;
    },
    [log],
  );

  const value = useMemo<VaultContext>(() => {
    const byId = (id: string) => files.find((f) => f.id === id);
    const label = (ids: string[]) => {
      const first = byId(ids[0]);
      return ids.length === 1 && first ? fullName(first) : count(ids.length, "fichier");
    };
    const s = (ids: string[]) => (ids.length > 1 ? "s" : "");
    const unreadable = (status: OriginalResult["status"]) =>
      status === "missing" ? "Original introuvable dans ce navigateur." : status === "locked" ? "Le Vault est verrouillé." : "Ce fichier a été altéré : il ne peut pas être ouvert ni téléchargé.";
    const pathOf = (f: VaultFile) => zipPath([...folderPath(folders, f.folderId).filter((d) => d.parentId !== null).map((d) => (d.index ? `${d.index} ${d.name}` : d.name)), fullName(f)]);
    const security: SecurityState = { available: persistent && cryptoAvailable(), protected: meta.protected, autoLockMinutes: meta.autoLockMinutes, recoveryAt: meta.recovery ? (meta.recoveryAt ?? "") : null };

    const exportEntries = async (targets: VaultFile[]) => {
      const entries: ZipEntry[] = [];
      let skipped = 0;
      for (const f of targets) {
        const r = await readOriginal(f);
        if (r.status === "ok") entries.push({ path: pathOf(f), data: r.blob });
        else skipped++;
      }
      const paths = uniquePaths(entries.map((e) => e.path));
      return { entries: entries.map((e, i) => ({ ...e, path: paths[i] })), skipped };
    };
    const saveZip = async (entries: ZipEntry[], archiveName: string, skipped: number, fileCount: number) => {
      const result = await saveToDisk(`${sanitizeName(archiveName) || "ndf-vault"}.zip`, await buildZip(entries));
      if (result === "failed") return notify("L’export n’est pas disponible dans cette vue.");
      if (result === "declined") return;
      log("a exporté en ZIP", count(fileCount, "fichier"));
      notify(`${count(fileCount, "fichier")} exporté${fileCount > 1 ? "s" : ""}${skipped ? ` · ${count(skipped, "fichier")} illisible${skipped > 1 ? "s" : ""} ignoré${skipped > 1 ? "s" : ""}` : ""}`);
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
      personalMark,
      setPersonalMark,
      privacy,
      setPrivacy,
      profile,
      setProfile: (p) => {
        setProfileState({ name: sanitizeName(p.name) || db.DEFAULT_PROFILE.name, company: sanitizeName(p.company), email: p.email.trim().slice(0, 120) });
        notify("Profil enregistré");
      },
      paletteOpen,
      setPaletteOpen,
      dialog,
      openDialog,
      preview,
      openPreview: (fileId, listIds, fullscreen, page) => {
        setPreview({ fileId, listIds: listIds && listIds.length ? listIds : [fileId], fullscreen, page });
        const f = byId(fileId);
        if (f) log("a ouvert", fullName(f), f.projectId, "file", true);
      },
      closePreview: () => setPreview(null),
      searchContent,
      indexStatus: { done: indexable.filter((f) => textIndex.current.get(f.id)?.sha256 === f.sha256).length, total: indexable.length },
      toast,
      notify,
      dismissToast,
      persistent,
      tourOpen,
      startTour,
      endTour,

      security,
      lockNow,
      enableProtection: async (passphrase) => {
        if (!security.available || meta.protected) return false;
        // The saved state must exist before it can be converted.
        await saveNow();
        if (!(await db.enableProtection(passphrase))) return false;
        setMeta(await db.readMeta());
        log("a activé la protection par phrase secrète", "", null, "security");
        notify("Vault protégé : tout ce qui est stocké est maintenant chiffré.");
        return true;
      },
      disableProtection: async (passphrase) => {
        if (!meta.protected) return false;
        await saveNow();
        if (!(await db.disableProtection(passphrase))) return false;
        setMeta(await db.readMeta());
        log("a désactivé la protection par phrase secrète", "", null, "security");
        notify("Protection désactivée : le Vault n’est plus chiffré.");
        return true;
      },
      changePassphrase: async (current, next) => {
        if (!(await db.changePassphrase(current, next))) return false;
        setMeta(await db.readMeta());
        log("a changé la phrase secrète", "", null, "security");
        notify("Phrase secrète changée");
        return true;
      },
      setAutoLock: (minutes) => {
        setMeta((m) => ({ ...m, autoLockMinutes: minutes }));
        void db.setAutoLock(minutes);
      },
      verifyPassphrase: (passphrase) => db.verifyPassphrase(passphrase),
      auditVault: async (onProgress) => {
        const targets = files.filter((f) => !f.sample);
        const total = targets.reduce((n, f) => n + 1 + (f.versions?.length ?? 0), 0);
        const problems: AuditReport["problems"] = [];
        let done = 0;
        const check = async (blobId: string, sha256: string | undefined, name: string) => {
          const r = await db.readBlob(blobId);
          // "corrupt": the encrypted record no longer authenticates. A mismatch: the content is not what was uploaded.
          const state: AuditState | "intact" = r.status === "missing" ? "missing" : r.status !== "ok" ? "altered" : !sha256 ? "unverified" : (await sha256Hex(r.blob)) === sha256 ? "intact" : "altered";
          if (state !== "intact") problems.push({ label: name, state });
          onProgress?.(++done, total);
        };
        for (const f of targets) {
          await check(f.id, f.sha256, fullName(f));
          for (const ver of f.versions ?? []) await check(ver.id, ver.sha256, `${fullName(f)} — version du ${formatDate(ver.at)}`);
        }
        const bad = problems.filter((p) => p.state !== "unverified").length;
        log("a vérifié l’intégrité du Vault :", total === 0 ? "aucun original à vérifier" : bad ? `${count(bad, "problème")} sur ${count(total, "original", "originaux")}` : count(total, "original intact", "originaux intacts"), null, "security");
        return { total, intact: total - problems.length, problems };
      },
      createRecoveryCode: async (passphrase) => {
        // Asked of what is stored, not of this render: the dialog calls it right after turning protection on.
        const replaced = Boolean((await db.readMeta()).recovery);
        const code = await db.createRecoveryCode(passphrase);
        if (!code) return null;
        setMeta(await db.readMeta());
        log(replaced ? "a remplacé le code de récupération" : "a créé un code de récupération", "", null, "security");
        return code;
      },
      createBackup: async (passphrase) => {
        if (persistent) await saveNow();
        // Every stored original the state refers to: current versions and earlier ones.
        const ids: string[] = [];
        for (const f of files) {
          if (f.sample) continue;
          ids.push(f.id, ...(f.versions ?? []).map((ver) => ver.id));
        }
        const blobs: { id: string; data: Blob }[] = [];
        let skipped = 0;
        for (const id of ids) {
          const r = await db.readBlob(id);
          if (r.status === "ok") blobs.push({ id, data: r.blob });
          else skipped++;
        }
        let backup: Blob;
        try {
          backup = await sealBackup(passphrase, latest.current, blobs);
        } catch {
          // Typically memory: every original is encrypted before the file can be handed over.
          notify("La sauvegarde n’a pas pu être créée : le Vault est peut-être trop volumineux pour cet appareil.");
          return false;
        }
        const result = await saveToDisk(`ndf-vault-${nowIso().slice(0, 10)}.${BACKUP_EXTENSION}`, backup);
        if (result === "failed") notify("La sauvegarde n’est pas disponible dans cette vue.");
        if (result !== "saved") return false;
        log("a créé une sauvegarde chiffrée", count(blobs.length, "original", "originaux"), null, "security");
        notify(`Sauvegarde créée : ${count(blobs.length, "original", "originaux")}${skipped ? ` · ${count(skipped, "original illisible ignoré", "originaux illisibles ignorés")}` : ""}`);
        return true;
      },
      restoreBackup: async (file, passphrase) => {
        if (!persistent) return "failed";
        let opened: OpenedBackup;
        try {
          opened = await openBackup(file, passphrase);
          // Every original must decrypt before anything here is replaced.
          for (const b of opened.blobs) await b.read();
        } catch (e) {
          return e instanceof BackupError ? e.problem : "failed";
        }
        const usage = await db.storageUsage();
        if (usage && opened.blobs.reduce((n, b) => n + b.size, 0) * 1.1 > usage.quota) return "no-space";

        // From here on, what this session holds in memory is no longer the vault.
        await saving.current;
        frozen.current = true;
        let stored = 0;
        try {
          await db.clearData();
          for (const b of opened.blobs) {
            if (!(await db.putBlob(b.id, await b.read()))) break;
            stored++;
          }
        } catch {
          // Whatever was written stays. The state saved below still describes the backup, and says what is missing.
        }
        const complete = stored === opened.blobs.length;
        const when = formatMoment(opened.createdAt);
        const entry: ActivityItem = { id: uid("a"), at: nowIso(), userId: CURRENT_USER_ID, verb: "a restauré la sauvegarde du", target: when, projectId: null, kind: "security" };
        await db.saveState({ ...opened.state, activity: [entry, ...opened.state.activity].slice(0, 500) });
        reload(complete ? `Sauvegarde du ${when} restaurée.` : "Restauration incomplète : l’espace a manqué sur cet appareil, certains originaux sont absents.");
        return complete ? "ok" : "incomplete";
      },
      readOriginal,

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
        const clean = sanitizeName(name);
        if (!f || !clean) return;
        patchMany([id], () => ({ name: clean, modifiedAt: nowIso() }));
        log("a renommé", `${clean}.${f.ext}`, f.projectId);
        notify("Fichier renommé");
      },
      updateFile: (id, patch) => {
        const f = byId(id);
        if (!f) return;
        const safe: Partial<VaultFile> = { ...patch };
        if (safe.notes !== undefined) safe.notes = safe.notes.slice(0, 2000);
        if (safe.tags !== undefined) safe.tags = safe.tags.map((t) => sanitizeName(t).slice(0, 40)).filter(Boolean).slice(0, 20);
        patchMany([id], () => ({ ...safe, modifiedAt: nowIso() }));
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
        const at = nowIso();
        const copy: VaultFile = { ...f, id: uid("f"), name: `${f.name} (copie)`.slice(0, 120), createdAt: at, modifiedAt: at, versionAt: at, favorite: false, pinned: false, status: "Draft", archived: false, versions: undefined };
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
        void readOriginal(f).then(async (r) => {
          if (r.status === "ok" && (await db.putBlob(copy.id, r.blob))) add();
          else notify(r.status === "ok" ? "Copie impossible : ce navigateur refuse le stockage." : unreadable(r.status));
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
        const blobs = files.filter((f) => set.has(f.id)).flatMap((f) => [f.id, `t-${f.id}`, ...(f.versions ?? []).map((v) => v.id)]);
        setFiles((fs) => fs.filter((f) => !set.has(f.id)));
        void db.deleteBlobs(blobs);
        log("a supprimé définitivement", what);
        notify(`${what} supprimé${s(ids)} définitivement`);
      },
      setStatus: (ids, status) => {
        patchMany(ids, () => ({ status, archived: status === "Archived" }));
        notify(`Statut : ${STATUS_LABEL[status]}`);
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
            name: sanitizeName(it.name) || "Sans titre",
            ext: it.ext,
            kind: it.kind,
            size: it.file.size,
            folderId,
            projectId,
            ownerId: CURRENT_USER_ID,
            createdAt: at,
            modifiedAt: at,
            versionAt: at,
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
            sha256: it.sha256,
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
      downloadFile: async (id, options) => {
        const f = byId(id);
        if (!f) return;
        if (f.sample) return notify("Fichier d’exemple : il n’a pas d’original à télécharger.");
        const r = await readOriginal(f);
        if (r.status !== "ok") return notify(unreadable(r.status));
        let blob = r.blob;
        let filename = fullName(f);
        if (options?.stamped) {
          try {
            const text = watermarkText(profile);
            if (f.kind === "pdf") blob = await stampPdf(blob, text);
            else if (f.kind === "image") {
              const stamped = await stampImage(blob, text, f.ext);
              blob = stamped.blob;
              filename = `${f.name}.${stamped.ext}`;
            } else return notify("Le filigrane s’applique aux PDF et aux images.");
            filename = filename.replace(/(\.[^.]+)$/, " (filigrané)$1");
          } catch {
            return notify("Ce fichier ne peut pas être filigrané : il est protégé ou endommagé.");
          }
        }
        const result = await saveToDisk(filename, blob);
        if (result === "failed") return notify("Le téléchargement n’est pas disponible dans cette vue.");
        if (result === "saved") log(options?.stamped ? "a téléchargé avec filigrane" : "a téléchargé", fullName(f), f.projectId);
      },

      addVersion: async (fileId, item) => {
        const f = byId(fileId);
        if (!f || f.sample || item.error) return false;
        if (item.ext !== f.ext) {
          notify(`La nouvelle version doit être au même format (.${f.ext}).`);
          return false;
        }
        const current = await readOriginal(f);
        if (current.status !== "ok") {
          notify(unreadable(current.status));
          return false;
        }
        // Keep the current original under its own key before the new one takes its place.
        const versionId = uid("v");
        if (!(await db.putBlob(versionId, current.blob)) || !(await db.putBlob(f.id, item.file))) {
          await db.deleteBlobs([versionId]);
          notify("Version non enregistrée : ce navigateur refuse le stockage ou l’espace est insuffisant.");
          return false;
        }
        const previous: FileVersion = { id: versionId, ext: f.ext, size: f.size, sha256: f.sha256, at: f.versionAt ?? f.createdAt, ownerId: f.ownerId };
        const at = nowIso();
        patchMany([f.id], (x) => ({ size: item.file.size, sha256: item.sha256, mime: item.file.type || undefined, modifiedAt: at, versionAt: at, ownerId: CURRENT_USER_ID, versions: [previous, ...(x.versions ?? [])] }));
        log("a téléversé une nouvelle version de", fullName(f), f.projectId);
        notify("Nouvelle version enregistrée");
        return true;
      },
      restoreVersion: async (fileId, versionId) => {
        const f = byId(fileId);
        const version = f?.versions?.find((v) => v.id === versionId);
        if (!f || !version) return;
        const [current, old] = await Promise.all([readOriginal(f), db.readBlob(versionId)]);
        if (current.status !== "ok" || old.status !== "ok") return notify(unreadable(current.status !== "ok" ? current.status : old.status === "ok" ? "missing" : old.status));
        // The current original becomes a version; the chosen version becomes current.
        const keptId = uid("v");
        if (!(await db.putBlob(keptId, current.blob)) || !(await db.putBlob(f.id, old.blob))) {
          await db.deleteBlobs([keptId]);
          return notify("Restauration impossible : ce navigateur refuse le stockage.");
        }
        await db.deleteBlobs([versionId]);
        const kept: FileVersion = { id: keptId, ext: f.ext, size: f.size, sha256: f.sha256, at: f.versionAt ?? f.createdAt, ownerId: f.ownerId };
        const at = nowIso();
        patchMany([f.id], (x) => ({ size: version.size, sha256: version.sha256, modifiedAt: at, versionAt: version.at, ownerId: version.ownerId, versions: [kept, ...(x.versions ?? []).filter((v) => v.id !== versionId)] }));
        log("a restauré une version de", fullName(f), f.projectId);
        notify(`Version du ${formatDate(version.at)} restaurée`);
      },
      deleteVersion: (fileId, versionId) => {
        const f = byId(fileId);
        if (!f) return;
        patchMany([fileId], (x) => ({ versions: (x.versions ?? []).filter((v) => v.id !== versionId) }));
        void db.deleteBlobs([versionId]);
        log("a supprimé une version de", fullName(f), f.projectId);
        notify("Version supprimée");
      },
      downloadVersion: async (fileId, versionId) => {
        const f = byId(fileId);
        const version = f?.versions?.find((v) => v.id === versionId);
        if (!f || !version) return;
        const r = await readOriginal(f, versionId);
        if (r.status !== "ok") return notify(unreadable(r.status));
        if (version.sha256 && cryptoAvailable() && (await sha256Hex(r.blob)) !== version.sha256) return notify(unreadable("altered"));
        const result = await saveToDisk(`${f.name} (version du ${formatDate(version.at)}).${version.ext}`, r.blob);
        if (result === "failed") notify("Le téléchargement n’est pas disponible dans cette vue.");
        else if (result === "saved") log("a téléchargé une version de", fullName(f), f.projectId);
      },

      addFolder: (name, parentId) => {
        const clean = sanitizeName(name);
        if (!clean) return "";
        const id = uid("d");
        setFolders((fs) => [...fs, { id, name: clean, parentId }]);
        log("a créé le dossier", clean);
        notify(`Dossier « ${clean} » créé`);
        return id;
      },
      renameFolder: (id, name) => {
        const folder = folders.find((f) => f.id === id);
        const clean = sanitizeName(name);
        if (!folder || !clean || !folderRules(folder, folders, files, projects).renamable) return;
        setFolders((fs) => fs.map((f) => (f.id === id ? { ...f, name: clean } : f)));
        log("a renommé le dossier", clean);
        notify("Dossier renommé");
      },
      moveFolder: (id, parentId) => {
        const folder = folders.find((f) => f.id === id);
        if (!folder || folderRules(folder, folders, files, projects).moveBlocked) return false;
        // A folder cannot go inside itself or one of its own subfolders.
        if (!folders.some((f) => f.id === parentId) || descendantIds(folders, id).has(parentId)) return false;
        const before = folder.parentId;
        setFolders((fs) => fs.map((f) => (f.id === id ? { ...f, parentId } : f)));
        log("a déplacé le dossier", folder.name);
        notify(`Dossier déplacé vers ${folders.find((f) => f.id === parentId)?.name ?? "dossier"}`, () => setFolders((fs) => fs.map((f) => (f.id === id ? { ...f, parentId: before } : f))));
        return true;
      },
      deleteFolder: (id) => {
        const folder = folders.find((f) => f.id === id);
        if (!folder) return false;
        const blocked = folderRules(folder, folders, files, projects).deleteBlocked;
        if (blocked) {
          notify(blocked);
          return false;
        }
        setFolders((fs) => fs.filter((f) => f.id !== id));
        log("a supprimé le dossier", folder.name);
        notify(`Dossier « ${folder.name} » supprimé`, () => setFolders((fs) => (fs.some((f) => f.id === id) ? fs : [...fs, folder])));
        return true;
      },
      addProject: ({ name, code, period }) => {
        const clean = sanitizeName(name);
        if (!clean) return "";
        const cleanCode = sanitizeName(code).toUpperCase().slice(0, 5);
        const id = uid("p");
        const folderId = uid("d");
        setFolders((fs) => [...fs, { id: folderId, name: clean, code: cleanCode || undefined, parentId: fs.some((f) => f.id === "production") ? "production" : "root" }]);
        setProjects((ps) => [...ps, { id, code: cleanCode || clean.slice(0, 3).toUpperCase(), name: clean, period: sanitizeName(period) || "Dates à définir", summary: "Nouvel espace de projet.", storyYears: [], folderId, archived: false }]);
        log("a créé le projet", clean);
        notify(`Projet « ${clean} » créé`);
        return id;
      },
      updateProject: (id, patch) => {
        const p = projects.find((x) => x.id === id);
        const name = sanitizeName(patch.name);
        if (!p || !name) return;
        const code = sanitizeName(patch.code).toUpperCase().slice(0, 5) || p.code;
        setProjects((ps) => ps.map((x) => (x.id === id ? { ...x, name, code, period: sanitizeName(patch.period) || "Dates à définir", summary: patch.summary.trim().slice(0, 300) } : x)));
        setFolders((fs) => fs.map((f) => (f.id === p.folderId ? { ...f, code } : f)));
        log("a modifié le projet", name);
        notify("Projet enregistré");
      },
      setProjectArchived: (id, archived) => {
        const p = projects.find((x) => x.id === id);
        if (!p) return;
        setProjects((ps) => ps.map((x) => (x.id === id ? { ...x, archived } : x)));
        log(archived ? "a archivé le projet" : "a restauré le projet", p.name);
        notify(archived ? `Projet « ${p.name} » archivé` : `Projet « ${p.name} » restauré`, () => setProjects((ps) => ps.map((x) => (x.id === id ? { ...x, archived: !archived } : x))));
      },

      exportZip: async (ids, archiveName) => {
        const targets = files.filter((f) => ids.includes(f.id) && !f.sample);
        if (!targets.length) return notify("Rien à exporter : les fichiers d’exemple n’ont pas d’original.");
        const { entries, skipped } = await exportEntries(targets);
        if (!entries.length) return notify("Aucun original lisible à exporter.");
        await saveZip(entries, archiveName, skipped, entries.length);
      },
      exportVault: async () => {
        const targets = files.filter((f) => !f.sample && !f.deleted);
        if (!targets.length) return notify("Rien à exporter : téléversez d’abord vos fichiers.");
        const { entries, skipped } = await exportEntries(targets);
        if (!entries.length) return notify("Aucun original lisible à exporter.");
        const user = (id: string) => USERS.find((u) => u.id === id)?.name ?? "";
        const manifest = targets.map((f) => ({
          chemin: pathOf(f),
          statut: STATUS_LABEL[f.status],
          projet: projects.find((p) => p.id === f.projectId)?.code ?? null,
          etiquettes: f.tags,
          notes: f.notes,
          televersePar: user(f.ownerId),
          ajouteLe: f.createdAt,
          modifieLe: f.modifiedAt,
          taille: f.size,
          sha256: f.sha256 ?? null,
        }));
        const text = JSON.stringify({ exporteLe: nowIso(), fichiers: manifest }, null, 2);
        await saveZip([...entries, { path: "manifeste.json", data: new TextEncoder().encode(text) }], `ndf-vault-${nowIso().slice(0, 10)}`, skipped, entries.length);
      },
      exportJournal: async (items) => {
        if (!items.length) return notify("Le journal est vide.");
        const who = (id: string) => USERS.find((u) => u.id === id)?.name ?? "";
        const rows = [
          ["Date", "Heure", "Qui", "Action", "Élément", "Projet", "Type"],
          ...items.map((a) => [formatDate(a.at), formatTime(a.at), who(a.userId), a.verb, a.target, projects.find((p) => p.id === a.projectId)?.code ?? "", a.kind === "security" ? "Sécurité" : "Fichier"]),
        ];
        const result = await saveToDisk(`journal-ndf-vault-${nowIso().slice(0, 10)}.csv`, new Blob([toCsv(rows)], { type: "text/csv" }));
        if (result === "failed") notify("L’export n’est pas disponible dans cette vue.");
        else if (result === "saved") notify(`Journal exporté : ${count(items.length, "entrée")}`);
      },
      resetVault: async () => {
        await db.clearData();
        setFiles(FILES);
        setFolders(FOLDERS);
        setProjects(PROJECTS);
        setActivity(ACTIVITY);
        setWatermark(true);
        setPersonalMark(true);
        setPrivacy(false);
        setProfileState(db.DEFAULT_PROFILE);
        setPreview(null);
        navigate({ view: "home" });
        notify("Vault réinitialisé : les données d’exemple sont de retour.");
      },
    };
  }, [files, folders, projects, activity, route, navigate, sidebarOpen, watermark, personalMark, privacy, profile, paletteOpen, dialog, preview, toast, notify, dismissToast, persistent, tourOpen, startTour, endTour, meta, lockNow, saveNow, readOriginal, log, patchMany, reload, searchContent, indexable, indexedCount]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

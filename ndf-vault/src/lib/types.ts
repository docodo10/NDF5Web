export type FileKind = "pdf" | "docx" | "xlsx" | "pptx" | "txt" | "csv" | "image";

export type FileStatus = "Draft" | "In Review" | "Approved" | "Final" | "Archived";

export const STATUSES: FileStatus[] = ["Draft", "In Review", "Approved", "Final", "Archived"];

export interface VaultFile {
  id: string;
  name: string;
  ext: string;
  kind: FileKind;
  size: number; // bytes
  folderId: string;
  projectId: string | null;
  ownerId: string;
  createdAt: string; // ISO
  modifiedAt: string; // ISO
  status: FileStatus;
  tags: string[];
  notes: string;
  favorite: boolean;
  pinned: boolean;
  visibility: "private" | "team";
  sharedWithMe: boolean;
  archived: boolean;
  deleted: boolean;
  pages: number;
  /** True for built-in sample entries that have no stored file behind them. */
  sample: boolean;
  /** MIME type of the stored original (uploaded files only). */
  mime?: string;
  /** SHA-256 of the stored original, hex. Checked again when the file is opened or downloaded. */
  sha256?: string;
  /** When the current version was uploaded. */
  versionAt?: string;
  /** Earlier versions of this file, newest first. Each has its own stored original. */
  versions?: FileVersion[];
}

export interface FileVersion {
  /** Key of this version's stored original. */
  id: string;
  ext: string;
  size: number;
  sha256?: string;
  /** When this version was uploaded. */
  at: string;
  ownerId: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  code?: string;
  /** Position in the numbered vault index ("00" to "10"). */
  index?: string;
  /** Who is meant to see this folder. A label only: nothing enforces it until guest access exists. */
  access?: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  period: string;
  summary: string;
  storyYears: string[];
  folderId: string;
  archived: boolean;
}

export interface User {
  id: string;
  name: string;
  role: string;
  initials: string;
}

export interface ActivityItem {
  id: string;
  at: string; // ISO
  userId: string;
  verb: string;
  target: string;
  projectId: string | null;
  /** "security" for lock, passphrase and integrity events; file activity otherwise. */
  kind?: "file" | "security";
}

/** Who is using this vault on this device. Shown in the personal watermark. */
export interface Profile {
  name: string;
  company: string;
  email: string;
}

export type Route =
  | { view: "home" }
  | { view: "files" }
  | { view: "projects" }
  | { view: "private" }
  | { view: "shared" }
  | { view: "favorites" }
  | { view: "recent" }
  | { view: "archived" }
  | { view: "activity" }
  | { view: "preferences" }
  | { view: "project"; id: string }
  | { view: "folder"; id: string };

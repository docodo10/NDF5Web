import type { ActivityItem, FileKind, FileStatus, Folder, Project, User, VaultFile } from "./types";

/**
 * SAMPLE DATA
 * Everything in this file is placeholder content so the interface can be
 * reviewed before real documents are uploaded. No entry has a stored file
 * behind it, and none of it describes real figures, contracts or approvals.
 */

export const USERS: User[] = [
  { id: "u-admin", name: "NDF5 Admin", role: "Administrator", initials: "NA" },
  { id: "u-prod", name: "Production Office", role: "Production", initials: "PO" },
  { id: "u-legal", name: "Legal Affairs", role: "Legal", initials: "LA" },
  { id: "u-fin", name: "Finance Office", role: "Finance", initials: "FO" },
  { id: "u-story", name: "Story Department", role: "Writing", initials: "SD" },
];

export const CURRENT_USER_ID = "u-admin";

/** Numbered vault index and its planned default access, from the NDF5 Vault data-room plan. */
export const FOLDERS: Folder[] = [
  { id: "root", name: "NDF SAGA", parentId: null },
  { id: "start", index: "00", name: "Start Here", access: "All guests", parentId: "root" },
  { id: "overview", index: "01", name: "Saga Overview", access: "All guests", parentId: "root" },
  { id: "screenplays", index: "02", name: "Screenplays", access: "Talent, producers, studios (view-only)", parentId: "root" },
  { id: "story", index: "03", name: "Story Development", access: "Producers, studios", parentId: "root" },
  { id: "production", index: "04", name: "Production", access: "Producers, financiers, partners", parentId: "root" },
  { id: "pb1", name: "Production Blitz One", code: "PB1", parentId: "production" },
  { id: "fs1", name: "Film & Series 1", code: "FS1", parentId: "pb1" },
  { id: "fs2", name: "Film & Series 2", code: "FS2", parentId: "pb1" },
  { id: "pb2", name: "Production Blitz Two", code: "PB2", parentId: "production" },
  { id: "fs3", name: "Film & Series 3", code: "FS3", parentId: "pb2" },
  { id: "fs4", name: "Film & Series 4", code: "FS4", parentId: "pb2" },
  { id: "fs5", name: "Film & Series 5", code: "FS5", parentId: "pb2" },
  { id: "business", index: "05", name: "Business and Finance", access: "Tier 2", parentId: "root" },
  { id: "legal", index: "06", name: "Legal and Chain of Title", access: "Tier 2", parentId: "root" },
  { id: "talent", index: "07", name: "Talent and Packaging", access: "Talent group (per role)", parentId: "root" },
  { id: "to-sign", index: "08", name: "To Sign", access: "Per guest", parentId: "root" },
  { id: "signed", index: "09", name: "Signed", access: "Per guest", parentId: "root" },
  { id: "qa", index: "10", name: "Q&A", access: "Per group", parentId: "root" },
];

export const PROJECTS: Project[] = [
  {
    id: "pb1",
    code: "PB1",
    name: "Production Blitz One",
    period: "Planned 2029 production",
    summary: "Workspace for story years FS1 and FS2.",
    storyYears: ["FS1", "FS2"],
    folderId: "pb1",
    archived: false,
  },
  {
    id: "pb2",
    code: "PB2",
    name: "Production Blitz Two",
    period: "Planned 2031–2033 production activities",
    summary: "Workspace for story years FS3, FS4 and FS5.",
    storyYears: ["FS3", "FS4", "FS5"],
    folderId: "pb2",
    archived: false,
  },
];

const EXT_KIND: Record<string, FileKind> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  pptx: "pptx",
  txt: "txt",
  csv: "csv",
  png: "image",
  jpg: "image",
};

type Seed = [
  name: string,
  ext: string,
  folderId: string,
  projectId: string | null,
  ownerId: string,
  modified: string,
  status: FileStatus,
  sizeKB: number,
  pages: number,
  tags: string[],
  flags?: string,
];

// flags: f = favorite, p = pinned, x = private, s = shared with me, a = archived
const SEEDS: Seed[] = [
  ["FS1 Film Part 1 Screenplay", "pdf", "screenplays", "pb1", "u-story", "2026-11-12", "In Review", 1420, 6, ["screenplay", "film", "FS1"], "f"],
  ["FS1 Film Part 2 Screenplay", "pdf", "screenplays", "pb1", "u-story", "2026-11-10", "Draft", 1380, 6, ["screenplay", "film", "FS1"]],
  ["FS1 Series Episode 101 Script", "docx", "screenplays", "pb1", "u-story", "2026-11-09", "Draft", 412, 4, ["script", "series", "FS1"], "s"],
  ["FS1 Series Episode 102 Script", "docx", "screenplays", "pb1", "u-story", "2026-11-06", "Draft", 398, 4, ["script", "series", "FS1"], "s"],
  ["FS2 Film Part 1 Screenplay", "pdf", "screenplays", "pb1", "u-story", "2026-10-28", "Draft", 1290, 6, ["screenplay", "film", "FS2"]],
  ["Saga Chronology Overview", "pdf", "story", null, "u-story", "2026-10-21", "Approved", 640, 4, ["chronology", "story"], "f"],
  ["Character Bible", "docx", "story", null, "u-story", "2026-10-30", "In Review", 880, 5, ["characters", "story"]],
  ["FS3 Story Outline", "docx", "story", "pb2", "u-story", "2026-09-18", "Draft", 236, 3, ["outline", "FS3"]],
  ["PB1 Production Budget Summary", "xlsx", "business", "pb1", "u-fin", "2026-11-11", "In Review", 628, 3, ["budget", "PB1"], "p"],
  ["PB1 Budget Top Sheet", "pdf", "business", "pb1", "u-fin", "2026-11-04", "Draft", 310, 2, ["budget", "PB1"], "s"],
  ["PB2 Preliminary Budget", "xlsx", "business", "pb2", "u-fin", "2026-10-02", "Draft", 540, 3, ["budget", "PB2"]],
  ["Forecast Model Extract", "pdf", "business", null, "u-fin", "2026-11-13", "In Review", 2240, 4, ["forecast", "model"], "fx"],
  ["NDF5 Business Plan", "pdf", "business", null, "u-admin", "2026-10-15", "Approved", 1960, 6, ["business plan"], "f"],
  ["Executive Summary", "docx", "business", null, "u-admin", "2026-10-19", "In Review", 184, 2, ["summary"]],
  ["Investor Presentation", "pptx", "business", null, "u-admin", "2026-11-08", "Approved", 5120, 5, ["investors", "presentation"], "p"],
  ["Financing Structure Overview", "pdf", "business", null, "u-fin", "2026-10-26", "In Review", 472, 3, ["financing"], "x"],
  ["Investor Contact List", "csv", "business", null, "u-admin", "2026-10-12", "Draft", 28, 1, ["investors", "contacts"], "x"],
  ["Industry Bible", "pdf", "overview", null, "u-admin", "2026-11-05", "Approved", 3360, 6, ["bible", "industry"], "f"],
  ["Industry Bible Appendix", "docx", "overview", null, "u-admin", "2026-10-08", "Draft", 502, 4, ["bible"]],
  ["Cast Wish List", "xlsx", "talent", "pb1", "u-prod", "2026-11-07", "Draft", 96, 2, ["cast"], "x"],
  ["Montreal Crew List", "xlsx", "pb1", "pb1", "u-prod", "2026-10-24", "Draft", 118, 2, ["crew", "Montreal"], "s"],
  ["Department Heads Contact Sheet", "csv", "pb1", "pb1", "u-prod", "2026-10-11", "Draft", 14, 1, ["crew", "contacts"]],
  ["PB1 Shooting Schedule", "xlsx", "pb1", "pb1", "u-prod", "2026-11-12", "In Review", 780, 3, ["schedule", "PB1"], "s"],
  ["PB1 Production Calendar", "pdf", "pb1", "pb1", "u-prod", "2026-11-01", "Draft", 356, 2, ["calendar", "PB1"]],
  ["PB2 Production Timeline", "pdf", "pb2", "pb2", "u-prod", "2026-09-27", "Draft", 298, 2, ["timeline", "PB2"]],
  ["Standard NDA Template", "pdf", "legal", null, "u-legal", "2026-10-29", "Approved", 220, 4, ["NDA", "template"], "p"],
  ["Option Agreement Template", "docx", "legal", null, "u-legal", "2026-10-17", "Draft", 164, 3, ["template", "agreement"], "x"],
  ["Chain of Title Checklist", "pdf", "legal", null, "u-legal", "2026-10-05", "In Review", 132, 2, ["checklist"], "s"],
  ["Distribution Strategy", "pptx", "business", null, "u-admin", "2026-10-22", "Draft", 3880, 4, ["distribution"]],
  ["Streaming Windows Overview", "pdf", "business", null, "u-admin", "2026-10-14", "Draft", 410, 3, ["streaming", "windows"]],
  ["Saga Pitch Deck", "pptx", "overview", null, "u-admin", "2026-11-03", "Final", 6240, 5, ["pitch", "presentation"], "f"],
  ["Key Art Concept 01", "png", "overview", null, "u-admin", "2026-09-30", "Draft", 2870, 1, ["key art", "image"]],
  ["Press Notes", "txt", "overview", null, "u-admin", "2026-09-22", "Draft", 9, 1, ["press"]],
  ["FS1 Scene Breakdown", "xlsx", "fs1", "pb1", "u-prod", "2026-11-02", "In Review", 448, 3, ["breakdown", "FS1"]],
  ["Location Reference Board", "jpg", "fs1", "pb1", "u-prod", "2026-10-09", "Draft", 4120, 1, ["locations", "image"]],
  ["FS2 Series Season Outline", "docx", "fs2", "pb1", "u-story", "2026-10-03", "Draft", 204, 3, ["outline", "series", "FS2"]],
  ["FS3 Location Notes", "txt", "fs3", "pb2", "u-prod", "2026-09-12", "Draft", 6, 1, ["locations", "FS3"]],
  ["Early Treatment", "pdf", "story", null, "u-story", "2026-03-14", "Archived", 720, 4, ["treatment"], "a"],
  ["Superseded Budget Draft", "xlsx", "business", "pb1", "u-fin", "2026-05-20", "Archived", 502, 3, ["budget"], "a"],
  ["Welcome Note", "pdf", "start", null, "u-admin", "2026-11-13", "Final", 84, 1, ["welcome"]],
  ["How to Use the Vault", "pdf", "start", null, "u-admin", "2026-11-12", "Approved", 126, 2, ["guide"]],
  ["Saga Bible", "pdf", "overview", null, "u-story", "2026-11-06", "Approved", 4180, 6, ["bible", "saga"], "f"],
];

/** Sample files were "added" a few days before their last change, so the two dates differ. */
function daysBefore(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export const FILES: VaultFile[] = SEEDS.map((s, i) => {
  const [name, ext, folderId, projectId, ownerId, modified, status, sizeKB, pages, tags, flags = ""] = s;
  const hour = 9 + (i % 8);
  return {
    id: `f-${i + 1}`,
    name,
    ext,
    kind: EXT_KIND[ext],
    size: sizeKB * 1024,
    folderId,
    projectId,
    ownerId,
    createdAt: `${daysBefore(modified, (i * 5) % 23)}T0${(i % 4) + 8}:15:00`,
    modifiedAt: `${modified}T${String(hour).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00`,
    status,
    tags,
    notes: "",
    favorite: flags.includes("f"),
    pinned: flags.includes("p"),
    visibility: flags.includes("x") ? "private" : "team",
    sharedWithMe: flags.includes("s"),
    archived: flags.includes("a"),
    deleted: false,
    pages,
    sample: true,
  };
});

const VERBS = ["uploaded", "updated", "renamed", "moved", "shared", "changed status of", "commented on"];

export const ACTIVITY: ActivityItem[] = [...FILES]
  .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  .slice(0, 22)
  .map((f, i) => ({
    id: `a-${i + 1}`,
    at: f.modifiedAt,
    userId: f.ownerId,
    verb: VERBS[i % VERBS.length],
    target: `${f.name}.${f.ext}`,
    projectId: f.projectId,
  }));

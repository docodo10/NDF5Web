"use client";

import { Activity, Clapperboard, Files, FolderOpen, FolderSearch, Landmark, LayoutDashboard, Scale, Users } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useVault } from "@/lib/store";
import type { FileStatus } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { USERS } from "@/lib/sample-data";
import { activeFiles, byModifiedDesc, CATEGORY_LABEL, fileCategory, type ProjectCategory } from "@/lib/selectors";
import { ExplorerToolbar, useFileFilters } from "@/components/files/Explorer";
import { FileTable } from "@/components/files/FileTable";
import { Avatar, Button, Chip, EmptyState, PageHeader, SegmentedTabs, StatusBadge, type TabItem } from "@/components/ui";
import { ActivityList, Breadcrumbs, SectionTitle, UploadButton } from "./shared";

type Tab = "overview" | "files" | "financial" | "production" | "legal" | "team" | "activity";

const TABS: TabItem<Tab>[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "files", label: "Files", icon: Files },
  { id: "financial", label: "Financial Documents", icon: Landmark },
  { id: "production", label: "Production", icon: Clapperboard },
  { id: "legal", label: "Legal", icon: Scale },
  { id: "team", label: "Team", icon: Users },
  { id: "activity", label: "Activity", icon: Activity },
];

const CATEGORY_EMPTY: Record<"financial" | "production" | "legal", string> = {
  financial: "Files stored under Production Budgets, Financing & Investors or Business Plans and linked to this project appear here.",
  production: "Files stored under Screenplays, Production Scheduling, Cast & Crew or this project's own folders appear here.",
  legal: "Files stored under Legal & Contracts and linked to this project appear here.",
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-5 shadow-xs">
      <h3 className="mb-3 text-[13px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children, onClick }: { label: ReactNode; children: ReactNode; onClick?: () => void }) {
  const cls = "flex h-9 w-full items-center justify-between gap-4 border-t border-hair text-[13px] first:border-t-0";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} -mx-2 w-[calc(100%+16px)] rounded-md px-2 text-left transition-colors duration-150 hover:bg-subtle`}>
      <span className="text-neutral-600">{label}</span>
      <span className="font-medium tabular-nums text-ink">{children}</span>
    </button>
  ) : (
    <div className={cls}>
      <span className="text-neutral-600">{label}</span>
      <span className="font-medium tabular-nums text-ink">{children}</span>
    </div>
  );
}

export function ProjectView({ id }: { id: string }) {
  const v = useVault();
  const project = v.projects.find((p) => p.id === id);
  const [tab, setTab] = useState<Tab>("overview");

  const files = useMemo(() => activeFiles(v.files).filter((f) => f.projectId === id), [v.files, id]);
  const byCategory = useMemo(() => {
    const out: Record<ProjectCategory, typeof files> = { financial: [], production: [], legal: [], other: [] };
    for (const f of files) out[fileCategory(f, v.folders, v.projects)].push(f);
    return out;
  }, [files, v.folders, v.projects]);

  const tabFiles = tab === "financial" || tab === "production" || tab === "legal" ? byCategory[tab] : files;
  const filters = useFileFilters(tabFiles);
  const activity = useMemo(() => v.activity.filter((a) => a.projectId === id), [v.activity, id]);

  if (!project) {
    return (
      <div className="rounded-xl border border-line bg-white">
        <EmptyState icon={FolderSearch} title="Project not found" hint="This project does not exist or was removed." />
        <div className="-mt-8 flex justify-center pb-12">
          <Button onClick={() => v.navigate({ view: "projects" })}>Go to All Projects</Button>
        </div>
      </div>
    );
  }

  const team = USERS.map((u) => ({ user: u, count: files.filter((f) => f.ownerId === u.id).length })).filter((t) => t.count > 0);
  const statusCount = (s: FileStatus) => files.filter((f) => f.status === s).length;
  const recent = [...files].sort(byModifiedDesc).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ label: "All Projects", onClick: () => v.navigate({ view: "projects" }) }, { label: project.code }]} />}
        title={project.name}
        description={project.period}
        actions={
          <>
            <Button icon={FolderOpen} onClick={() => v.navigate({ view: "folder", id: project.folderId })}>
              Open Folder
            </Button>
            <UploadButton folderId={project.folderId} />
          </>
        }
      />

      <SegmentedTabs<Tab> label="Project sections" items={TABS} value={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="About">
              <p className="mb-3 text-[13px] leading-[19px] text-neutral-600">{project.summary}</p>
              <Row label="Code">{project.code}</Row>
              <Row label="Period">{project.period}</Row>
              <Row label="Story years">
                {project.storyYears.length > 0 ? (
                  <span className="flex gap-1.5">
                    {project.storyYears.map((y) => (
                      <Chip key={y}>{y}</Chip>
                    ))}
                  </span>
                ) : (
                  <span className="font-normal text-neutral-400">Not set</span>
                )}
              </Row>
            </Card>

            <Card title="Documents">
              <Row label="All files" onClick={() => setTab("files")}>
                {files.length}
              </Row>
              {(["financial", "production", "legal"] as const).map((c) => (
                <Row key={c} label={CATEGORY_LABEL[c]} onClick={() => setTab(c)}>
                  {byCategory[c].length}
                </Row>
              ))}
              {byCategory.other.length > 0 && <Row label={CATEGORY_LABEL.other}>{byCategory.other.length}</Row>}
            </Card>

            <Card title="Status">
              {STATUSES.filter((s) => s !== "Archived").map((s) => (
                <Row key={s} label={<StatusBadge status={s} />}>
                  {statusCount(s)}
                </Row>
              ))}
            </Card>
          </div>

          <section className="space-y-3">
            <SectionTitle
              aside={
                files.length > recent.length ? (
                  <Button variant="ghost" size="sm" onClick={() => setTab("files")}>
                    View all {files.length} files
                  </Button>
                ) : undefined
              }
            >
              Recently updated
            </SectionTitle>
            <FileTable variant="compact" files={recent} footer={false} emptyTitle="No files in this project yet" emptyHint="Link a file to this project in Edit Details and it will appear here." />
          </section>
        </div>
      )}

      {(tab === "files" || tab === "financial" || tab === "production" || tab === "legal") && (
        <div className="space-y-4">
          <ExplorerToolbar
            hideProject
            filters={filters}
            left={
              <p className="text-[13px] text-neutral-500">
                <span className="font-medium tabular-nums text-ink">{filters.filtered.length}</span> {filters.filtered.length === 1 ? "file" : "files"}
                {tab !== "files" && <span> · {CATEGORY_LABEL[tab]}</span>}
              </p>
            }
          />
          <FileTable
            key={tab}
            files={filters.filtered}
            emptyTitle={tabFiles.length === 0 ? (tab === "files" ? "No files in this project yet" : `No ${CATEGORY_LABEL[tab].toLowerCase()} yet`) : "No files match this view"}
            emptyHint={tabFiles.length === 0 ? (tab === "files" ? "Link a file to this project in Edit Details and it will appear here." : CATEGORY_EMPTY[tab]) : "Clear the search or reset the filters."}
          />
        </div>
      )}

      {tab === "team" && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-subtle">
                  <th scope="col" className="h-11 px-4 text-left text-[12.5px] font-medium text-neutral-500">
                    Department
                  </th>
                  <th scope="col" className="hidden h-11 px-3 text-left text-[12.5px] font-medium text-neutral-500 sm:table-cell">
                    Role
                  </th>
                  <th scope="col" className="h-11 w-[120px] px-4 text-right text-[12.5px] font-medium text-neutral-500">
                    Project files
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.map(({ user, count }) => (
                  <tr key={user.id} className="h-[60px] border-t border-hair">
                    <td className="px-4">
                      <div className="flex items-center gap-3">
                        <Avatar user={user} size={32} />
                        <span className="text-[13.5px] font-medium text-ink">{user.name}</span>
                      </div>
                    </td>
                    <td className="hidden px-3 text-[13px] text-neutral-600 sm:table-cell">{user.role}</td>
                    <td className="px-4 text-right text-[13px] tabular-nums text-neutral-700">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {team.length === 0 && <EmptyState icon={Users} title="No contributors yet" hint="Departments that add files to this project appear here." />}
          </div>
          <p className="text-[12.5px] text-neutral-500">Sample departments, listed because they own files in this project. Member management and permissions arrive with the authentication step.</p>
        </div>
      )}

      {tab === "activity" && <ActivityList items={activity} emptyTitle="No activity for this project yet" emptyHint="Changes to this project's files will be listed here." />}
    </div>
  );
}

"use client";

import { ArrowUpRight, FolderKanban, Plus } from "lucide-react";
import { useMemo } from "react";
import { useVault } from "@/lib/store";
import { activeFiles, byModifiedDesc } from "@/lib/selectors";
import { formatDate } from "@/lib/format";
import { Button, Chip, EmptyState, PageHeader, SampleNotice } from "@/components/ui";

export function ProjectsView() {
  const v = useVault();
  const active = useMemo(() => activeFiles(v.files), [v.files]);
  const projects = v.projects.filter((p) => !p.archived);

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Projects"
        description="A separate workspace for each major NDF production."
        actions={
          <>
            <SampleNotice />
            <Button variant="primary" icon={Plus} onClick={() => v.openDialog({ type: "newProject" })}>
              New Project
            </Button>
          </>
        }
      />

      {projects.length === 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={FolderKanban} title="No projects yet" hint="Create a project to give a production its own workspace." />
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const files = active.filter((f) => f.projectId === p.id).sort(byModifiedDesc);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => v.navigate({ view: "project", id: p.id })}
                  className="group flex h-full w-full flex-col rounded-xl border border-line bg-white p-5 text-left shadow-xs transition-colors duration-150 hover:border-neutral-300"
                >
                  <span className="flex w-full items-start justify-between">
                    <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-ink px-2 text-[12px] font-semibold tracking-wide text-white">{p.code}</span>
                    <ArrowUpRight className="size-4 text-neutral-400 transition-colors duration-150 group-hover:text-ink" strokeWidth={1.75} />
                  </span>
                  <span className="mt-4 block text-[16px] font-semibold tracking-[-0.01em] text-ink">{p.name}</span>
                  <span className="mt-0.5 block text-[13px] text-neutral-500">{p.period}</span>
                  <span className="mt-3 block text-[13px] leading-[19px] text-neutral-600">{p.summary}</span>
                  {p.storyYears.length > 0 && (
                    <span className="mt-3 flex flex-wrap gap-1.5">
                      {p.storyYears.map((y) => (
                        <Chip key={y}>{y}</Chip>
                      ))}
                    </span>
                  )}
                  <span className="mt-5 flex w-full items-center justify-between border-t border-hair pt-3.5 text-[12.5px] text-neutral-500">
                    <span>
                      <span className="font-medium tabular-nums text-ink">{files.length}</span> {files.length === 1 ? "file" : "files"}
                    </span>
                    <span>{files[0] ? `Updated ${formatDate(files[0].modifiedAt)}` : "No files yet"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { useVault } from "@/lib/store";
import { USERS } from "@/lib/sample-data";
import { Ndf5Logo } from "@/components/brand/Brand";
import { SwitchRow } from "@/components/Dialogs";
import { Avatar, Chip, PageHeader } from "@/components/ui";

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-3 border-t border-line py-7 first:border-t-0 first:pt-0 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-[19px] text-neutral-500">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Line({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-t border-hair py-2 first:border-t-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {hint && <p className="text-[12px] text-neutral-500">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const STEPS: { label: string; hint: string; state: "review" | "pending" }[] = [
  { label: "Interface", hint: "Navigation, file tables, dialogs, document viewer, search", state: "review" },
  { label: "File upload", hint: "Multiple files, drag and drop, validation", state: "pending" },
  { label: "Persistent storage", hint: "IndexedDB local demo mode", state: "pending" },
  { label: "Original downloads", hint: "Download the stored original of any file", state: "pending" },
  { label: "PDF rendering", hint: "PDF.js in the document viewer", state: "pending" },
  { label: "Office previews", hint: "DOCX, XLSX and PPTX where practical", state: "pending" },
  { label: "Version history", hint: "Stored versions per file", state: "pending" },
  { label: "Backend", hint: "Supabase Auth, Postgres metadata, private Storage", state: "pending" },
];

export function SettingsView() {
  const { watermark, setWatermark, files, folders, projects } = useVault();
  const box = "rounded-xl border border-line bg-white px-4 py-1.5 shadow-xs";

  return (
    <div className="max-w-[980px]">
      <PageHeader title="Settings" description="Workspace preferences and the current state of this build." />

      <div className="mt-8">
        <Panel title="Appearance" description="How NDF5 branding appears inside the workspace.">
          <div className={box}>
            <SwitchRow on={watermark} onChange={setWatermark} label="NDF5 watermark" hint="Show the faint NDF5 Productions mark behind the workspace and on document pages." />
          </div>
        </Panel>

        <Panel title="Storage" description="Where files and metadata are kept.">
          <div className={box}>
            <Line label="Mode" hint="Nothing is saved yet. Every change resets when the page reloads.">
              <Chip className="border-dashed">Local demo, in memory</Chip>
            </Line>
            <Line label="Sample files">
              <span className="text-[13px] tabular-nums text-neutral-700">{files.filter((f) => f.sample && !f.deleted).length}</span>
            </Line>
            <Line label="Folders">
              <span className="text-[13px] tabular-nums text-neutral-700">{folders.length}</span>
            </Line>
            <Line label="Projects">
              <span className="text-[13px] tabular-nums text-neutral-700">{projects.length}</span>
            </Line>
          </div>
        </Panel>

        <Panel title="Build status" description="The interface is built first. Storage and backend features follow once it is approved.">
          <div className={box}>
            {STEPS.map((s, i) => (
              <Line key={s.label} label={`${i + 1}. ${s.label}`} hint={s.hint}>
                {s.state === "review" ? <Chip className="!border-ink !text-ink">Ready for review</Chip> : <Chip className="border-dashed text-neutral-500">Not started</Chip>}
              </Line>
            ))}
          </div>
        </Panel>

        <Panel title="Workspace members" description="Sample departments used while authentication is not connected.">
          <div className={box}>
            {USERS.map((u) => (
              <div key={u.id} className="flex min-h-[52px] items-center gap-3 border-t border-hair py-2 first:border-t-0">
                <Avatar user={u} size={30} />
                <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{u.name}</p>
                <p className="text-[13px] text-neutral-500">{u.role}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="About">
          <div className="flex items-center gap-4">
            <Ndf5Logo className="h-9 w-auto text-brand" />
            <div className="text-[13px] leading-[19px]">
              <p className="font-medium text-ink">NDF Vault</p>
              <p className="text-neutral-500">The New Drago Family — Production &amp; Document Management</p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

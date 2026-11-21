"use client";

import clsx from "clsx";
import { CalendarClock } from "lucide-react";
import { dueOf } from "@/lib/due";
import { formatDate } from "@/lib/format";

const TONE = {
  overdue: "border-red-300 bg-red-50 text-red-700",
  today: "border-red-300 bg-red-50 text-red-700",
  soon: "border-amber-300 bg-amber-50 text-amber-800",
  later: "border-line bg-white text-neutral-600",
};

/** How far a file's date is, at a glance: red once it has passed, amber when it is close. */
export function DueChip({ dueAt, label, className }: { dueAt: string | undefined; label?: string; className?: string }) {
  const due = dueOf(dueAt);
  if (!due || !dueAt) return null;
  return (
    <span data-due={due.state} title={`${label ? `${label} : ` : "Échéance : "}${formatDate(dueAt)}`} className={clsx("inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[11.5px] font-medium", TONE[due.state], className)}>
      <CalendarClock className="size-3.5" strokeWidth={1.75} />
      {due.label}
    </span>
  );
}

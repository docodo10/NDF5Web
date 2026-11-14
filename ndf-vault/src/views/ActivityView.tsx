"use client";

import { useMemo, useState } from "react";
import { useVault } from "@/lib/store";
import { CURRENT_USER_ID } from "@/lib/sample-data";
import { PageHeader, SampleNotice, TextTabs, type TabItem } from "@/components/ui";
import { ActivityList } from "./shared";

type Who = "all" | "mine";

export function ActivityView() {
  const { activity } = useVault();
  const [who, setWho] = useState<Who>("all");
  const mine = useMemo(() => activity.filter((a) => a.userId === CURRENT_USER_ID), [activity]);

  const items: TabItem<Who>[] = [
    { id: "all", label: "All activity", count: activity.length },
    { id: "mine", label: "My activity", count: mine.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="A running history of changes across the vault." actions={<SampleNotice />} />
      <TextTabs<Who> label="Activity scope" items={items} value={who} onChange={setWho} />
      <div className="max-w-[880px]">
        <ActivityList items={who === "all" ? activity : mine} emptyHint="Rename, move, archive or copy a file and it will be recorded here." />
      </div>
    </div>
  );
}

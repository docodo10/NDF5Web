"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useVault } from "@/lib/store";
import { CURRENT_USER_ID } from "@/lib/sample-data";
import { getLang, t } from "@/lib/i18n";
import { journalText } from "@/lib/journal";
import { normalizeConsultationCode } from "@/lib/protection";
import { fold } from "@/lib/search";
import { SearchField } from "@/components/files/Explorer";
import { Button, PageHeader, TextTabs, type TabItem } from "@/components/ui";
import { ActivityList } from "./shared";

type Scope = "all" | "mine" | "security";

export function ActivityView() {
  const { activity, exportJournal } = useVault();
  const [scope, setScope] = useState<Scope>("all");
  const mine = useMemo(() => activity.filter((a) => a.userId === CURRENT_USER_ID), [activity]);
  const security = useMemo(() => activity.filter((a) => a.kind === "security"), [activity]);
  const [query, setQuery] = useState("");
  const scoped = scope === "all" ? activity : scope === "mine" ? mine : security;
  const lang = getLang();
  // A consultation code read off a photo finds the opening it came from, however it is typed.
  // An entry is found by what it says on screen as well as by what was recorded.
  const shown = useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return scoped;
    const code = normalizeConsultationCode(query);
    return scoped.filter((a) => {
      if (code !== null && a.code === code) return true;
      if (fold(`${a.verb} ${a.target} ${a.code ?? ""}`).includes(needle)) return true;
      const said = journalText(a);
      return fold(`${said.verb} ${said.target} ${a.code ?? ""}`).includes(needle);
    });
  }, [scoped, query, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const items: TabItem<Scope>[] = [
    { id: "all", label: t("Toute l’activité", "All activity"), count: activity.length },
    { id: "mine", label: t("Mon activité", "My activity"), count: mine.length },
    { id: "security", label: t("Sécurité", "Security"), count: security.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Activité", "Activity")}
        description={t("Le journal du Vault : ouvertures, téléchargements, changements et événements de sécurité.", "The Vault’s activity log: openings, downloads, changes and security events.")}
        actions={
          <Button icon={Download} disabled={shown.length === 0} onClick={() => void exportJournal(shown)}>
            {t("Exporter (CSV)", "Export (CSV)")}
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TextTabs<Scope> label={t("Portée de l’activité", "Activity scope")} items={items} value={scope} onChange={setScope} />
        <SearchField value={query} onChange={setQuery} placeholder={t("Action, fichier ou code de consultation", "Action, file or viewing code")} />
      </div>
      <div className="max-w-[880px]">
        <ActivityList
          items={shown}
          emptyTitle={query.trim() ? t("Aucune entrée ne correspond", "No entries match") : scope === "security" ? t("Aucun événement de sécurité", "No security events") : t("Aucune activité pour l’instant", "No activity yet")}
          emptyHint={
            query.trim()
              ? t("Vérifiez le code ou essayez un autre mot.", "Check the code or try another word.")
              : scope === "security"
                ? t("Les verrouillages, déverrouillages, changements de phrase secrète et fichiers altérés s’afficheront ici.", "Locks, unlocks, passphrase changes and altered files will show here.")
                : t("Ouvrez, renommez, déplacez ou téléchargez un fichier : ce sera consigné ici.", "Open, rename, move or download a file: it will be recorded here.")
          }
        />
      </div>
    </div>
  );
}

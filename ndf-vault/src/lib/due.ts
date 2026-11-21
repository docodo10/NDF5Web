/**
 * Dates that matter on a document: an option that lapses, a contract to
 * renew, a signature expected by a given day.
 */

import { t } from "./i18n";

export type DueState = "overdue" | "today" | "soon" | "later";

export interface Due {
  /** Whole days from today to the date; negative once it has passed. */
  days: number;
  state: DueState;
  /** "Échue depuis 3 jours", "Aujourd’hui", "Dans 12 jours". */
  label: string;
}

/** Within this many days, a date counts as coming up. */
export const SOON_DAYS = 30;

const DAY = 86_400_000;

/** A calendar date typed by a person ("2026-12-01"), or null when it is not one. */
export function parseDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Rejects "2026-02-31", which the pattern alone lets through.
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && y >= 2000 && y <= 2100 ? value : null;
}

/** Today, as a calendar date in this device's time zone. */
export function today(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const stamp = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export function dueOf(dueAt: string | undefined, now = new Date()): Due | null {
  const day = parseDay(dueAt);
  if (!day) return null;
  const days = Math.round((stamp(day) - stamp(today(now))) / DAY);
  if (days < 0) return { days, state: "overdue", label: days === -1 ? t("Échue depuis hier", "Overdue since yesterday") : t(`Échue depuis ${-days} jours`, `${-days} days overdue`) };
  if (days === 0) return { days, state: "today", label: t("Aujourd’hui", "Today") };
  if (days === 1) return { days, state: "soon", label: t("Demain", "Tomorrow") };
  return { days, state: days <= SOON_DAYS ? "soon" : "later", label: t(`Dans ${days} jours`, `In ${days} days`) };
}

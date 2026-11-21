"use client";

import clsx from "clsx";
import { Check, Minus } from "lucide-react";
import type { ButtonHTMLAttributes, ComponentType, ReactNode, Ref } from "react";
import type { FileStatus, User } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/format";
import { t } from "@/lib/i18n";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "outline" | "soft" | "ghost";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-neutral-800 active:bg-neutral-700 shadow-xs",
  outline: "bg-white text-neutral-800 border border-line hover:bg-subtle active:bg-fill shadow-xs",
  soft: "bg-fill text-neutral-800 hover:bg-neutral-200/70 active:bg-neutral-200",
  ghost: "text-neutral-600 hover:bg-fill hover:text-ink",
};

export function Button({
  variant = "outline",
  size = "md",
  icon: Icon,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md"; icon?: IconType; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 disabled:opacity-50",
        size === "md" ? "h-9 px-3.5 text-[13px]" : "h-8 px-3 text-[12.5px]",
        BUTTON_VARIANT[variant],
        className,
      )}
    >
      {Icon && <Icon className="size-4 shrink-0" strokeWidth={1.75} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  variant = "outline",
  size = "md",
  round,
  active,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconType;
  label: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  round?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center transition-colors duration-150 disabled:opacity-40",
        size === "md" ? "size-9" : "size-8",
        round ? "rounded-full" : "rounded-lg",
        BUTTON_VARIANT[variant],
        active && "bg-fill text-ink",
        className,
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </button>
  );
}

/* ---------------------------------------------------------------- Checkbox */

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={clsx(
        "relative flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150 before:absolute before:-inset-2.5 before:content-['']",
        on ? "border-ink bg-ink text-white" : "border-neutral-300 bg-white hover:border-neutral-400",
      )}
    >
      {indeterminate ? <Minus className="size-3" strokeWidth={3} /> : checked ? <Check className="size-3" strokeWidth={3} /> : null}
    </button>
  );
}

/* ------------------------------------------------------------------ Avatar */

const AVATAR_TONES = ["bg-neutral-900 text-white", "bg-neutral-200 text-neutral-700", "bg-neutral-700 text-white", "bg-neutral-100 text-neutral-600 ring-1 ring-inset ring-line", "bg-neutral-500 text-white"];

export function Avatar({ user, size = 32 }: { user: User; size?: number }) {
  const tone = AVATAR_TONES[user.id.charCodeAt(user.id.length - 1) % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide", tone)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {user.initials}
    </span>
  );
}

/* ------------------------------------------------------------ Status badge */

const STATUS_STYLE: Record<FileStatus, string> = {
  Draft: "border-neutral-300 text-neutral-600",
  "In Review": "border-amber-300 text-amber-700",
  Approved: "border-emerald-300 text-emerald-700",
  Final: "border-ink text-ink",
  Archived: "border-dashed border-neutral-300 text-neutral-500",
};

export function StatusBadge({ status }: { status: FileStatus }) {
  return (
    <span className={clsx("inline-flex h-[22px] items-center whitespace-nowrap rounded-md border bg-white px-2 text-[11.5px] font-medium", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex h-[22px] items-center whitespace-nowrap rounded-md border border-line bg-white px-2 text-[11.5px] font-medium text-neutral-600", className)}>
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------- Tabs */

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: IconType;
  count?: number;
}

/** Segmented tabs inside a grey rail (primary page-level navigation). */
export function SegmentedTabs<T extends string>({ items, value, onChange, label }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="scroll-quiet -mx-1 max-w-full overflow-x-auto px-1 py-0.5">
      <div role="tablist" aria-label={label} className="inline-flex h-9 items-center gap-0.5 rounded-[10px] bg-fill p-[3px]">
        {items.map(({ id, label: text, icon: Icon }) => {
          const on = id === value;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => onChange(id)}
              className={clsx(
                "inline-flex h-[30px] items-center gap-2 whitespace-nowrap rounded-[7px] px-3 text-[13px] font-medium transition-all duration-150",
                on ? "bg-white text-ink shadow-[0_1px_2px_rgb(10_10_10/0.08),0_0_0_1px_rgb(10_10_10/0.04)]" : "text-neutral-500 hover:text-neutral-800",
              )}
            >
              {Icon && <Icon className="size-[15px]" strokeWidth={1.75} />}
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Lighter second-level tabs: the active one gets a white bordered pill. */
export function TextTabs<T extends string>({ items, value, onChange, label }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="scroll-quiet max-w-full overflow-x-auto py-0.5">
      <div role="tablist" aria-label={label} className="inline-flex items-center gap-1">
        {items.map(({ id, label: text, icon: Icon, count }) => {
          const on = id === value;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => onChange(id)}
              className={clsx(
                "inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-[13px] font-medium transition-colors duration-150",
                on ? "border-line bg-white text-ink shadow-xs" : "border-transparent text-neutral-500 hover:text-neutral-800",
              )}
            >
              {Icon && <Icon className="size-[15px]" strokeWidth={1.75} />}
              {text}
              {count !== undefined && <span className="text-[11.5px] font-normal tabular-nums text-neutral-400">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Misc bits */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line bg-white px-1 font-sans text-[10.5px] font-medium text-neutral-500">
      {children}
    </kbd>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-1.5 text-[13.5px] text-neutral-500">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon: IconType; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-3 flex size-10 items-center justify-center rounded-[10px] border border-line bg-white text-neutral-500 shadow-xs">
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </span>
      <p className="text-[13.5px] font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[13px] text-neutral-500">{hint}</p>}
    </div>
  );
}

export function SampleNotice() {
  return (
    <Chip className="border-dashed text-neutral-500">{t("Données d’exemple · vos fichiers téléversés s’y ajoutent", "Sample data · your uploaded files are added to it")}</Chip>
  );
}

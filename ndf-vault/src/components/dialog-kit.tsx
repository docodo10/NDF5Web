"use client";

import clsx from "clsx";
import * as Dialog from "@radix-ui/react-dialog";
import { Eye, EyeOff, Info, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useVault } from "@/lib/store";
import { IconButton } from "./ui";

/* -------------------------------------------------------------- Modal shell */

export function Modal({ title, description, children, footer, onSubmit, width = 440 }: { title: string; description?: string; children: ReactNode; footer: ReactNode; onSubmit?: () => void; width?: number }) {
  const { openDialog } = useVault();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };
  return (
    <Dialog.Root open onOpenChange={(o) => !o && openDialog(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] animate-fade bg-neutral-900/20 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Land on the field to fill in (or the dialog itself), never on the close button.
            e.preventDefault();
            const root = e.currentTarget as HTMLElement;
            (root.querySelector<HTMLElement>("[data-autofocus]") ?? root).focus();
          }}
          className="fixed left-1/2 top-1/2 z-[81] flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line bg-white shadow-modal focus:outline-none"
          style={{ maxWidth: width }}
        >
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-5">
              <div className="min-w-0">
                <Dialog.Title className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</Dialog.Title>
                {description && <p className="mt-1 text-[13px] text-neutral-500">{description}</p>}
              </div>
              <Dialog.Close asChild>
                <IconButton icon={X} label="Fermer" variant="ghost" size="sm" className="-mr-1.5 -mt-1" />
              </Dialog.Close>
            </div>
            <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            <div className="flex items-center justify-end gap-2 border-t border-hair px-5 py-3.5">{footer}</div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const INPUT =
  "h-9 w-full rounded-lg border border-line bg-white px-3 text-[13px] text-ink shadow-xs transition-colors duration-150 placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-400";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-4 block last:mb-0">
      <span className="mb-1.5 block text-[12.5px] font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] text-neutral-500">{hint}</span>}
    </label>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-[10px] border border-dashed border-line bg-subtle px-3 py-2.5 text-[12.5px] leading-[18px] text-neutral-600">
      <Info className="mt-px size-4 shrink-0 text-neutral-400" strokeWidth={1.75} />
      <p>{children}</p>
    </div>
  );
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {hint && <p className="text-[12px] text-neutral-500">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150", on ? "bg-ink" : "bg-neutral-300")}
      >
        <span className={clsx("absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-xs transition-transform duration-150", on && "translate-x-4")} />
      </button>
    </div>
  );
}

export { Toggle as SwitchRow };

/** A passphrase input with a show / hide button. */
export function PassphraseInput({ id, value, onChange, autoComplete, autoFocus, placeholder }: { id: string; value: string; onChange: (v: string) => void; autoComplete: "current-password" | "new-password"; autoFocus?: boolean; placeholder?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        {...(autoFocus ? { "data-autofocus": true } : {})}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        className={clsx(INPUT, "pr-10")}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Masquer la phrase secrète" : "Afficher la phrase secrète"}
        aria-pressed={shown}
        className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-md text-neutral-400 transition-colors duration-150 hover:bg-fill hover:text-ink"
      >
        {shown ? <EyeOff className="size-4" strokeWidth={1.75} /> : <Eye className="size-4" strokeWidth={1.75} />}
      </button>
    </div>
  );
}

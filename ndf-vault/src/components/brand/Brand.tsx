import { NDF5_FULL, NDF5_MARK } from "./logo-paths";

/** The NDF5 mark ("NDF5" only), traced from the official logo. Color follows `currentColor`. */
export function Ndf5Mark({ className, title = "NDF5" }: { className?: string; title?: string }) {
  return (
    <svg viewBox={`0 0 ${NDF5_MARK.w} ${NDF5_MARK.h}`} className={className} role="img" aria-label={title}>
      <path fill="currentColor" fillRule="evenodd" d={NDF5_MARK.d} />
    </svg>
  );
}

/** The full "NDF5 PRODUCTIONS" lockup. Color follows `currentColor`. */
export function Ndf5Logo({ className, title = "NDF5 Productions" }: { className?: string; title?: string }) {
  return (
    <svg viewBox={`0 0 ${NDF5_FULL.w} ${NDF5_FULL.h}`} className={className} role="img" aria-label={title}>
      <path fill="currentColor" fillRule="evenodd" d={NDF5_FULL.d} />
    </svg>
  );
}

/** Sidebar lockup: red NDF5 mark + VAULT wordmark. */
export function VaultLockup() {
  return (
    <span className="flex items-center gap-2.5">
      <Ndf5Mark className="h-[18px] w-auto text-brand" />
      <span className="h-4 w-px bg-neutral-300" aria-hidden />
      <span className="text-[13px] font-semibold tracking-[0.18em] text-ink">VAULT</span>
    </span>
  );
}

/** Very faint logo behind the main content area. */
export function AppWatermark() {
  return (
    <div aria-hidden className="pointer-events-none absolute bottom-5 right-7 z-0 select-none text-ink opacity-[0.035]">
      <Ndf5Logo className="h-auto w-[min(230px,34vw)]" title="" />
    </div>
  );
}

/** Diagonal watermark laid over a document page. */
export function PageWatermark() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      <div className="-rotate-[32deg] text-ink opacity-[0.05]">
        <Ndf5Logo className="h-auto w-[560px]" title="" />
      </div>
    </div>
  );
}

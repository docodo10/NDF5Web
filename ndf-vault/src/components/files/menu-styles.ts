/** Shared class names so every dropdown and popover looks identical. */
export const MENU_CONTENT =
  "z-[70] min-w-[196px] origin-[var(--radix-dropdown-menu-content-transform-origin)] animate-pop rounded-[10px] border border-line bg-white p-1 shadow-menu";

export const MENU_ITEM =
  "flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 text-[13px] text-neutral-700 outline-none transition-colors duration-100 data-[highlighted]:bg-fill data-[highlighted]:text-ink data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40";

export const MENU_SEPARATOR = "mx-1 my-1 h-px bg-hair";

export const POPOVER_CONTENT =
  "z-[70] origin-[var(--radix-popover-content-transform-origin)] animate-pop rounded-xl border border-line bg-white shadow-menu";

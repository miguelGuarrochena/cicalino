"use client";

import { useEffect, useId, useRef, useState } from "react";

export type RowMenuItem =
  | { kind?: "item"; label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }
  | { kind: "heading"; label: string }
  | { kind: "divider" };

/* The "⋯" menu on a category or product row. Keeps rows readable: the few
 * actions used all the time (price, availability) stay on the row; the rest
 * live here with a real tap target. */
export const RowMenu = ({ label, items }: { label: string; items: RowMenuItem[] }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="grid size-10 place-items-center rounded-full text-lg leading-none text-carbon/55 transition hover:bg-carbon/5 hover:text-carbon"
      >
        <span aria-hidden>⋯</span>
      </button>
      {open && (
        <ul
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 max-h-80 w-56 overflow-y-auto rounded-2xl border border-linea bg-surface p-1 shadow-lg"
        >
          {items.map((item, i) =>
            item.kind === "divider" ? (
              <li key={`d-${i}`} role="separator" className="my-1 border-t border-linea" />
            ) : item.kind === "heading" ? (
              <li
                key={`h-${i}`}
                role="presentation"
                className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-carbon/45"
              >
                {item.label}
              </li>
            ) : (
              <li key={`${item.label}-${i}`} role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={`flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm font-medium transition disabled:opacity-40 ${
                    item.danger ? "text-red-600 hover:bg-red-500/10" : "text-carbon hover:bg-carbon/5"
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
};

/* On/off with a visible label, for availability. */
export const AvailabilitySwitch = ({
  checked,
  onChange,
  labelOn,
  labelOff,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  labelOn: string;
  labelOff: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      onChange(!checked);
    }}
    className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-1.5 text-xs font-semibold disabled:opacity-50"
  >
    <span
      aria-hidden
      className={`relative h-6 w-10 rounded-full transition ${checked ? "bg-marca" : "bg-carbon/20"}`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-crema shadow transition-all ${
          checked ? "left-[1.125rem]" : "left-0.5"
        }`}
      />
    </span>
    <span className={checked ? "text-carbon/75" : "text-carbon/45"}>{checked ? labelOn : labelOff}</span>
  </button>
);

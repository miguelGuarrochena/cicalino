"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string };

type Variant = "field" | "pill";

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
  placeholder?: string;
  variant?: Variant;
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`shrink-0 opacity-55 transition-transform ${open ? "rotate-180" : ""}`}
    aria-hidden
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const Select = ({
  value,
  onChange,
  options,
  className = "",
  triggerClassName = "",
  ariaLabel,
  disabled = false,
  placeholder = "—",
  variant = "field",
}: Props) => {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxH: number;
  } | null>(null);
  const [active, setActive] = useState(-1);

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? placeholder;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const spaceBelow = window.innerHeight - r.bottom - gap - 12;
    const spaceAbove = r.top - gap - 12;
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxH = Math.min(280, preferBelow ? spaceBelow : spaceAbove);
    const heightGuess = Math.min(maxH, options.length * 40 + 8);
    setPos({
      top: preferBelow
        ? r.bottom + gap
        : Math.max(12, r.top - gap - heightGuess),
      left: r.left,
      width: Math.max(r.width, variant === "pill" ? 140 : r.width),
      maxH,
    });
  }, [options.length, variant]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, place]);

  /* Al abrir, el resaltado arranca en la opción elegida. Ajustado durante el
   * render: en un efecto el menú se pintaba una vez con el resaltado viejo. */
  const [abiertoAnterior, setAbiertoAnterior] = useState(open);
  if (open !== abiertoAnterior) {
    setAbiertoAnterior(open);
    if (open) {
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    }
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!options.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % options.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const opt = options[active];
        if (opt) {
          onChange(opt.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, options, active, onChange]);

  useEffect(() => {
    if (!open || active < 0) return;
    const item = menuRef.current?.querySelector<HTMLElement>(
      `[data-idx="${active}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const triggerBase =
    variant === "pill"
      ? "inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded-full border border-linea bg-surface px-3 py-1.5 text-xs font-semibold text-carbon outline-none transition focus-visible:border-marca focus-visible:ring-2 focus-visible:ring-marca/20 sm:max-w-[14rem]"
      : "flex w-full items-center justify-between gap-2 rounded-xl border border-linea bg-crema/40 px-3 py-2.5 text-left text-sm text-carbon outline-none transition focus-visible:border-marca focus-visible:ring-2 focus-visible:ring-marca/20";

  const menu = open && pos && typeof document !== "undefined"
    ? createPortal(
        <ul
          ref={menuRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="u-pop fixed z-[200] overflow-y-auto overscroll-contain rounded-2xl border border-linea bg-surface py-1 shadow-xl"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxH,
          }}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            const isActive = i === active;
            return (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  data-idx={i}
                  aria-selected={isSelected}
                  className={`flex w-full px-3 py-2.5 text-left text-sm transition ${
                    isSelected
                      ? "bg-marca/10 font-semibold text-marca"
                      : isActive
                        ? "bg-carbon/5 text-carbon"
                        : "text-carbon/80 hover:bg-carbon/5"
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={`${triggerBase} ${triggerClassName} ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        } ${open ? "border-marca ring-2 ring-marca/20" : ""}`}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Chevron open={open} />
      </button>
      {menu}
    </div>
  );
};

// ============================================================
// ADC components — React/TypeScript reference implementation
// Pairs with tokens.css + components.css. Drop the stylesheets
// in your root layout, then use these components anywhere.
// ============================================================

import * as React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const v = variant === "primary" ? "" : `adc-btn--${variant}`;
  return (
    <button type={type} className={`adc-btn ${v} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}

export function Pill({
  tone = "default",
  children,
  className = "",
}: {
  tone?: "default" | "ok" | "warn" | "err" | "muted" | "count";
  children: React.ReactNode;
  className?: string;
}) {
  const t = tone === "default" ? "" : `adc-pill--${tone}`;
  return <span className={`adc-pill ${t} ${className}`.trim()}>{children}</span>;
}

export function Card({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`adc-card ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

// ---------- ADC Mark (logo) ----------
export function ADCMark({ size = 60, label = "ADC" }: { size?: number; label?: string }) {
  const disc = Math.round(size * (50 / 60));
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "var(--adc-accent-1)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: (size - disc) / 2,
          top: (size - disc) / 2,
          width: disc,
          height: disc,
          borderRadius: "50%",
          background: "var(--adc-accent-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--adc-font-mono)",
          fontWeight: 700,
          fontSize: Math.round(size * (16 / 60)),
          color: "var(--adc-text)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ---------- Menu (desktop) ----------
export function Menu({
  items,
  active,
  onNavigate,
}: {
  items: string[];
  active?: string;
  onNavigate?: (label: string) => void;
}) {
  // Simple horizontal capsule. For the centered ADC mark, render the mark
  // separately at 50%; this kit ships the structure, you choose the layout.
  return (
    <div className="adc-menu" style={{ width: 660 }}>
      <div className="adc-menu__bar" />
      <div className="adc-menu__items">
        {items.map((label) => (
          <div
            key={label}
            className={`adc-menu__item ${active === label ? "is-active" : ""}`}
            onClick={() => onNavigate?.(label)}
          >
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="adc-menu__mark">
        <ADCMark />
      </div>
    </div>
  );
}

// ---------- Mobile menu ----------
export function MobileMenu({
  items,
  active,
  onNavigate,
}: {
  items: string[];
  active?: string;
  onNavigate?: (label: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="adc-menu-m">
      <div style={{ position: "relative", height: 60 }}>
        <button
          type="button"
          className="adc-menu-m__bar"
          style={{ paddingLeft: 50, paddingRight: 16 }}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          Menu
        </button>
        <div
          style={{ position: "absolute", left: 0, top: 0, zIndex: 2, cursor: "pointer" }}
          onClick={() => onNavigate?.(items[0])}
        >
          <ADCMark />
        </div>
      </div>
      <ul
        className="adc-menu-m__list"
        style={{
          maxHeight: open ? 400 : 0,
          overflow: "hidden",
          transition: "max-height 250ms cubic-bezier(0.2,0.8,0.2,1)",
          marginTop: open ? 8 : 0,
        }}
      >
        {items.map((label) => (
          <li
            key={label}
            className={`adc-menu-m__item ${active === label ? "is-active" : ""}`}
            onClick={() => {
              setOpen(false);
              onNavigate?.(label);
            }}
          >
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Alert ----------
type AlertTone = "info" | "success" | "warn" | "error";
const ALERT_GLYPHS: Record<AlertTone, string> = { info: "i", success: "✓", warn: "!", error: "×" };

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: AlertTone;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`adc-alert adc-alert--${tone}`}>
      <span className="adc-alert__icon">{ALERT_GLYPHS[tone]}</span>
      <div>
        {title && <strong className="adc-alert__title">{title}</strong>}
        {children}
      </div>
    </div>
  );
}

// ---------- Tabs ----------
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: T[];
  active: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="adc-tabs">
      {tabs.map((t) => (
        <div
          key={t}
          className={`adc-tab ${active === t ? "is-active" : ""}`}
          onClick={() => onChange(t)}
        >
          <span>{t}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Pagination ----------
export function Pagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (p: number) => void;
}) {
  // Compact: first, current ±1, last, with ellipses.
  const pages: (number | "…")[] = [];
  const add = (n: number | "…") => pages.push(n);
  add(1);
  if (page > 3) add("…");
  for (let p = Math.max(2, page - 1); p <= Math.min(total - 1, page + 1); p++) add(p);
  if (page < total - 2) add("…");
  if (total > 1) add(total);

  return (
    <div className="adc-pager">
      <button
        type="button"
        className="adc-pg"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        ←
      </button>
      {pages.map((p, i) =>
        p === "…"
          ? (
            <span
              key={i}
              className="adc-pg"
              style={{ border: 0, background: "transparent", color: "var(--adc-accent-1)" }}
            >
              …
            </span>
          )
          : (
            <button
              type="button"
              key={i}
              className={`adc-pg ${p === page ? "is-current" : ""}`}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          )
      )}
      <button
        type="button"
        className="adc-pg"
        disabled={page === total}
        onClick={() => onChange(page + 1)}
      >
        →
      </button>
    </div>
  );
}

// ---------- Modal ----------
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="adc-scrim" onClick={onClose} />
      <div className="adc-modal" role="dialog" aria-modal="true">
        <button type="button" className="adc-modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {title && <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>}
        <div style={{ fontSize: 13, lineHeight: 1.55 }}>{children}</div>
        {footer && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

// ---------- Table ---------- (use semantic markup directly; this is a thin wrapper)
export function Table({ children, ...rest }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className="adc-table" {...rest}>
      {children}
    </table>
  );
}

// ---------- Checkbox / Radio ----------
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  className = "",
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
}) {
  const input = (
    <input
      {...rest}
      type="checkbox"
      className={`adc-checkbox ${className}`.trim()}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
  if (label === undefined) return input;
  return (
    <label className="adc-check-row" aria-disabled={disabled || undefined}>
      {input}
      <span>{label}</span>
    </label>
  );
}

export function Radio({
  checked,
  onChange,
  label,
  disabled,
  className = "",
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
}) {
  const input = (
    <input
      {...rest}
      type="radio"
      className={`adc-radio ${className}`.trim()}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
  if (label === undefined) return input;
  return (
    <label className="adc-check-row" aria-disabled={disabled || undefined}>
      {input}
      <span>{label}</span>
    </label>
  );
}

// ---------- Status indicator (dot + label) ----------
type StatusVariant =
  | "passed"
  | "failed"
  | "blocked"
  | "pending"
  | "running"
  | "published"
  | "draft"
  | "building"
  | "live";

export function StatusIndicator({
  variant,
  children,
  className = "",
}: {
  variant: StatusVariant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`adc-status adc-status--${variant} ${className}`.trim()}>
      <span className="adc-status__dot" />
      <span>{children}</span>
    </span>
  );
}

// ---------- Empty state ----------
export function EmptyState({
  glyph = "∅",
  title,
  description,
  action,
}: {
  glyph?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="adc-empty">
      <div className="adc-empty__glyph">{glyph}</div>
      <h4 style={{ margin: "0 0 6px" }}>{title}</h4>
      {description && (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--adc-accent-1)" }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

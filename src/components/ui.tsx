"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:brightness-110 shadow-sm shadow-accent/30",
  secondary: "bg-surface-2 text-text hover:bg-border",
  ghost: "bg-transparent text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-110",
};

export function Button({ variant = "primary", className = "", loading, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small, label }: { small?: boolean; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-muted">
      <span className={`${small ? "h-4 w-4 border-2" : "h-6 w-6 border-[3px]"} animate-spin rounded-full border-current border-t-transparent`} />
      {label && <span className="text-sm">{label}</span>}
      <span className="sr-only">{label ?? "Loading"}</span>
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-surface p-4 ${className}`}>{children}</div>;
}

export function Chip({ children, active, onClick, className = "" }: { children: ReactNode; active?: boolean; onClick?: () => void; className?: string }) {
  const cls = `inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition ${active ? "bg-text text-bg" : "bg-surface-2 text-muted hover:text-text"} ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={cls}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  );
}

export function EmptyState({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="emoji text-6xl" aria-hidden>
        {emoji}
      </div>
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <div className="max-w-sm text-sm text-muted">{children}</div>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ value, className = "", color = "bg-accent" }: { value: number; className?: string; color?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-surface-2 ${className}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

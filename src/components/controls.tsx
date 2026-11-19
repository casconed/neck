// Small input controls. Text inputs edit a local draft and commit on blur/enter; invalid input
// snaps back to the stored value.
import { useState, type ReactNode } from "react";

export function Button({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return <button className={danger ? "danger" : undefined} onClick={onPress} disabled={disabled}>{label}</button>;
}

export function Labeled({ label, hint, tone, children }: { label: string; hint?: string; tone?: string; children: ReactNode }) {
  return (
    <span className="row" style={{ gap: 4 }} title={hint}>
      <span className="dim" style={tone ? { color: tone } : undefined}>{label}</span>
      {children}
    </span>
  );
}

/** A parser returns the value, or a message saying why the text isn't valid. */
export type Parse<T> = (t: string) => { ok: T } | { error: string };

/**
 * Commits on blur/Enter. Invalid text is never silently thrown away: it stays in the field,
 * outlined, with the reason as a tooltip, until it's fixed or Escape restores the stored value.
 */
export function DraftInput<T>({ value, format, parse, onCommit, width = 48, label }: {
  value: T; format: (v: T) => string; parse: Parse<T>; onCommit: (v: T) => void; width?: number; label: string;
}) {
  const [draft, setDraft] = useState(format(value));
  const [error, setError] = useState<string>();
  const [shown, setShown] = useState(value);
  if (shown !== value) { // reset during render (React's "adjust state from props" pattern), not in an effect
    setShown(value);
    setDraft(format(value));
    setError(undefined);
  }
  const commit = () => {
    const r = parse(draft);
    if ("error" in r) { setError(r.error); return; }
    setError(undefined);
    if (format(r.ok) !== format(value)) onCommit(r.ok);
  };
  return (
    <span className="draft">
      <input className={"num" + (error ? " invalid" : "")} aria-label={label} aria-invalid={!!error} title={error}
        style={{ width }} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(format(value)); setError(undefined); }
        }} />
      {error && <span className="error-tip" role="alert">{error}</span>}
    </span>
  );
}

export const intIn = (min: number, max: number): Parse<number> => (t) => {
  const v = Number(t.trim());
  return t.trim() && Number.isInteger(v) && v >= min && v <= max ? { ok: v } : { error: `enter a whole number from ${min} to ${max}` };
};

/** Numbers separated by commas and/or spaces. */
export const listIn = (min: number, max: number, minLen: number, maxLen: number): Parse<number[]> => (t) => {
  const xs = t.split(/[\s,]+/).filter(Boolean).map(Number);
  if (xs.length < minLen || xs.length > maxLen) return { error: `enter ${minLen} to ${maxLen} numbers` };
  return xs.every((x) => Number.isInteger(x) && x >= min && x <= max) ? { ok: xs } : { error: `numbers must be ${min} to ${max}` };
};

export function Select({ value, options, onChange, label }: {
  value: number; options: [number, string][]; onChange: (v: number) => void; label: string;
}) {
  const opts = options.some(([v]) => v === value) ? options : [[value, `? (${value})`] as [number, string], ...options];
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

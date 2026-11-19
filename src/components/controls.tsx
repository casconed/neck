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

/** Commits `parse(text)` when it returns a value, otherwise restores `format(value)`. */
export function DraftInput<T>({ value, format, parse, onCommit, width = 48, label }: {
  value: T; format: (v: T) => string; parse: (t: string) => T | undefined; onCommit: (v: T) => void; width?: number; label: string;
}) {
  const [draft, setDraft] = useState(format(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) { // reset during render (React's "adjust state from props" pattern), not in an effect
    setShown(value);
    setDraft(format(value));
  }
  const commit = () => {
    const v = parse(draft);
    if (v === undefined) setDraft(format(value));
    else if (format(v) !== format(value)) onCommit(v);
  };
  return (
    <input className="num" aria-label={label} style={{ width }} value={draft}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
  );
}

export const intIn = (min: number, max: number) => (t: string) => {
  const v = Number(t.trim());
  return Number.isInteger(v) && v >= min && v <= max ? v : undefined;
};

export const listIn = (min: number, max: number, minLen: number, maxLen: number) => (t: string) => {
  const xs = t.split(",").map((x) => x.trim()).filter(Boolean).map(Number);
  return xs.length >= minLen && xs.length <= maxLen && xs.every((x) => Number.isInteger(x) && x >= min && x <= max) ? xs : undefined;
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

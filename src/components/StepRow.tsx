import { memo } from "react";

/** Generated pulses (bit1) show orange, hand-added ones (bit0 only) blue. Either plays. */
const look = (v: number) => (v & 2 ? "generated" : v & 1 ? "manual" : "");

export const StepRow = memo(function StepRow({ label, steps, length, inactive, onToggle, onRemove }: {
  label: string; steps: Uint8Array; length: number; inactive?: boolean;
  onToggle: (step: number) => void; onRemove?: () => void;
}) {
  return (
    <div className={"steps" + (inactive ? " inactive" : "")}>
      <span className="label">{label}{inactive ? " off" : ""}</span>
      <div className="cells">
        {Array.from(steps, (v, i) => (
          <button key={i} className={`step ${look(v)}${i >= length ? " past" : ""}`} aria-label={`${label} step ${i + 1}`}
            onClick={() => onToggle(i)} />
        ))}
      </div>
      {onRemove && (
        <button className="remove-cycle" aria-label={`remove ${label}'s own steps`} onClick={onRemove}>✕</button>
      )}
    </div>
  );
});

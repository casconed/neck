import { memo, useMemo, useState } from "react";
import {
  Bytes, FIELDS, FieldDef, Project, Track as T1Track, addCycleRecord, channelMask, channels, copyTrack, field,
  layout, readField, removeCycleRecord, removeTrack, setField, setNotes, toggleStep, updateBody, updateTrack, writeField,
} from "../format";
import { Button, DraftInput, Labeled, Select, intIn, listIn } from "./controls";
import { noteName, parseNotes } from "./notes";
import { StepRow } from "./StepRow";

const SHOWN = FIELDS.filter((f) => !["cycles", "channels"].includes(f.name));

function FieldInput({ body, f, edit }: { body: Bytes; f: FieldDef; edit: (fn: (b: Bytes) => Bytes) => void }) {
  const v = readField(body, f), set = (x: number) => edit((b) => setField(b, f, x));
  return (
    <Labeled label={f.name} hint={f.partial} tone={f.partial ? "var(--partial)" : undefined}>
      {f.options
        ? <Select label={f.name} value={v} options={f.options} onChange={set} />
        : <DraftInput label={f.name} value={v} format={String} parse={intIn(f.min!, f.max!)} onCommit={set} />}
    </Labeled>
  );
}

export type Apply = (fn: (p: Project) => Project) => void;

/** `apply` must be stable (App's setState-based editor), so only an edited track re-renders. */
export const TrackCard = memo(function TrackCard({ track, pi, ti, patterns, apply }: {
  track: T1Track; pi: number; ti: number; patterns: { index: number; label: string }[]; apply: Apply;
}) {
  const act = useMemo(() => ({
    edit: (fn: (b: Bytes) => Bytes) => apply((p) => updateBody(p, pi, ti, fn)),
    setMute: (muted: boolean) => apply((p) => updateTrack(p, pi, ti, (t) => ({ ...t, mute: muted ? 1 : 0 }))),
    copyTo: (toPi: number, slot: number) => apply((p) => copyTrack(p, pi, ti, toPi, slot)),
    remove: () => apply((p) => removeTrack(p, pi, ti)),
  }), [apply, pi, ti]);
  const { body } = track;
  const l = useMemo(() => layout(body), [body]);
  const count = readField(body, field("cycles")), length = readField(body, field("steps"));
  const records = [...l.records].sort((a, b) => a.idx - b.idx);
  const free = [...Array(16).keys()].filter((c) => !l.records.some((r) => r.idx === c));
  const [addCycle, setAddCycle] = useState(free[0] ?? 0);
  const [copyPat, setCopyPat] = useState(patterns[0]?.index ?? 0);
  const [copySlot, setCopySlot] = useState(track.slot);

  return (
    <div className={"track" + (track.mute ? " muted" : "")}>
      <div className="row">
        <strong>track {track.slot}</strong>
        <Labeled label="notes" hint="1-8 notes: numbers (60 = C3) or names like C3 F#4, separated by spaces or commas">
          <DraftInput label={`track ${track.slot} notes`} width={150} value={l.notes} format={(n) => n.join(" ")}
            parse={(t) => { const r = parseNotes(t); return typeof r === "string" ? { error: r } : { ok: r }; }}
            onCommit={(n) => act.edit((b) => setNotes(b, n))} />
        </Labeled>
        <span className="dim">{l.notes.map(noteName).join(" ")}</span>
        <Labeled label="channels" hint="MIDI out channels, comma separated (blank = none)">
          <DraftInput label={`track ${track.slot} channels`} width={80} value={readField(body, field("channels"))}
            format={(m) => channels(m).join(",")}
            parse={(t) => { if (!t.trim()) return { ok: 0 }; const r = listIn(1, 16, 1, 16)(t); return "error" in r ? r : { ok: channelMask(r.ok) }; }}
            onCommit={(m) => act.edit((b) => writeField(b, field("channels"), m))} />
        </Labeled>
        <Button label={track.mute ? "unmute" : "mute"} onPress={() => act.setMute(!track.mute)} />
        <span className="dim">copy to</span>
        <Select label="copy to pattern" value={copyPat} options={patterns.map((p) => [p.index, p.label])} onChange={setCopyPat} />
        <Select label="copy to track slot" value={copySlot} options={[...Array(16).keys()].map((i) => [i + 1, `track ${i + 1}`])} onChange={setCopySlot} />
        <Button label="copy" onPress={() => act.copyTo(copyPat, copySlot)} />
        <Button label="remove" danger onPress={act.remove} />
      </div>

      <div className="fields">
        {SHOWN.map((f) => <FieldInput key={f.name} body={body} f={f} edit={act.edit} />)}
      </div>

      <div className="fields">
        <Labeled label="cycles" hint="how many cycles play; stored cycles past this are kept but off">
          <DraftInput label="cycles" value={count} format={String} parse={intIn(1, 16)} onCommit={(n) => act.edit((b) => writeField(b, field("cycles"), n))} />
        </Labeled>
        {free.length > 0 && <>
          <span className="dim">give</span>
          <Select label="cycle to add" value={free.includes(addCycle) ? addCycle : free[0]} options={free.map((c) => [c, `cycle ${c + 1}`])} onChange={setAddCycle} />
          <Button label="its own steps" onPress={() => act.edit((b) => addCycleRecord(b, free.includes(addCycle) ? addCycle : free[0]))} />
        </>}
      </div>

      <StepRow label="base" steps={body.subarray(l.gate, l.gate + 64)} length={length}
        onToggle={(i) => act.edit((b) => toggleStep(b, -1, i))} />
      {records.map((r) => (
        <StepRow key={r.idx} label={`cycle ${r.idx + 1}`} steps={body.subarray(r.gate, r.gate + 64)} length={length}
          inactive={r.idx >= count} onToggle={(i) => act.edit((b) => toggleStep(b, r.idx, i))}
          onRemove={() => act.edit((b) => removeCycleRecord(b, r.idx))} />
      ))}
    </div>
  );
});

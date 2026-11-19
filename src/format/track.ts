// One track block. A track's `body` runs from its `0c 00` marker up to (not including) the two
// bytes the container writes after it: [next track's slot-1 | sentinel][next track's mute | tail].
// Everything here is pure: functions take a body and return a new one.
import { Bytes, FormatError, concat, expect, s8, splice, startsWithAt, u16, u32, u32le } from "./bytes";
import { FieldDef, GATE_LEN, LOCK_FLAG, PAD_BEFORE_STEPS, TAIL_AFTER_STEPS, ZONE_B_TERM } from "./layout";

export interface CycleRecord {
  idx: number;     // 0-based cycle number
  start: number;   // offset of the [idx] byte
  gate: number;    // offset of its 64 step bytes
  end: number;     // one past the record (after its lock lists)
  hasLocks: boolean;
}

/** Offsets (in the coordinates of the buffer passed to layoutAt) of everything the editor touches. */
export interface TrackLayout {
  noteCount: number;   // u32 LE at start+2
  notes: number[];
  scale: number[];     // scale degrees (default chromatic 0..11; custom scales are shorter)
  gate: number;        // base step pattern (64 bytes)
  recordsCount: number; // offset of the [num cycle records] byte
  records: CycleRecord[];
  paramSection: number; // offset of the per-cycle param-override section
  steps: number;        // offset of the `steps` field; all FIELDS are relative to this
  summary: boolean;     // lock-summary block: extra byte(s) after the steps region
  formX: boolean;       // summary block whose links sit one byte later (see layoutAt)
  end: number;          // block end (incl. terminator), i.e. where the container's 2 link bytes begin + 2
}

/** Walk [groove locks][pitch locks] at p; returns the offset after them and whether any exist. */
const lockLists = (b: Bytes, p: number): { end: number; any: boolean } => {
  const groove = b[p++];
  for (let i = 0; i < groove; i++) { const entries = b[p]; p += 2 + entries * 5; }
  const pitch = b[p++];
  for (let i = 0; i < pitch; i++) p += 5 + u32(b, p + 1);
  return { end: p, any: groove + pitch > 0 };
};

/**
 * Parse the block starting at `start` in `b` (a whole file or a body; offsets come back in `b`'s
 * coordinates). Block grammar:
 *   [u16 ?, usually 12] [u32 note count][notes] [pitch overrides] [u32 scale length][degrees]
 *   [64 step bytes] [lock lists] [cycle records] [param overrides] [16 B pad] [steps region]
 * Nothing is matched by landmark: the walk follows the grammar and is then checked against the
 * Zone-B terminator at its fixed place in the steps region, so a mis-walk fails loudly.
 * (Upstream treats `0c 00` and the `00 01 .. 0b` scale table as fixed landmarks; neither is:
 * custom scales shorten the table and the u16 isn't always 12.)
 */
export const layoutAt = (b: Bytes, start: number): TrackLayout => {
  expect(start >= 0 && start + 6 < b.length, `block start ${start} out of range`);
  const noteCount = u32(b, start + 2);
  expect(noteCount >= 1 && noteCount <= 16, `bad note count ${noteCount} at ${start}`);
  let p = start + 6;
  const notes = Array.from(b.subarray(p, p + noteCount));
  p += noteCount;
  const overrides = b[p++];                      // per-cycle track-pitch overrides
  expect(overrides <= 16, `bad pitch-override count at ${p - 1}`);
  for (let i = 0; i < overrides; i++) p += 5 + u32(b, p + 1);
  const scaleLen = u32(b, p);
  expect(scaleLen >= 1 && scaleLen <= 12, `bad scale length ${scaleLen} at ${p}`);
  const scale = Array.from(b.subarray(p + 4, p + 4 + scaleLen));
  const gate = p + 4 + scaleLen;
  expect(gate + GATE_LEN + 2 < b.length, `block at ${start} runs past the end`);

  p = lockLists(b, gate + GATE_LEN).end;
  const recordsCount = p;
  const records: CycleRecord[] = [];
  for (let i = 0, n = b[p++]; i < n; i++) {
    const rec = { idx: b[p], start: p, gate: p + 1 };
    const locks = lockLists(b, p + 1 + GATE_LEN);
    records.push({ ...rec, end: locks.end, hasLocks: locks.any });
    p = locks.end;
  }
  const paramSection = p;
  for (let i = 0, n = b[p++]; i < n; i++) p += 2 + b[p] * 5;
  const steps = p + PAD_BEFORE_STEPS;
  expect(steps + TAIL_AFTER_STEPS <= b.length + 2 && startsWithAt(b, steps + ZONE_B_TERM - 3, [0, 0, 0, 0x53, 0]),
    `zone-B terminator missing for block at ${start} (steps at ${steps})`);
  // Where the two link bytes sit (see container.ts):
  //   plain block:            steps+0x2b5, +0x2b6
  //   summary, "Form Y":      +0x2b6 (non-zero end-marker), +0x2b7
  //   summary, "Form X":      +0x2b6 = 0, links at +0x2b7, +0x2b8 (one byte longer; seen mid-pattern
  //                           in device autosaves, and at the end of some banks)
  const summary = b[steps + LOCK_FLAG] !== 0;
  const formX = summary && b[steps + TAIL_AFTER_STEPS - 1] === 0;
  return {
    noteCount, notes, scale, gate, recordsCount, records, paramSection, steps, summary, formX,
    end: steps + TAIL_AFTER_STEPS + (summary ? 1 : 0) + (formX ? 1 : 0),
  };
};

export const layout = (body: Bytes): TrackLayout => layoutAt(body, 0);

// ---- field access (pure) -------------------------------------------------------------------

export const readField = (body: Bytes, f: FieldDef): number => {
  const o = layout(body).steps + f.off;
  switch (f.kind) {
    case "s8": return s8(body[o]);
    case "plus1": return body[o] - 1;
    case "ticks": case "mask": return u16(body, o);
    default: return body[o];
  }
};

export const writeField = (body: Bytes, f: FieldDef, v: number): Bytes => {
  const o = layout(body).steps + f.off, out = body.slice();
  if (f.kind === "ticks" || f.kind === "mask") { out[o] = v & 255; out[o + 1] = (v >> 8) & 255; }
  else out[o] = (f.kind === "plus1" ? v + 1 : v) & 255;
  return out;
};

export const channels = (mask: number): number[] => [...Array(16).keys()].filter((i) => (mask >> i) & 1).map((i) => i + 1);
export const channelMask = (chs: number[]): number => chs.reduce((m, c) => m | (1 << (c - 1)), 0);

// ---- steps ---------------------------------------------------------------------------------

/**
 * Step byte: bit1 = pulse generated from pulses/rotate/steps, bit0 = pulse added by hand. A step
 * plays when either is set (hardware-checked: setting bit0 on a generated step doesn't silence it).
 */
export const plays = (v: number): boolean => (v & 3) !== 0;

/** Step bytes for the base pattern (cycle = -1) or a stored cycle record. */
export const stepBytes = (body: Bytes, cycle = -1): Bytes => {
  const l = layout(body);
  const off = cycle < 0 ? l.gate : l.records.find((r) => r.idx === cycle)?.gate;
  if (off === undefined) throw new FormatError(`cycle ${cycle + 1} has no stored steps`);
  return body.subarray(off, off + GATE_LEN);
};

/** Turn a step off (clearing both its generated and manual bits) or on (as a manual pulse). */
export const toggleStep = (body: Bytes, cycle: number, step: number): Bytes => {
  const l = layout(body);
  const off = (cycle < 0 ? l.gate : l.records.find((r) => r.idx === cycle)?.gate);
  if (off === undefined) throw new FormatError(`cycle ${cycle + 1} has no stored steps`);
  const out = body.slice();
  out[off + step] = plays(out[off + step]) ? out[off + step] & ~3 : out[off + step] | 1;
  return out;
};

// ---- generated rhythm ----------------------------------------------------------------------

/**
 * The T-1's pulse generator: step i is a pulse when ((i - rotate) * pulses) mod steps < pulses.
 * Reproduces the stored generated bits of all 982 sample tracks without cycle data, so it's the
 * device's own algorithm (a Bresenham-style Euclidean rhythm, rotated right), not just a close one.
 */
export const euclid = (pulses: number, steps: number, rotate: number): boolean[] => {
  const k = Math.min(pulses, steps);
  return Array.from({ length: steps }, (_, i) => ((((i - rotate) * k) % steps) + steps) % steps < k);
};

/** Settings the generated pulses depend on; the device doesn't redraw them on load, so we must. */
export const SHAPE_FIELDS = new Set(["pulses", "rotate", "steps"]);
const SHAPE_PARAM_IDS = new Set([0x00, 0x02, 0x1d]); // per-cycle steps / pulses / rotate

/**
 * Redraw the generated bits (bit1) of the base steps, and of every stored cycle that has no
 * steps/pulses/rotate override of its own, from the track's settings. Manual pulses (bit0) stay.
 */
export const regenerate = (body: Bytes): Bytes => {
  const l = layout(body), out = body.slice();
  const read = (name: string) => out[l.steps + FIELD_OFFSETS[name]];
  const pattern = euclid(read("pulses"), read("steps"), read("rotate"));
  const draw = (gate: number) => pattern.forEach((on, i) => { out[gate + i] = on ? out[gate + i] | 2 : out[gate + i] & ~2; });
  draw(l.gate);
  const params = cycleParams(body);
  for (const r of l.records) if (!params.some((p) => p.cycle === r.idx && SHAPE_PARAM_IDS.has(p.id))) draw(r.gate);
  return out;
};
const FIELD_OFFSETS: Record<string, number> = { steps: 0x00, pulses: 0x15, rotate: 0x13a };

/** Set a track setting; pulses/rotate/steps also redraw the generated pulses to match. */
export const setField = (body: Bytes, f: FieldDef, v: number): Bytes => {
  const out = writeField(body, f, v);
  return SHAPE_FIELDS.has(f.name) ? regenerate(out) : out;
};

// ---- notes ---------------------------------------------------------------------------------

export const MAX_NOTES = 8;
export const setNotes = (body: Bytes, notes: number[]): Bytes => {
  if (notes.length < 1 || notes.length > MAX_NOTES || notes.some((n) => !Number.isInteger(n) || n < 0 || n > 127))
    throw new FormatError("notes: 1-8 values, 0-127");
  const l = layout(body);
  return splice(splice(body, 6, l.noteCount, notes), 2, 4, u32le(notes.length));
};

// ---- cycles --------------------------------------------------------------------------------

/**
 * Give cycle `idx` its own stored steps, starting as a copy of the base pattern. Records are kept
 * in descending cycle order, as the device writes them.
 */
export const addCycleRecord = (body: Bytes, idx: number): Bytes => {
  const l = layout(body);
  if (idx < 0 || idx > 15) throw new FormatError("cycle must be 1-16");
  if (l.records.some((r) => r.idx === idx)) throw new FormatError(`cycle ${idx + 1} already has its own steps`);
  const at = l.records.find((r) => r.idx < idx)?.start ?? l.paramSection;
  const rec = concat([idx], body.subarray(l.gate, l.gate + GATE_LEN), [0, 0]);
  const out = splice(body, at, 0, rec);
  out[l.recordsCount] += 1;
  return out;
};

/**
 * Drop everything stored for cycle `idx` (its steps, param overrides and pitch override); the cycle
 * then plays the base pattern. Each step re-reads the layout because the previous one shifts offsets.
 */
export const removeCycleRecord = (body: Bytes, idx: number): Bytes => {
  if (!layout(body).records.some((r) => r.idx === idx)) throw new FormatError(`cycle ${idx + 1} has no stored steps`);
  let out = removeCycleParams(body, idx);
  const l = layout(out), rec = l.records.find((r) => r.idx === idx)!;
  out = splice(out, rec.start, rec.end - rec.start);
  out[l.recordsCount] -= 1;
  return removePitchOverride(out, idx);
};

/** Header pitch overrides sit right after the notes: [num] then [idx][count u32][pitches]. */
const removePitchOverride = (body: Bytes, idx: number): Bytes => {
  const at = 6 + layout(body).noteCount;
  let p = at + 1;
  for (let i = 0; i < body[at]; i++) {
    const len = 5 + u32(body, p + 1);
    if (body[p] === idx) {
      const out = splice(body, p, len);
      out[at] -= 1;
      return out;
    }
    p += len;
  }
  return body;
};

/** Remove the per-cycle param-override entry for cycle `idx`, if any. */
const removeCycleParams = (body: Bytes, idx: number): Bytes => {
  const l = layout(body);
  let p = l.paramSection + 1;
  for (let i = 0; i < body[l.paramSection]; i++) {
    const len = 2 + body[p] * 5;
    if (body[p + 1] === idx) {
      const out = splice(body, p, len);
      out[l.paramSection] -= 1;
      return out;
    }
    p += len;
  }
  return body;
};

export interface CycleParam { cycle: number; id: number; value: number }
/** Per-cycle param overrides: [num][ [count][cycle] count x [id][u16 value][00 00] ]. */
export const cycleParams = (body: Bytes): CycleParam[] => {
  const l = layout(body), out: CycleParam[] = [];
  let p = l.paramSection + 1;
  for (let i = 0; i < body[l.paramSection]; i++) {
    const n = body[p], cycle = body[p + 1];
    for (let k = 0; k < n; k++) out.push({ cycle, id: body[p + 2 + k * 5], value: u16(body, p + 3 + k * 5) });
    p += 2 + n * 5;
  }
  return out;
};


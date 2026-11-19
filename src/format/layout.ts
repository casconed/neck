// T-1 track-block layout constants and the editable-field table.
// Source: github.com/pizboese/t1-backup-file-format FORMAT.md + decode/FORMAT_DECODE.md (MIT),
// plus per-cycle param ids 0x02 (pulses) / 0x1d (rotate) found in this project.

export const TAG = Uint8Array.of(0x6f, 0x73, 0x7c, 0x74); // "os|t" end-of-file tag

export const GATE_LEN = 64; // step bytes per pattern/cycle

// relative to the `steps` field
export const PAD_BEFORE_STEPS = 16;
export const TAIL_AFTER_STEPS = 0x2b7; // steps .. block end (excluding lock terminator)
export const ZONE_B_TERM = 0x295;      // the `00 00 00 53 00` terminator's 0x53
export const LOCK_FLAG = 0x29c;        // != 0: "summary" block, one extra terminator byte at the end

export type FieldKind = "u8" | "s8" | "plus1" | "ticks" | "mask";
export interface FieldDef {
  name: string;
  off: number;          // relative to `steps`
  kind: FieldKind;
  min?: number;
  max?: number;
  options?: [number, string][];
  partial?: string;     // located upstream but not fully confirmed
}

export const DIVISIONS: [number, string][] =
  [[384, "/1"], [192, "/2"], [96, "/4"], [64, "/6"], [48, "/8"], [32, "/12"], [24, "/16"], [16, "/24"], [12, "/32"], [6, "/64"]];
const names = (xs: string[]): [number, string][] => xs.map((x, i) => [i, x]);

export const FIELDS: FieldDef[] = [
  { name: "steps", off: 0x00, kind: "u8", min: 1, max: 64 },
  { name: "cycles", off: 0x14d, kind: "u8", min: 1, max: 16 },
  { name: "pulses", off: 0x15, kind: "u8", min: 0, max: 64, partial: "located upstream, not confirmed" },
  { name: "rotate", off: 0x13a, kind: "u8", min: 0, max: 63, partial: "direction unconfirmed" },
  { name: "division", off: 0x2a, kind: "ticks", options: DIVISIONS },
  { name: "repeats", off: 0xfa, kind: "plus1", min: 0, max: 48, partial: "stored as repeats+1" },
  { name: "time", off: 0x124, kind: "ticks", options: DIVISIONS, partial: "repeat spacing" },
  { name: "ramp", off: 0x13b, kind: "s8", min: -20, max: 20 },
  { name: "pace", off: 0x13c, kind: "s8", min: -20, max: 20 },
  { name: "repeat end", off: 0x14a, kind: "u8", options: names(["tail", "choke"]) },
  { name: "style", off: 0x13d, kind: "u8", options: [[0, "poly 1"], [1, "poly 2"], [2, "poly 3"], [3, "poly 4"], [4, "poly 5"],
      [8, "mono 1"], [9, "mono 2"], [10, "mono 3"], [11, "mono 4"], [12, "mono 5"]] },
  { name: "voicing", off: 0xcf, kind: "s8", min: -20, max: 20 },
  { name: "voice dir", off: 0x149, kind: "u8", options: names(["up", "down"]) },
  { name: "range", off: 0x90, kind: "s8", min: -20, max: 20 },
  { name: "phrase", off: 0x147, kind: "u8", min: 0, max: 8, partial: "8 = CV in" },
  { name: "velocity", off: 0x7b, kind: "u8", min: 0, max: 127 },
  { name: "sustain", off: 0xa5, kind: "u8", min: 0, max: 127 },
  { name: "probability", off: 0x79, kind: "s8", min: -20, max: 20 },
  { name: "accent", off: 0x10f, kind: "s8", min: -20, max: 20 },
  { name: "timing", off: 0xba, kind: "s8", min: -20, max: 20 },
  { name: "delay", off: 0x13e, kind: "s8", min: -20, max: 20 },
  { name: "groove", off: 0x148, kind: "u8", min: 0, max: 8, partial: "8 = CV in" },
  { name: "scale", off: 0x40, kind: "u8", options: names(["chromatic", "major", "minor", "penta", "hira", "iwato", "tetra", "custom"]) },
  { name: "root", off: 0x13f, kind: "u8", options: names(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]) },
  { name: "channels", off: 0xe4, kind: "mask" },
];
export const field = (name: string): FieldDef => {
  const f = FIELDS.find((x) => x.name === name);
  if (!f) throw new Error(`unknown field ${name}`);
  return f;
};

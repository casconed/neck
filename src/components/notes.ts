// Text <-> note numbers for the notes field. T-1 convention: 60 = C3 (so C-2 = 0).
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS: Record<string, string> = { DB: "C#", EB: "D#", GB: "F#", AB: "G#", BB: "A#" };

export const noteName = (n: number): string => NAMES[n % 12] + (Math.floor(n / 12) - 2);

/** One note: a MIDI number (0-127) or a name like C3, d#4, Eb2, C-1. Undefined if invalid. */
export const parseNote = (t: string): number | undefined => {
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n <= 127 ? n : undefined;
  }
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(t);
  if (!m) return undefined;
  const raw = (m[1] + m[2]).toUpperCase(), name = FLATS[raw] ?? raw;
  const pc = NAMES.indexOf(name);
  const n = pc < 0 ? undefined : (Number(m[3]) + 2) * 12 + pc;
  return n !== undefined && n >= 0 && n <= 127 ? n : undefined;
};

/** "60, 64 G3" -> [60, 64, 67]. Returns an error message instead when the text isn't valid. */
export const parseNotes = (text: string): number[] | string => {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 8) return "enter 1 to 8 notes";
  const notes = parts.map(parseNote);
  const bad = parts.find((_, i) => notes[i] === undefined);
  return bad === undefined ? (notes as number[]) : `"${bad}" isn't a note (use 0-127 or a name like C3, F#4)`;
};

// Pure, structural edits on a parsed bank/autosave. Every function returns a new Project.
import { FormatError } from "./bytes";
import type { Pattern, Project, Track } from "./container";
import { layout } from "./track";

export const patternsOf = (p: Project): Pattern[] => (p.kind === "bank" ? p.patterns : [p.pattern]);
const withPatterns = (p: Project, pats: Pattern[]): Project =>
  p.kind === "bank" ? { ...p, patterns: pats } : { ...p, pattern: pats[0] };

const lastBlock = (p: Project): Track | undefined => patternsOf(p).at(-1)?.tracks.at(-1);

/**
 * The bank's final block may use "Form X", whose tail byte must equal the last pattern's track
 * count - 1 (plus a pad on multi-pattern banks); getting it wrong makes the device reject the
 * whole bank. Rather than rewrite that, refuse structural edits that change the end of the bank
 * when a Form X block is involved.
 */
const guardFinal = (before: Project, after: Project): Project => {
  const a = lastBlock(before), b = lastBlock(after);
  const sameEnd = a === b && patternsOf(before).at(-1)!.tracks.length === patternsOf(after).at(-1)!.tracks.length;
  if (!sameEnd && [a, b].some((t) => t && layout(t.body).formX))
    throw new FormatError("this edit changes the end of a bank whose last track uses a locked-block form the editor can't safely rewrite yet");
  return after;
};

const replaceAt = <T>(xs: T[], i: number, x: T): T[] => xs.map((y, j) => (j === i ? x : y));

// ---- tracks --------------------------------------------------------------------------------

export const updateTrack = (proj: Project, pi: number, ti: number, f: (t: Track) => Track): Project => {
  const pats = patternsOf(proj), pat = pats[pi];
  return withPatterns(proj, replaceAt(pats, pi, { ...pat, tracks: replaceAt(pat.tracks, ti, f(pat.tracks[ti])) }));
};

export const updateBody = (proj: Project, pi: number, ti: number, f: (b: Track["body"]) => Track["body"]): Project =>
  updateTrack(proj, pi, ti, (t) => ({ ...t, body: f(t.body) }));

/** Copy a track into `toSlot` (1-16) of pattern `toPi`, replacing what's there or inserting in slot order. */
export const copyTrack = (proj: Project, pi: number, ti: number, toPi: number, toSlot: number): Project => {
  if (!Number.isInteger(toSlot) || toSlot < 1 || toSlot > 16) throw new FormatError("track slot must be 1-16");
  const pats = patternsOf(proj), src = pats[pi].tracks[ti], dst = pats[toPi];
  const copy: Track = { ...src, slot: toSlot, body: src.body.slice() };
  const tracks = dst.tracks.some((t) => t.slot === toSlot)
    ? dst.tracks.map((t) => (t.slot === toSlot ? copy : t))
    : [...dst.tracks, copy].sort((a, b) => a.slot - b.slot);
  return guardFinal(proj, withPatterns(proj, replaceAt(pats, toPi, { ...dst, tracks })));
};

export const removeTrack = (proj: Project, pi: number, ti: number): Project => {
  const pats = patternsOf(proj), pat = pats[pi];
  if (pat.tracks.length === 1) throw new FormatError("a pattern needs at least one track (remove the pattern instead)");
  return guardFinal(proj, withPatterns(proj, replaceAt(pats, pi, { ...pat, tracks: pat.tracks.filter((_, j) => j !== ti) })));
};

// ---- patterns (banks only) -----------------------------------------------------------------

const bankOnly = (proj: Project): Extract<Project, { kind: "bank" }> => {
  if (proj.kind !== "bank") throw new FormatError("an autosave holds a single pattern; open a bank to edit patterns");
  return proj;
};

/** Put a copy of `pattern` (from this or any other file, e.g. an autosave) into slot `toSlot` (0-15). */
export const putPattern = (proj: Project, pattern: Pattern, toSlot: number): Project => {
  const bank = bankOnly(proj);
  if (!Number.isInteger(toSlot) || toSlot < 0 || toSlot > 15) throw new FormatError("pattern must be 1-16");
  const copy: Pattern = { ...pattern, slot: toSlot, tracks: pattern.tracks.map((t) => ({ ...t, body: t.body.slice() })) };
  const patterns = bank.patterns.some((p) => p.slot === toSlot)
    ? bank.patterns.map((p) => (p.slot === toSlot ? copy : p))
    : [...bank.patterns, copy].sort((a, b) => a.slot - b.slot);
  return guardFinal(proj, { ...bank, patterns });
};

export const copyPattern = (proj: Project, pi: number, toSlot: number): Project =>
  putPattern(proj, bankOnly(proj).patterns[pi], toSlot);

/**
 * Wrap an autosave's pattern in a one-pattern bank. Bank summary: 2.1.5 writes tempo + 9 zero
 * bytes; 2.1.4 writes tempo 00 00 00 cur cur 01 00 00 00 cur (cur = selected pattern slot).
 */
export const autosaveToBank = (proj: Project, slot: number, bpm = 120): Project => {
  if (proj.kind !== "autosave") throw new FormatError("not an autosave");
  const summary = proj.version <= "2.1.4"
    ? Uint8Array.of(bpm & 255, bpm >> 8, 0, 0, 0, slot, slot, 1, 0, 0, 0, slot)
    : Uint8Array.of(bpm & 255, bpm >> 8, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  return setTempo({ kind: "bank", version: proj.version, patterns: [{ ...proj.pattern, slot }], summary }, bpm);
};

export const removePattern = (proj: Project, pi: number): Project => {
  const bank = bankOnly(proj);
  if (bank.patterns.length === 1) throw new FormatError("a bank needs at least one pattern");
  return guardFinal(proj, { ...bank, patterns: bank.patterns.filter((_, j) => j !== pi) });
};

// ---- bank-wide -----------------------------------------------------------------------------

export const setTempo = (proj: Project, bpm: number): Project => {
  const bank = bankOnly(proj);
  if (!Number.isInteger(bpm) || bpm < 24 || bpm > 280) throw new FormatError("tempo must be 24-280 BPM");
  const summary = bank.summary.slice();
  summary[0] = bpm & 255; summary[1] = bpm >> 8;
  return { ...bank, summary };
};

// Bank (`N.t1`, from a Config-app backup) and autosave (current pattern only) containers.
//
//   bank:     05 "2.1.x" [pattern count] { [pattern slot][track count] TRACKS [trailer] }* SUMMARY "os|t"
//   autosave: 05 "2.1.x" [track count] TRACKS [trailer] "os|t"
//   TRACKS:   { [track slot-1][mute] BODY }*  [sentinel][tail]
//
// The two bytes after each body are physically the last two bytes of that block on disk (its
// end-marker = next slot-1, then the next track's mute); the last block's are the pattern's
// selection-count sentinel and a tail byte. Modelling them as links between bodies is what makes
// copy/insert/remove possible. Undecoded regions (trailers, summary) are carried as raw bytes, so
// parse -> serialize is byte-identical.
import { Bytes, FormatError, concat, equal, expect } from "./bytes";
import { TAG } from "./layout";
import { layoutAt } from "./track";

export interface Track { slot: number; mute: number; body: Bytes }          // slot 1..16
export interface Pattern { slot: number; tracks: Track[]; sentinel: number; tail: number; trailer: Bytes } // slot 0..15
export type Project =
  | { kind: "bank"; version: string; patterns: Pattern[]; summary: Bytes }
  | { kind: "autosave"; version: string; pattern: Pattern };

const ascii = (b: Bytes) => String.fromCharCode(...b);
const summaryLength = (version: string) => (version <= "2.1.4" ? 12 : 11); // 2.1.5 dropped a byte

/** Walk `count` linked tracks starting at the [slot-1][mute] pair at `p`. */
const readTracks = (d: Bytes, p: number, count: number) => {
  const tracks: Track[] = [];
  let slot = d[p] + 1, mute = d[p + 1], start = p + 2, end = start;
  for (let k = 0; k < count; k++) {
    end = layoutAt(d, start).end;
    tracks.push({ slot, mute, body: d.slice(start, end - 2) });
    slot = d[end - 2] + 1; mute = d[end - 1]; start = end;
  }
  return { tracks, sentinel: d[end - 2], tail: d[end - 1], end };
};

const isBlockAt = (d: Bytes, o: number): boolean => { try { layoutAt(d, o); return true; } catch { return false; } };

/**
 * The trailer between patterns is variable-length and not fully decoded, so find the next
 * pattern header ([slot 0-15][track count 1-16][track slot-1][mute]) by the first offset where a
 * complete, terminator-checked block parse succeeds.
 */
const nextPatternHeader = (d: Bytes, from: number, limit: number): number => {
  for (let q = from; q + 4 < limit; q++)
    if (d[q] < 16 && d[q + 1] >= 1 && d[q + 1] <= 16 && d[q + 2] < 16 && isBlockAt(d, q + 4)) return q;
  throw new FormatError(`no pattern header after ${from}`);
};

const parseBank = (d: Bytes, version: string): Project => {
  const summaryStart = d.length - 4 - summaryLength(version);
  const n = d[6];
  if (n === 0) {
    expect(summaryStart === 7, "empty bank with unexpected length");
    return { kind: "bank", version, patterns: [], summary: d.slice(7, d.length - 4) };
  }
  expect(n <= 16, `bad pattern count ${n}`);
  const patterns: Pattern[] = [];
  let p = 7;
  for (let i = 0; i < n; i++) {
    const slot = d[p], tc = d[p + 1];
    expect(slot < 16 && tc >= 1 && tc <= 16, `bad pattern header at ${p}`);
    const t = readTracks(d, p + 2, tc);
    p = i < n - 1 ? nextPatternHeader(d, t.end, summaryStart) : summaryStart;
    expect(p >= t.end, "pattern runs into the bank summary");
    patterns.push({ slot, tracks: t.tracks, sentinel: t.sentinel, tail: t.tail, trailer: d.slice(t.end, p) });
  }
  return { kind: "bank", version, patterns, summary: d.slice(summaryStart, d.length - 4) };
};

const parseAutosave = (d: Bytes, version: string): Project => {
  const tc = d[6];
  expect(tc >= 1 && tc <= 16, `bad track count ${tc}`);
  const t = readTracks(d, 7, tc);
  expect(t.end <= d.length - 4, "pattern runs past the end");
  return { kind: "autosave", version, pattern: { slot: -1, tracks: t.tracks, sentinel: t.sentinel, tail: t.tail, trailer: d.slice(t.end, d.length - 4) } };
};

/** Parse a bank or an autosave. Which one is decided by which complete, validated parse succeeds. */
export const parse = (d: Bytes): Project => {
  expect(d.length >= 11 && d[0] === 5 && equal(d.subarray(d.length - 4), TAG), "not a T-1 file (bad header or missing os|t tag)");
  const version = ascii(d.subarray(1, 6));
  expect(version.startsWith("2."), `unsupported firmware ${version}`);
  try { return parseBank(d, version); }
  catch (bankErr) {
    try { return parseAutosave(d, version); }
    catch { throw bankErr; }
  }
};

const tracksBytes = (p: Pattern): Bytes[] =>
  [...p.tracks.flatMap((t) => [Uint8Array.of(t.slot - 1, t.mute), t.body]), Uint8Array.of(p.sentinel, p.tail), p.trailer];

export const serialize = (proj: Project): Bytes => {
  const head = concat([5], Array.from(proj.version, (c) => c.charCodeAt(0)));
  if (proj.kind === "autosave") return concat(head, [proj.pattern.tracks.length], ...tracksBytes(proj.pattern), TAG);
  return concat(head, [proj.patterns.length],
    ...proj.patterns.flatMap((p) => [Uint8Array.of(p.slot, p.tracks.length), ...tracksBytes(p)]),
    proj.summary, TAG);
};

/** Tempo lives in the bank summary (u16 LE BPM). Autosaves keep it in a separate file. */
export const tempo = (proj: Project): number | undefined =>
  proj.kind === "bank" ? proj.summary[0] | (proj.summary[1] << 8) : undefined;

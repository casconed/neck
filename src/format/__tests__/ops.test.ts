/// <reference types="node" />
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIELDS, Project, addCycleRecord, autosaveToBank, euclid, field, plays, putPattern, setField, stepBytes, bankSlot, copyPattern, copyTrack, cycleParams, layout, parse, patternsOf,
  readField, readZip, removeCycleRecord, removePattern, removeTrack, serialize, setNotes, setTempo, tempo,
  toggleStep, writeBackup, writeField,
} from "..";

const FIX = join(__dirname, "../../../fixtures");
const MALFORMED = new Set(["hwtest__hwtest.t1"]);
const fixtures = ["upstream", "local"].flatMap((sub) =>
  existsSync(join(FIX, sub))
    ? readdirSync(join(FIX, sub)).filter((f) => !/\.(md|json|zip)$|LICENSE/.test(f) && !MALFORMED.has(f))
        .map((f) => ({ name: `${sub}/${f}`, data: new Uint8Array(readFileSync(join(FIX, sub, f))) }))
    : []);

const reparse = (p: Project) => {
  const bytes = serialize(p);
  const again = parse(bytes);
  expect(Buffer.from(serialize(again)).equals(Buffer.from(bytes))).toBe(true);
  return again;
};
const bodies = (p: Project) => patternsOf(p).flatMap((x) => x.tracks.map((t) => t.body));
const nonEmpty = fixtures.map((f) => ({ ...f, proj: parse(f.data) })).filter((f) => bodies(f.proj).length > 0);

describe.each(nonEmpty)("track edits: $name", ({ proj }) => {
  const all = patternsOf(proj).flatMap((p, pi) => p.tracks.map((t, ti) => ({ pi, ti, body: t.body })));

  it("notes grow and shrink without touching any setting", () => {
    for (const { body } of all) {
      const before = FIELDS.map((f) => readField(body, f));
      for (const notes of [[48, 52, 55, 59, 62, 65, 69, 72], [61]]) {
        const out = setNotes(body, notes);
        expect(layout(out).notes).toEqual(notes);
        expect(FIELDS.map((f) => readField(out, f))).toEqual(before);
        expect(layout(out).records.map((r) => r.idx)).toEqual(layout(body).records.map((r) => r.idx));
      }
    }
  });

  it("every setting writes back what it reads, changing only its own bytes", () => {
    for (const { body } of all.slice(0, 4)) for (const f of FIELDS) {
      const v = readField(body, f), alt = f.options ? f.options[f.options.length - 1][0] : f.kind === "mask" ? 0b101 : (f.max ?? v);
      const out = writeField(body, f, alt);
      expect(readField(out, f)).toBe(alt);
      expect(readField(writeField(out, f, v), f)).toBe(v);
      expect(Buffer.from(writeField(out, f, v)).equals(Buffer.from(body))).toBe(true);
    }
  });

  it("adding then removing a cycle's own steps restores the block exactly", () => {
    for (const { body } of all) {
      const l = layout(body);
      const free = [...Array(16).keys()].find((c) => !l.records.some((r) => r.idx === c) && !cycleParams(body).some((p) => p.cycle === c));
      if (free === undefined) continue;
      const added = addCycleRecord(body, free);
      const al = layout(added);
      expect(al.records.map((r) => r.idx)).toEqual([...l.records.map((r) => r.idx), free].sort((a, b) => b - a));
      expect(Array.from(added.subarray(al.records.find((r) => r.idx === free)!.gate, al.records.find((r) => r.idx === free)!.gate + 64)))
        .toEqual(Array.from(body.subarray(l.gate, l.gate + 64)));
      expect(FIELDS.map((f) => readField(added, f))).toEqual(FIELDS.map((f) => readField(body, f)));
      expect(Buffer.from(removeCycleRecord(added, free)).equals(Buffer.from(body))).toBe(true);
    }
  });

  it("clicking a step flips whether it plays, on the base and on stored cycles", () => {
    for (const { body } of all) for (const c of [-1, ...layout(body).records.map((r) => r.idx)]) {
      const before = stepBytes(body, c)[5], once = toggleStep(body, c, 5), after = stepBytes(once, c)[5];
      expect(plays(after)).toBe(!plays(before));
      expect(after & ~3).toBe(before & ~3);                          // other flag bits untouched
      if (plays(before)) expect(after & 3).toBe(0);                  // off clears generated and manual
      else expect(after & 3).toBe(1);                                // on = a manual pulse
      expect(plays(stepBytes(toggleStep(once, c, 5), c)[5])).toBe(plays(before));
    }
  });

  it("changing pulses, rotate or steps redraws the generated pulses and keeps manual ones", () => {
    for (const { body } of all.slice(0, 6)) {
      const out = setField(setField(setField(body, field("steps"), 12), field("pulses"), 5), field("rotate"), 2);
      const l = layout(out), want = euclid(5, 12, 2);
      want.forEach((on, i) => expect(!!(out[l.gate + i] & 2), `step ${i + 1}`).toBe(on));
      const lb = layout(body);
      for (let i = 0; i < 64; i++) expect(out[l.gate + i] & 1).toBe(body[lb.gate + i] & 1);
    }
  });

  it("track edits survive serialize -> parse", () => {
    const { pi, ti } = all[all.length - 1];
    const p = patternsOf(proj)[pi], t = p.tracks[ti];
    const free = [...Array(16).keys()].reverse().find((c) => !layout(t.body).records.some((r) => r.idx === c))!;
    const edited = { ...t, body: setNotes(addCycleRecord(t.body, free), [60, 64, 67]) };
    const pats = patternsOf(proj).map((x, i) => (i === pi ? { ...x, tracks: x.tracks.map((y, j) => (j === ti ? edited : y)) } : x));
    const out = reparse(proj.kind === "bank" ? { ...proj, patterns: pats } : { ...proj, pattern: pats[0] });
    expect(layout(patternsOf(out)[pi].tracks[ti].body).notes).toEqual([60, 64, 67]);
  });
});

const banks = nonEmpty.filter((f) => f.proj.kind === "bank" && patternsOf(f.proj).length >= 2);
const formXEnd = (p: Project) => layout(patternsOf(p).at(-1)!.tracks.at(-1)!.body).formX;

describe.each(banks.filter((b) => !formXEnd(b.proj)))("pattern edits: $name", ({ proj }) => {
  const pats = patternsOf(proj), free = [...Array(16).keys()].find((s) => !pats.some((p) => p.slot === s))!;

  it("copy a pattern to a free slot", () => {
    const out = reparse(copyPattern(proj, 0, free));
    const ps = patternsOf(out);
    expect(ps.length).toBe(pats.length + 1);
    expect(ps.map((p) => p.slot)).toEqual([...pats.map((p) => p.slot), free].sort((a, b) => a - b));
    const copy = ps.find((p) => p.slot === free)!;
    expect(copy.tracks.map((t) => Buffer.from(t.body))).toEqual(pats[0].tracks.map((t) => Buffer.from(t.body)));
  });

  it("remove the first and the last pattern", () => {
    for (const pi of [0, pats.length - 1]) {
      const out = reparse(removePattern(proj, pi));
      expect(patternsOf(out).map((p) => p.slot)).toEqual(pats.filter((_, j) => j !== pi).map((p) => p.slot));
    }
  });

  it("copy a track into another pattern, then remove it", () => {
    const dst = pats[1], slot = [...Array(16).keys()].map((s) => s + 1).find((s) => !dst.tracks.some((t) => t.slot === s));
    if (slot === undefined) return;
    const out = reparse(copyTrack(proj, 0, 0, 1, slot));
    const tracks = patternsOf(out)[1].tracks;
    expect(tracks.map((t) => t.slot)).toEqual([...dst.tracks.map((t) => t.slot), slot].sort((a, b) => a - b));
    const ti = tracks.findIndex((t) => t.slot === slot);
    expect(Buffer.from(tracks[ti].body).equals(Buffer.from(pats[0].tracks[0].body))).toBe(true);
    expect(Buffer.from(serialize(reparse(removeTrack(out, 1, ti)))).equals(Buffer.from(serialize(proj)))).toBe(true);
  });

  it("tempo", () => {
    expect(tempo(reparse(setTempo(proj, 99)))).toBe(99);
  });
});

describe.each(banks.filter((b) => formXEnd(b.proj)))("bank ending in a Form X block: $name", ({ proj }) => {
  it("refuses edits that change the end of the bank", () => {
    expect(() => removePattern(proj, patternsOf(proj).length - 1)).toThrow(/locked-block form/);
  });
  it("allows edits elsewhere", () => {
    expect(patternsOf(reparse(removePattern(proj, 0))).length).toBe(patternsOf(proj).length - 1);
  });
});

describe("autosave -> bank", () => {
  // Real autosaves only exist in the gitignored fixtures/local, so CI also gets autosaves built from
  // upstream bank patterns (same track blocks and trailer layout; device autosaves match bank patterns).
  const fromBanks = nonEmpty.filter((f) => f.name.startsWith("upstream/") && f.proj.kind === "bank").slice(0, 5)
    .map((f) => {
      const p = patternsOf(f.proj)[0];
      return { name: `${f.name} pattern ${p.slot + 1} as an autosave`, proj: reparse({ kind: "autosave", version: f.proj.version, pattern: { ...p, slot: -1 } }) };
    });
  const autosaves = [...nonEmpty.filter((f) => f.proj.kind === "autosave"), ...fromBanks];
  it("has autosaves to test", () => expect(fromBanks.length).toBeGreaterThan(0));
  it.each(autosaves)("$name becomes a valid one-pattern bank, and can be put into another bank", ({ proj }) => {
    const bank = reparse(autosaveToBank(proj, 4, 99));
    expect(bank.kind).toBe("bank");
    expect(tempo(bank)).toBe(99);
    expect(patternsOf(bank).map((p) => p.slot)).toEqual([4]);
    expect(bodies(bank).map((b) => Buffer.from(b))).toEqual(bodies(proj).map((b) => Buffer.from(b)));
    const target = banks.find((b) => !formXEnd(b.proj));
    if (target) {
      const merged = reparse(putPattern(target.proj, patternsOf(proj)[0], 15));
      expect(patternsOf(merged).at(-1)!.slot).toBe(15);
    }
  });
});

describe("backup zip", () => {
  const bank = new Uint8Array([5, 50, 46, 49, 46, 53, 0, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x6f, 0x73, 0x7c, 0x74]);
  it("fresh: ./ plus only the given banks", () => {
    const z = readZip(writeBackup(new Map([[2, bank]])));
    expect(Object.keys(z)).toEqual(["./", "./2.t1"]);
    expect(Buffer.from(z["./2.t1"]).equals(Buffer.from(bank))).toBe(true);
  });
  it("based on a loaded backup: same entries and order, only the edited bank replaced", () => {
    const base = { "./": new Uint8Array(0), "./0.t1": Uint8Array.of(1), "./1.t1": Uint8Array.of(2), "./Settings.json": Uint8Array.of(123, 125) };
    const z = readZip(writeBackup(new Map([[1, bank]]), base));
    expect(Object.keys(z)).toEqual(Object.keys(base));
    expect(Array.from(z["./0.t1"])).toEqual([1]);
    expect(Buffer.from(z["./1.t1"]).equals(Buffer.from(bank))).toBe(true);
    expect(bankSlot("./7.t1")).toBe(7);
    expect(bankSlot("./Settings.json")).toBeUndefined();
  });
});

const REAL_BACKUP = join(FIX, "local/project.zip");
describe.runIf(existsSync(REAL_BACKUP))("real Config-app backup", () => {
  it("editing one bank keeps every other entry and the zip layout identical", () => {
    const base = readZip(new Uint8Array(readFileSync(REAL_BACKUP)));
    const out = readZip(writeBackup(new Map([[1, serialize(setTempo(parse(base["./1.t1"]), 99))]]), base));
    expect(Object.keys(out)).toEqual(Object.keys(base));
    for (const n of Object.keys(base)) if (n !== "./1.t1") expect(Buffer.from(out[n]).equals(Buffer.from(base[n])), n).toBe(true);
    expect(tempo(parse(out["./1.t1"]))).toBe(99);
  });
});

describe("the T-1's pulse generator", () => {
  // Every upstream sample track without per-cycle data: the stored generated bits must equal
  // euclid(pulses, steps, rotate). Captures from a device can deviate where steps were edited by hand:
  // removing a generated pulse on the T-1 clears its bit and lowers the pulse count without redrawing
  // the rest (seen in local/autosave-a, tracks 12 and 14), so those aren't part of this check.
  const tracks = nonEmpty.filter((f) => f.name.startsWith("upstream/"))
    .flatMap((f) => patternsOf(f.proj).flatMap((p) => p.tracks.map((t) => ({ name: f.name, body: t.body }))))
    .filter(({ body }) => !layout(body).records.length && !cycleParams(body).length);
  it(`matches the stored pattern on all ${tracks.length} tracks without cycle data`, () => {
    const misses = tracks.filter(({ body }) => {
      const l = layout(body), n = readField(body, field("steps"));
      const want = euclid(readField(body, field("pulses")), n, readField(body, field("rotate")));
      return want.some((on, i) => !!(body[l.gate + i] & 2) !== on);
    });
    expect(misses.map((m) => m.name)).toEqual([]);
    expect(tracks.length).toBeGreaterThan(900);
  });
});

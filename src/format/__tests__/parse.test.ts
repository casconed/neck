/// <reference types="node" />
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse, serialize, tempo } from "../container";
import { layout, readField } from "../track";
import { field } from "../layout";

const FIX = join(__dirname, "../../../fixtures");
const files = (sub: string) =>
  existsSync(join(FIX, sub)) ? readdirSync(join(FIX, sub)).filter((f) => !/\.(md|json|zip)$|LICENSE/.test(f)).map((f) => ({ sub, f })) : [];
const all = [...files("upstream"), ...files("local")];
const load = (sub: string, f: string) => new Uint8Array(readFileSync(join(FIX, sub, f)));
const expected = (sub: string, f: string) => {
  const p = join(FIX, "expected", `${sub}__${f}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined;
};

// Fixtures where the reference parser itself is wrong or the file is known-bad.
const MALFORMED: Record<string, string> = {
  "hwtest__hwtest.t1": "upstream's own broken early import (19-byte lock pad); the device mis-rendered it",
};
const ORACLE_MISSES_BLOCKS: Record<string, string> = {
  "decode__samples__22_groove_tonal__22_groove_tonal.t1": "custom scales: upstream's 00..0b landmark skips them",
  "decode__samples__23_modes_routing_global__23_modes_routing_global.t1": "blocks whose leading u16 isn't 0c 00",
};

describe.each(all)("$sub/$f", ({ sub, f }) => {
  const data = load(sub, f);

  if (MALFORMED[f]) {
    it(`is rejected (${MALFORMED[f]})`, () => expect(() => parse(data)).toThrow());
    return;
  }

  it("round-trips byte for byte", () => {
    expect(Buffer.from(serialize(parse(data))).equals(Buffer.from(data))).toBe(true);
  });

  const exp = expected(sub, f);
  it.runIf(exp && ORACLE_MISSES_BLOCKS[f])("finds every block the reference parser finds (and more)", () => {
    const proj = parse(data);
    const bodies = (proj.kind === "bank" ? proj.patterns : [proj.pattern]).flatMap((p) => p.tracks.map((t) => Buffer.from(t.body)));
    expect(bodies.length).toBeGreaterThan(exp.tracks.length);
    for (const e of exp.tracks) {
      const want = Buffer.from(data.subarray(e.blockStart, e.blockEnd - 2));
      // upstream starts some of these blocks 2 bytes late (it scans for a `0c 00` that isn't there)
      expect(bodies.some((b) => b.subarray(b.length - want.length).equals(want)), `block at ${e.blockStart}`).toBe(true);
    }
  });

  it.runIf(exp && !ORACLE_MISSES_BLOCKS[f])("matches the reference parser", () => {
    const proj = parse(data);
    const pats = proj.kind === "bank" ? proj.patterns : [proj.pattern];
    const tracks = pats.flatMap((p) => p.tracks);
    expect(tracks.length).toBe(exp.tracks.length);
    tracks.forEach((t, i) => {
      const e = exp.tracks[i], l = layout(t.body);
      // upstream counts a "Form X" summary block one byte short (it models that byte as a bank-final pad)
      expect(t.body.length + 2 - (l.formX ? 1 : 0), `track ${i} block length`).toBe(e.blockEnd - e.blockStart);
      expect(l.steps, `track ${i} steps offset`).toBe(e.steps - e.blockStart);
      expect(l.notes).toEqual(e.notes);
      expect(t.mute).toBe(e.mute);
      expect(l.records.length).toBe(e.editedCycles);
      expect(readField(t.body, field("cycles"))).toBe(e.cycleCount);
      expect(readField(t.body, field("velocity"))).toBe(e.velocity);
      expect(readField(t.body, field("division"))).toBe(e.division);
      expect(readField(t.body, field("channels"))).toBe(e.midiMask);
      expect(Array.from(t.body.subarray(l.gate, l.gate + 64))).toEqual(e.gate);
    });
    if (exp.patterns) {
      expect(proj.kind).toBe("bank");
      expect(pats.map((p) => p.tracks.map((t) => t.slot))).toEqual(exp.patterns);
      expect(tempo(proj)).toBe(exp.tempo);
    }
  });
});

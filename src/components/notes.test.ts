import { describe, expect, it } from "vitest";
import { noteName, parseNotes } from "./notes";

describe("notes field", () => {
  it("accepts numbers separated by commas, spaces or both", () => {
    expect(parseNotes("60,64,67")).toEqual([60, 64, 67]);
    expect(parseNotes("60 64 67")).toEqual([60, 64, 67]);
    expect(parseNotes(" 60, 64  67 ")).toEqual([60, 64, 67]);
  });
  it("accepts note names with the T-1's numbering (60 = C3), including flats and lowercase", () => {
    expect(parseNotes("C3 E3 G3")).toEqual([60, 64, 67]);
    expect(parseNotes("c#3,Eb3,bb2")).toEqual([61, 63, 58]);
    expect(parseNotes("C-2 G8")).toEqual([0, 127]);
  });
  it("explains what's wrong instead of failing silently", () => {
    expect(parseNotes("60 128")).toMatch(/"128" isn't a note/);
    expect(parseNotes("H3")).toMatch(/isn't a note/);
    expect(parseNotes("")).toMatch(/1 to 8/);
    expect(parseNotes("1 2 3 4 5 6 7 8 9")).toMatch(/1 to 8/);
  });
  it("names round-trip", () => {
    for (let n = 0; n <= 127; n++) expect(parseNotes(noteName(n))).toEqual([n]);
  });
});

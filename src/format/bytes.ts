// Small pure helpers over Uint8Array. Nothing here knows about the T-1.

export type Bytes = Uint8Array;

export const u16 = (b: Bytes, o: number): number => b[o] | (b[o + 1] << 8);
export const u32 = (b: Bytes, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
export const s8 = (v: number): number => (v << 24) >> 24;

export const concat = (...parts: ArrayLike<number>[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

export const u32le = (v: number): Bytes => Uint8Array.of(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);

/** Copy of `b` with bytes [start, start+del) replaced by `ins`. */
export const splice = (b: Bytes, start: number, del: number, ins: ArrayLike<number> = []): Bytes =>
  concat(b.subarray(0, start), ins, b.subarray(start + del));

/** Copy of `b` with single bytes overwritten. */
export const patch = (b: Bytes, writes: Record<number, number>): Bytes => {
  const out = b.slice();
  for (const [o, v] of Object.entries(writes)) out[Number(o)] = v & 255;
  return out;
};

export const equal = (a: Bytes, b: Bytes): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

export const startsWithAt = (b: Bytes, o: number, sig: ArrayLike<number>): boolean => {
  for (let i = 0; i < sig.length; i++) if (b[o + i] !== sig[i]) return false;
  return true;
};

export class FormatError extends Error {}
export const expect = (cond: unknown, msg: string): void => { if (!cond) throw new FormatError(msg); };

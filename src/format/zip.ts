// Backup zips, in the layout the T-1 restores (per t1-backup-file-format's write_backup_zip):
// every entry STORED (uncompressed), names prefixed "./", a "./" directory entry first.
import { unzipSync, zipSync, type Zippable } from "fflate";
import type { Bytes } from "./bytes";

export const readZip = (b: Bytes): Record<string, Bytes> => unzipSync(b);

/** "./3.t1" or "3.t1" -> 3 */
export const bankSlot = (name: string): number | undefined => {
  const m = /^(?:\.\/)?([0-7])\.t1$/.exec(name);
  return m ? Number(m[1]) : undefined;
};

const MTIME = new Date(1980, 0, 1);
// Same external attributes the Config app writes in its own backups (checked against a real export).
const DIR = 0x10, FILE = 0;

/**
 * Build a restorable backup.
 * - With `base` (a backup the user loaded): every entry is kept in its original order and bytes,
 *   only the given banks are replaced. Restoring it overwrites all 8 banks with what's inside.
 * - Without: a fresh zip holding only the given banks. Restoring it touches only those banks.
 */
export const writeBackup = (banks: Map<number, Bytes>, base?: Record<string, Bytes>): Bytes => {
  const files: Zippable = { "./": [new Uint8Array(0), { level: 0, mtime: MTIME, attrs: DIR, os: 0 }] };
  const names = base ? Object.keys(base).filter((n) => n !== "./") : [];
  for (const slot of banks.keys()) if (!names.some((n) => bankSlot(n) === slot)) names.push(`./${slot}.t1`);
  for (const name of names) {
    const slot = bankSlot(name);
    const data = slot !== undefined && banks.has(slot) ? banks.get(slot)! : base![name];
    files[name] = [data, { level: 0, mtime: MTIME, attrs: name.endsWith("/") ? DIR : FILE, os: 0 }]; // e.g. "./autosave/"
  }
  return zipSync(files);
};

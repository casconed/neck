// Getting files in and out of the browser, and turning them into editable documents.
import { Bytes, Project, bankSlot, parse, readZip } from "./format";

export interface Picked { name: string; bytes: Bytes }

/** Opens the OS file chooser; resolves undefined if the user cancels. */
export const pickFile = (): Promise<Picked | undefined> =>
  new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file" });
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : undefined);
    };
    input.oncancel = () => resolve(undefined);
    input.click();
  });

export const download = (name: string, bytes: Bytes): void => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  // Chrome doesn't reliably download from a detached link, so attach it for the click. Revoke
  // late: a "Save as" prompt can still be reading the blob after the click returns.
  const a = Object.assign(document.createElement("a"), { href: url, download: name, rel: "noopener" });
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/** What the user opened: a whole backup zip (several banks), or a single bank/autosave file. */
export type Source =
  | { kind: "zip"; name: string; entries: Record<string, Bytes> }
  | { kind: "file"; name: string };

export interface Doc {
  source: Source;
  projects: Record<number, Project>; // by bank slot 0-7 (a single file gets the slot it restores into)
  edited: number[];                  // bank slots changed since opening
  current: number;
}

const isZip = (b: Bytes) => b[0] === 0x50 && b[1] === 0x4b; // "PK"

export const openFile = ({ name, bytes }: Picked): Doc => {
  if (isZip(bytes)) {
    const entries = readZip(bytes), projects: Record<number, Project> = {};
    for (const [n, data] of Object.entries(entries)) {
      const slot = bankSlot(n);
      if (slot !== undefined) projects[slot] = parse(data);
    }
    const slots = Object.keys(projects).map(Number).sort();
    if (!slots.length) throw new Error(`${name} has no bank files (N.t1) in it`);
    const firstUsed = slots.find((k) => projects[k].kind === "bank" && (projects[k] as { patterns: unknown[] }).patterns.length) ?? slots[0];
    return { source: { kind: "zip", name, entries }, projects, edited: [], current: firstUsed };
  }
  const slot = bankSlot(name) ?? 0;
  return { source: { kind: "file", name }, projects: { [slot]: parse(bytes) }, edited: [], current: slot };
};

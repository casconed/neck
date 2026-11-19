import { useCallback, useMemo, useState } from "react";
import {
  Project, autosaveToBank, copyPattern, parse, patternsOf, putPattern, removePattern, serialize, setTempo, tempo, writeBackup,
} from "../format";
import { download, openFile, pickFile, type Doc } from "../files";
import { Button, DraftInput, Labeled, Select, intIn } from "./controls";
import { TrackCard } from "./TrackCard";

const HISTORY = 50;

export function App() {
  const [doc, setDoc] = useState<Doc>();
  const [past, setPast] = useState<Doc[]>([]);
  const [error, setError] = useState<string>();
  const [pi, setPi] = useState(0);
  const [patternSlot, setPatternSlot] = useState(0); // for autosave -> bank, and pattern copies

  const open = async () => {
    try {
      const f = await pickFile();
      if (!f) return;
      setDoc(openFile(f)); setPast([]); setPi(0); setError(undefined);
    } catch (e) { setError(String((e as Error).message ?? e)); }
  };

  /** Apply a pure edit to the current bank. Stable across renders (uses functional state updates). */
  const apply = useCallback((fn: (p: Project) => Project) => {
    setDoc((d) => {
      if (!d) return d;
      try {
        const next = fn(d.projects[d.current]);
        parse(serialize(next)); // never keep an edit that doesn't re-parse
        setPast((ps) => [...ps.slice(-HISTORY + 1), d]);
        setError(undefined);
        return { ...d, projects: { ...d.projects, [d.current]: next }, edited: [...new Set([...d.edited, d.current])] };
      } catch (e) { setError(String((e as Error).message ?? e)); return d; }
    });
  }, []);

  const undo = () => { const prev = past.at(-1); if (prev) { setDoc(prev); setPast(past.slice(0, -1)); } };

  const proj = doc?.projects[doc.current];
  const pats = useMemo(() => (proj ? patternsOf(proj) : []), [proj]);
  const pat = pats[Math.min(pi, pats.length - 1)];
  const patternOptions = useMemo(
    () => pats.map((p, i) => ({ index: i, label: proj?.kind === "bank" ? `pattern ${p.slot + 1}` : "current" })),
    [pats, proj?.kind]);

  const save = () => {
    if (!doc || !proj) return;
    const bank = proj.kind === "autosave" ? autosaveToBank(proj, patternSlot) : proj;
    const banks = new Map(doc.source.kind === "zip"
      ? doc.edited.map((k) => [k, serialize(doc.projects[k])] as const)
      : [[doc.current, serialize(bank)] as const]);
    const base = doc.source.kind === "zip" ? doc.source.entries : undefined;
    download(doc.source.kind === "zip" ? doc.source.name.replace(/\.zip$/i, "") + "-neck.zip" : `bank${doc.current + 1}-neck.zip`, writeBackup(banks, base));
  };

  const importPattern = async () => {
    try {
      const f = await pickFile();
      if (!f) return;
      const other = parse(f.bytes);
      apply((p) => putPattern(p, patternsOf(other)[0], patternSlot));
    } catch (e) { setError(String((e as Error).message ?? e)); }
  };

  return (<>
    <h1>neck: Torso T-1 bank editor</h1>
    <p className="dim">
      Open a backup .zip from the T-1 Config app, a bank (N.t1) or an autosave file. Downloads are backup zips to restore with the
      Config app. Keep your original backup: this format is reverse-engineered and unofficial.
    </p>
    <div className="row">
      <Button label="open file…" onPress={open} />
      {doc && <Button label="undo" onPress={undo} disabled={!past.length} />}
      {doc && <Button label="download backup zip" onPress={save} disabled={!doc.edited.length && doc.source.kind === "zip"} />}
    </div>
    {error && <p className="error">{error}</p>}

    {doc && proj && <>
      <div className="row">
        <span className="dim">{doc.source.name}</span>
        <span className="dim">{proj.kind === "bank" ? "bank" : "autosave (current pattern only)"}, firmware {proj.version}</span>
        {doc.source.kind === "zip" && <Labeled label="bank">
          <Select label="bank" value={doc.current} onChange={(k) => { setDoc({ ...doc, current: k }); setPi(0); }}
            options={Object.keys(doc.projects).map(Number).map((k) => [k, `${k + 1}${doc.edited.includes(k) ? " (edited)" : ""}${patternsOf(doc.projects[k]).length ? "" : " (empty)"}`])} />
        </Labeled>}
        {doc.source.kind === "file" && <Labeled label="restores into bank" hint="the bank this file replaces when the downloaded zip is restored">
          <Select label="restore bank" value={doc.current} onChange={(k) => setDoc({ ...doc, current: k, projects: { [k]: proj } })}
            options={[...Array(8).keys()].map((k) => [k, String(k + 1)])} />
        </Labeled>}
        {proj.kind === "bank" && <Labeled label="tempo">
          <DraftInput label="tempo" value={tempo(proj)!} format={String} parse={intIn(24, 280)} onCommit={(v) => apply((p) => setTempo(p, v))} />
        </Labeled>}
      </div>
      {doc.source.kind === "zip" && Object.keys(doc.source.entries).some((n) => n.includes("autosave/")) && <p className="partial" style={{ fontSize: 12 }}>
        {`This backup also contains the T-1's autosave: a copy of the pattern that was selected when you exported. If you edit that
        pattern here, it's untested whether restoring brings back your edit or the autosave's older copy. Check it on the device.`}
      </p>}
      {proj.kind === "autosave" && <p className="partial" style={{ fontSize: 12 }}>
        {`The download turns this autosave into a one-pattern bank (pattern ${patternSlot + 1}). Restoring it replaces that whole bank.
        To add it to an existing bank instead, open the bank and use "add pattern from file".`}
      </p>}

      <div className="row">
        {pats.map((p, i) => (
          <Button key={p.slot} label={`${i === pi ? "▸ " : ""}${proj.kind === "bank" ? `pattern ${p.slot + 1}` : "current pattern"}`} onPress={() => setPi(i)} />
        ))}
      </div>
      <div className="row">
        <Labeled label={proj.kind === "bank" ? "pattern slot" : "save as pattern"}>
          <Select label="pattern slot" value={patternSlot} onChange={setPatternSlot} options={[...Array(16).keys()].map((k) => [k, String(k + 1)])} />
        </Labeled>
        {proj.kind === "bank" && pat && <>
          <Button label={`copy pattern ${pat.slot + 1} here`} onPress={() => apply((p) => copyPattern(p, pi, patternSlot))} />
          <Button label="add pattern from file…" onPress={importPattern} />
          <Button label={`remove pattern ${pat.slot + 1}`} danger onPress={() => { apply((p) => removePattern(p, pi)); setPi(0); }} />
        </>}
      </div>

      {pat ? pat.tracks.map((t, ti) => (
        <TrackCard key={`${pat.slot}-${t.slot}`} track={t} pi={pats.indexOf(pat)} ti={ti} patterns={patternOptions} apply={apply} />
      )) : <p className="dim">This bank is empty.</p>}
    </>}
  </>);
}

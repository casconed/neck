#!/usr/bin/env python3
"""Expected-values oracle for the TypeScript parser.

Runs the reference Python parser (https://github.com/pizboese/t1-backup-file-format) over
every fixture and writes fixtures/expected/<name>.json. The TS tests compare against these.

  python3 tools/oracle.py [--repo PATH_TO_t1-backup-file-format]

Needs the repo's fw 2.1.5 bank-summary fix (11-byte summary) for 2.1.5 banks.
"""
import argparse, glob, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def describe(data, F, steps_field_offset):
    runs = F.find_runs(data)
    starts = [F._pitch_count_and_start(data, r)[1] for r in runs]
    his = starts[1:] + [len(data)]
    tracks = []
    for r, hi in zip(runs, his):
        t = F.parse_track(data, r, block_hi=hi)
        so = steps_field_offset(data, r, hi)
        tracks.append({
            "blockStart": t["block_start"], "blockEnd": t["block_end"], "run": r, "steps": so,
            "notes": t["pitches"], "mute": data[t["block_start"] - 1], "cycleCount": t["cycles"],
            "editedCycles": t["num_edited_cycles"], "velocity": t["velocity"], "division": t["division_ticks"],
            "midiMask": t["midi_mask"], "root": t["root"], "scale": t["scale"],
            "gate": t["gate"],
        })
    return tracks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.path.expanduser("~/Develop/t1-backup-file-format"))
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(ROOT, "fixtures", "upstream", "*.t1")) +
                   [p for p in glob.glob(os.path.join(ROOT, "fixtures", "local", "*")) if not p.endswith(".json")])
    out_dir = os.path.join(ROOT, "fixtures", "expected")
    os.makedirs(out_dir, exist_ok=True)
    sys.path[:0] = [a.repo, os.path.join(a.repo, "decode")]  # note: upstream decode/ chdirs on import
    import t1_format as F
    from t1_decode import steps_field_offset
    for path in files:
        data = open(path, "rb").read()
        if not F.find_runs(data):
            continue  # empty bank: nothing to compare
        exp = {"size": len(data), "tracks": describe(data, F, steps_field_offset)}
        if data[11:13] == b"\x0c\x00":  # bank
            bank = F.parse_bank(path)
            exp["tempo"] = bank["tempo"]
            exp["patterns"] = [[t["position"] for t in p] for p in bank["patterns"]]
        sub = "local" if "/fixtures/local/" in path else "upstream"
        with open(os.path.join(out_dir, f"{sub}__{os.path.basename(path)}.json"), "w") as f:
            json.dump(exp, f)
    print(f"wrote expectations for {len(files)} fixtures to {out_dir}")


if __name__ == "__main__":
    main()

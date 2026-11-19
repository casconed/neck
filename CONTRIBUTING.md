# Contributing

Thanks for wanting to help. Issues and pull requests are welcome, including ones that only report
what works or doesn't work on a real T-1.

## Getting set up

```bash
npm ci            # Node 22 or newer
npm run dev       # http://localhost:5173/neck/
npm run typecheck
npm run lint
npm test
```

`npm run build` produces the static site in `dist/`.

## Before opening a PR

- `npm run typecheck`, `npm run lint` and `npm test` all pass.
- If your change touches the format layer (`src/format/`), tests pass over the whole fixture set, and
  you have added a test for what you changed.
- Keep the two layers apart: **`src/format/` must not import React**, and the UI must not read or write
  bytes directly. All byte work goes through a pure function that takes bytes and returns new bytes.
- UI code may depend on the format layer, never the other way round.

## What kinds of changes are most useful

**Test it on hardware.** The format is reverse-engineered. Every claim in the README that says
"untested" is a place where a real device can settle the question. If you can load an edited backup
onto a T-1, reports of what happened (including "the device rejected the bank") are very valuable.
Please say which firmware version you're on.

**Format findings need evidence.** If you decode a field or a flag:

- Capture before and after backups from the device that differ in exactly one thing.
- Add the sample to `fixtures/` (see below) so the claim stays tested.
- Update `src/format/layout.ts` (new field) or `track.ts` / `container.ts` (structure), and note in the
  code comment what the evidence is and whether it's confirmed on hardware or only inferred.
- If the finding also applies to the upstream spec
  ([t1-backup-file-format](https://github.com/pizboese/t1-backup-file-format)), consider sending it there too.

**UI work.** The page is a plain React app. Keep it usable with a mouse and keyboard, use native
controls where possible, and keep text readable at the default zoom.

## Tests

- `npm test` runs vitest over `src/format/__tests__/`. It does not need a browser.
- Fixtures: `fixtures/upstream/` holds the sample banks from the upstream repo (MIT, credited in the
  README). `fixtures/local/` is where files from your own device go; it is gitignored, and the tests
  pick it up automatically when it exists.
- `fixtures/expected/` holds JSON produced by the reference Python parser (`npm run oracle`, which needs
  that repo checked out at `~/Develop/t1-backup-file-format` or passed via `--repo`). If you change the
  parsing, regenerate it and commit any change.
- Known disagreements with the reference parser (custom scales, 2.1.5 bank summary, Form-X blocks) are
  listed in `src/format/__tests__/parse.test.ts`. Add to those lists only when the evidence is clear,
  with a comment explaining it.

### Adding a fixture

1. Copy the `.t1` files into `fixtures/local/` with a descriptive name (for example `bank-cycles.t1`).
2. Run `npm run oracle` if the reference parser can read it; otherwise add tests that assert what you
   verified.
3. Every fixture must round-trip byte-for-byte (parse, serialize, compare). If a fixture must not do
   that, say why in the test.

## Code style

- TypeScript, strict mode. Prefer small pure functions over classes.
- Comments should explain *why*, and for format code also *how it was confirmed* ("device-authored,
  hardware-verified" or "single capture, inferred").
- Deliberate simplifications get a comment naming the limit and the way to lift it.

## Commit messages and pull requests

- One change per commit where practical. A short subject line, then why in the body if it isn't obvious.
- In a PR, say what you tested it on (firmware version, stock or edited backup) and what you couldn't test.

## Not sure?

Open an issue with the backup, what you expected and what happened. Files from the device are the
fastest way to figure out unknown parts of the format.

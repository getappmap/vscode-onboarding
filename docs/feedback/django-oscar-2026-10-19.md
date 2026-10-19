# Field report: onboarding skills v1.0.0 on django-oscar

Date: 2026-10-19. Skills: the v1.0.0 release zip (`onboarding-skills.zip`), run in Claude Code.
Compared against this repo at `f6fe26f` plus the uncommitted work that adds
`skills/shared/manifest-format.md`.

## What was done

1. `onboarding-manifest-writer` drafted `onboarding.yaml` for a django-oscar fork
   (`~/source/land-of-apps/django-oscar_issue2484`, branch `chore/onboarding`).
2. `onboarding-setup` ran it on an Apple Silicon Mac until every entry was ready.

The manifest has 10 entries:

```
mise ─┬─► python ─► venv ─► python-packages ─┐
      │                                      ├─► postgres ─► first-test
      │       podman (macos) / podman-linux ─┘
      └─► node ─► npm-packages
```

Setup needed four runs. Each failure came from a fix, never from a check:

| Run | Failed entry | Cause | What changed |
|---|---|---|---|
| 1 | `python` | mise refused the Python 3.9.18 build: "No GitHub artifact attestations found" | Pinned 3.9.25 in `.tool-versions` |
| 1 | `npm-packages` (prove) | `node-sass` 8 has no `darwin-arm64` binary for any Node version | Removed the unused `node-sass`, pinned Node 20 |
| 2 | `python-packages` | uWSGI linked the x86_64 OpenSSL in `/usr/local/lib` (Intel Homebrew) | Fix sets `LDFLAGS`/`CPPFLAGS` from `brew --prefix openssl@3` |
| 3 | `postgres` (prove) | The container was up, but a Homebrew PostgreSQL 18 also held port 5432, so the tests reached it instead | Moved the container to host port 5433 (`docker-compose.yml`, `.env`) |

## Status of each item

| # | Item | Status in this repo | Where to look |
|---|---|---|---|
| 1 | `sha`/`stale` can't use `.rst` docs | Open, now documented | `src/manifest/sectionSha.ts`, `skills/shared/manifest-format.md` |
| 2 | Writer never hands off to setup | Open | `skills/onboarding-manifest-writer/SKILL.md`, Steps 6–7 |
| 3 | Running the CLI let mise install Node | Open | `skills/*/SKILL.md`, `src/cli/` |
| 4 | `check` ignores `dependsOn` | Partly done | `src/setup/checkEntries.ts` |
| 5 | `prove` can pass against the wrong service | Open | `skills/onboarding-manifest-writer/SKILL.md`, "Keep checks and proofs quick" |
| 6 | "troubleshooter" skill named but not shipped | Fixed in `f6fe26f` | — |
| 7 | CLI is minified and copied into each skill | Open, slightly worse | `esbuild.js`, `skills.build.js` |

Quickest wins: items 2 and 3 are a line or two each in a `SKILL.md`. Item 4 is a code change.

## 1. `sha` and `stale` only read Markdown headings

**What happened.** django-oscar keeps its setup steps in Sphinx docs:
`docs/source/internals/contributing/development-environment.rst`, under an underlined heading
"Setting up the development environment". The writer edited that section, then could not
record a `from:` for it:

```
$ node onboard.mjs sha docs/.../development-environment.rst "Setting up the development environment"
There is no heading "Setting up the development environment" in docs/.../development-environment.rst. Give the heading exactly as written, with its # marks, for example "## Run locally".

$ node onboard.mjs sha docs/.../development-environment.rst
Give the file and the heading, such as: sha README.md "## Run locally"
```

`stale` only compares an entry when `from:` has `file`, `section` and `sha256`. A `from:` with
no `section` is skipped silently, so a whole-file SHA can't work around it either.

**Effect.** The manifest only points to the doc in a comment. Nothing warns when the doc
changes.

**In this repo.** `sectionSha.ts` still matches `^(#{1,6})\s` only. The new
`manifest-format.md` now says `from.file` is "The Markdown file", so the limit is written down.

**Suggested fix.** Either of:

- Let `sha <file>` run without a heading, and let `from:` leave out `section`. `stale` then
  compares the whole file. Simple, and works for any file type.
- Find `.rst` sections by title text. A section ends at the next heading of the same or higher
  level. In rst, the underline character sets the level, ranked in the order the file first
  uses each one.

Filed as https://github.com/getappmap/vscode-onboarding/issues/1.

## 2. The writer never suggests running setup

**What happened.** The writer's last step only runs `check`, and the skill says "you never run
fixes". All four failures in the table above showed up only when `onboarding-setup` ran the
fixes. Two of them changed project choices the writer had already settled with the developer:
the Python patch version and the Node version.

**In this repo.** Steps 6–7 of the writer still end at "use {{check}} … Do not run fixes
yourself." Nothing points to `onboarding-setup`.

**Suggested fix.** In step 7, tell the developer that the fixes haven't been tried yet, and
suggest running `onboarding-setup` before committing the manifest.

## 3. Running the CLI can change the computer

**What happened.** The writer pinned `nodejs 18` in `.tool-versions`. The next
`node <skill>/scripts/onboard.mjs sha ...`, run from the repo folder, went through the mise
`node` shim, and mise installed Node 18.20.8 before the command ran. The writer's "changes
nothing" step changed the computer. If the pinned Node is too old to run `onboard.mjs`, the
CLI itself would fail.

**In this repo.** No mention of mise, asdf shims or auto-install in `src/` or `skills/`.

**Suggested fix.** One or more of:

- Tell the skills to run the CLI with `MISE_AUTO_INSTALL=0`, or with an absolute Node path.
- Have the CLI check `process.version` at start and print a plain error if it is too old.
- At least note in the writer: "Running `node` in a project with `.tool-versions` or `.nvmrc`
  may install that Node version."

## 4. `check` runs entries whose dependencies are not ready

**What happened.** `check` ran `first-test` (one pytest file) while `python-packages` and
`postgres` were not ready. It printed a pytest `INTERNALERROR` traceback ending in
"Error loading psycopg2". That only meant "the packages aren't installed yet", but it read like
a real failure.

**In this repo.** `checkEntries.ts` caps output at 20 lines (`maxLines: 20`), so the traceback
was already short. It still runs every entry and ignores `dependsOn`.

**Suggested fix.** Do what `run` already does: if an entry depends on one that failed its
check, report it as `skipped: waits for <id>` and don't run its check.

## 5. `prove` can pass against the wrong service

**What happened.** The `postgres` check ran `podman compose exec -T postgres pg_isready`, which
passed because the container was up. The `prove` connected to `localhost:5432` with the
settings in `.env`, and reached a Homebrew PostgreSQL 18 instead: `role "postgres" does not
exist`. The prove caught it here only because the two servers had different users. With
`trust` auth on the other server, it would have passed.

**In this repo.** The writer says "`prove` tests the one thing its entry sets up". Nothing
covers another service answering on the same port.

**Suggested fix.** Add to "Keep checks and proofs quick": for a service, `prove` connects the
way the project does (same host, port and credentials) and confirms it reached the right
server, such as by checking the server version or a database name only the project creates.
A `troubleshooting` example for port clashes would also help:
`lsof -nP -iTCP:<port> -sTCP:LISTEN`.

## 6. "troubleshooter" skill named but not shipped (fixed)

v1.0.0's writer described `troubleshooting` as "notes for the onboarding-troubleshooter skill",
which doesn't ship. Fixed in `f6fe26f`. `manifest-format.md` now says the notes are "for the
developer and for an agent helping with a failure".

## 7. The CLI is hard to review

**What happened.** The zip has `scripts/onboard.mjs` (143 KB, minified) in each of the three
skills, byte for byte the same. The script runs manifest commands (`child_process.spawn`) and
fetches from an org settings server (`fetch`, https only unless localhost). Before installing,
I could only grep it for URLs and process calls. A reader can't easily confirm what it does.

**In this repo.** `esbuild.js` sets `minify: production` and, for the CLI,
`sourcemap: false` with the comment "The skills copy this one file, so it carries no source
map". The uncommitted work also copies `skills/shared/manifest-format.md` into every skill
folder, so each folder carries one more duplicate.

**Suggested fix.** Build the CLI unminified (it's not loaded in a browser, so size matters
little), or ship a source map. Optionally ship one shared copy of the CLI and the format doc
in the zip, with each skill pointing to it. The copies exist so each skill folder works on
its own, so this is a trade-off.

## Notes on the WIP

Two changes in the WIP would have helped in this session:

- **CI counts as evidence** (`f6fe26f`). The writer used the CI workflow for Python 3.9 and
  postgres:14 anyway, but v1.0.0 didn't say to.
- **The flow diagram** in `manifest-format.md` (check → fix → check again → prove) is clearer
  than v1.0.0's paragraph.

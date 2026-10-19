# onboarding.yaml reference

`onboarding.yaml` lives at the top of the repository. It lists what a developer's computer
needs, and is reviewed like any other code. This page describes every field.

```yaml
team: payments
entries:
  - id: jdk
    uses: jdk
    with: { version: "21" }
    failMessage: Install JDK 21 from the company software portal.

  - id: gradle
    uses: gradle-wrapper
    dependsOn: [jdk]

  - id: artifactory-credentials
    title: Artifactory sign-in for Gradle
    dependsOn: [gradle]
    secrets: { ARTIFACTORY_TOKEN: dev/artifactory/token }
    check:
      posix: grep -q '^artifactoryToken=' ~/.gradle/gradle.properties
      windows: if (-not (Select-String -Quiet -Pattern '^artifactoryToken=' -Path "$HOME\.gradle\gradle.properties")) { exit 1 }
    fix:
      posix: printf 'artifactoryToken=%s\n' "$ARTIFACTORY_TOKEN" >> ~/.gradle/gradle.properties
      windows: Add-Content "$HOME\.gradle\gradle.properties" "artifactoryToken=$env:ARTIFACTORY_TOKEN"
    prove: ./gradlew dependencies --quiet
```

## Entries

`team`, at the top level, names the team for the company settings server. `entries` lists what
to set up.

Setup takes each entry through the same steps:

```
check ──passes──────────────────────────────► prove ──passes──► ready
  │                                              ▲
  └─fails─► fix ──► check again ──passes─────────┘
             │            │
          no fix,      still fails
          or fails        │
             └────────────┴──► failed: shows what happened, failMessage, then the output
```

- Entries run in the order written, except that each runs after the entries in its `dependsOn`.
  If one of those is not ready, the entry is skipped. A loop in `dependsOn` stops setup.
- Once an entry is ready, setup does not run it again on this computer until its commands,
  `uses`, `with`, `env` or `secrets` change. Changing its title or messages does not count.
  **Onboarding: Run Setup, Proving Everything Again** runs everything anyway.
- Onboarding checks the whole file before running anything, and lists every problem it finds.

| Field | What it does |
|---|---|
| `id` | Names the entry for `dependsOn`. Required and unique. Letters, digits, `.`, `-` and `_` |
| `title` | The name shown in the list. Defaults to `id` |
| `check` | Passes when the thing is in place. Must change nothing. Required, unless `uses` gives one |
| `fix` | Puts it in place. Runs without asking, unless `onboarding.askBeforeFixing` is on. Optional: without one, a failed check fails the entry |
| `prove` | Passes when it works, not just when it is installed. Optional |
| `uses`, `with` | A built-in item, and its values (below). `with` only works with `uses` |
| `dependsOn` | Ids that must be ready first |
| `platforms` | Run only on `macos`, `linux` or `windows`. Left out: every computer. On other computers the entry is left out, and entries that depend on it stop waiting for it |
| `env` | Plain values passed to the commands as environment variables |
| `secrets` | Secrets passed to the commands. Gives each secret's path in your secret store, never its value. A secret with no value fails the entry |
| `failMessage` | The next step to tell the developer when the entry fails |
| `troubleshooting` | Known problems and what to run. Shown to the developer as notes from the team, and given to Copilot when it helps with a failure |
| `from` | Where the commands came from, such as a README section. Onboarding warns when that section changes |

`env` and `secrets` names must be environment variable names (letters, digits and `_`, not
starting with a digit), and a name cannot be in both.

A command is either one line for every computer, or a `posix` form for `sh` and a `windows`
form for PowerShell. It runs in the repository folder, without your shell profile, and succeeds
when it exits with 0. An entry with only one form fails on the other kind of computer, unless
`platforms` leaves it out there.

## Built-in items

An entry with `uses` gets its commands from a built-in item. Commands the entry gives itself win.

| `uses` | `with` | Checks |
|---|---|---|
| `jdk` | `version`, such as `"21"` | `java` on the PATH is at least that version |
| `gradle-wrapper` | none | `gradlew` is there and its Gradle version is downloaded. Fix downloads it |
| `http-service` | `url` | The address answers at all, with any HTTP status |

## Where a value came from

`from` records where an entry's commands came from, so Onboarding can warn when that text
changes. The Draft Manifest and README skills fill it in.

```yaml
from: { source: guessed, file: README.md, section: "## Building", sha256: 9c2e41d0, date: 2026-10-10 }
```

| Field | What it is |
|---|---|
| `source` | `guessed`: read from the README by an agent, and updated when the text changes. `person`: a choice the team made, which Onboarding never changes on its own |
| `file`, `section` | The file, and the heading exactly as written |
| `sha256` | The SHA of that section when the value was taken. Onboarding compares it with the section |
| `date` | When the value was taken, for people. Onboarding does not use it |

## MCP servers

`mcpServers`, at the top level, lists MCP servers the team uses. Onboarding hands them to
Copilot in VS Code.

```yaml
mcpServers:
  - name: issues
    url: https://mcp.example.com/issues
    tokenSecret: dev/issues/mcp-token   # sent as a Bearer token
  - name: docs
    command: [npx, -y, "@example/docs-mcp"]
```

| Field | What it does |
|---|---|
| `name` | The name Copilot shows. Required |
| `url` | Address of a server that runs elsewhere. Give `url` or `command`, not both |
| `command` | Command that starts a server on this computer: the program, then its arguments |
| `tokenSecret` | Secret store path of a token, sent as `Authorization: Bearer`. Only with `url` |

Names must be unique.

## Results

Results go to `.onboarding/status.yaml` in the repository. They are for this computer only, and
the folder has its own `.gitignore`, so they are never committed.

## Company settings server

Setup asks `GET <onboarding.orgSettingsUrl>?team=<team>`, where `team` comes from the project's
`onboarding.yaml`. The answer is JSON:

```json
{
  "org": { "entries": [], "mcpServers": [] },
  "team": { "entries": [] }
}
```

`org` and `team` have the same form as `onboarding.yaml`; `team` may be `null`. If the server cannot
be reached, setup carries on with the project's `onboarding.yaml` alone and says so in the
Onboarding log.

Setup reads the layers in order: org, then team, then the project's `onboarding.yaml`. An entry
whose `id` is in more than one layer is combined: the later layer's single values win,
`dependsOn` lists are joined, and `with`, `env` and `secrets` are merged name by name. An MCP
server with the same name is replaced whole.

## Secrets

Setup runs `onboarding.secretCommand` once for each secret an entry needs, with `{path}`
replaced by the secret's path from `onboarding.yaml`. The path reaches the command as an
environment variable, so it cannot break the command's quoting. What the command prints is the
secret. It is passed only to that entry's commands, and hidden as `***` in any output shown.

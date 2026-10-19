# The onboarding.yaml format

`onboarding.yaml` sits at the top of the repository. Onboarding checks it before running
anything, and lists every problem it finds.

```yaml
team: payments                      # optional: picks the Team layer from the company server
entries:
  - id: jdk                         # unique; letters, digits, . - _ (we use lowercase)
    title: Java 21                  # what the developer sees; defaults to id
    uses: jdk                       # optional built-in item (below)
    with: { version: "21" }         # values for the built-in item; only with uses
    check: <command>                # required, unless uses gives one
    fix: <command>                  # optional; runs without asking
    prove: <command>                # optional; a few seconds, such as one import or one request
    dependsOn: [other-id]           # run after these; skipped if they are not ready
    platforms: [macos, linux]       # optional: macos, linux, windows; left out, runs everywhere
    env: { NAME: value }            # plain values for the commands
    secrets: { NAME: dev/path }     # secret store paths, never values
    failMessage: <one specific next step for the developer>
    troubleshooting: <notes for the developer and for an agent helping with a failure>
    from: { source: guessed, file: README.md, section: "## Run locally", sha256: <8 hex>, date: <YYYY-MM-DD> }
mcpServers:
  - { name: access, url: "https://...", tokenSecret: dev/path }   # or command: [program, args]
```

## How setup runs an entry

```
check ──passes──────────────────────────────► prove ──passes──► ready
  │                                              ▲
  └─fails─► fix ──► check again ──passes─────────┘
             │            │
          no fix,      still fails
          or fails        │
             └────────────┴──► failed: shows what happened, failMessage, then the output
```

- **Order:** entries run in the order written, except that each runs after the entries in its
  `dependsOn`. If one of those is not ready, the entry is skipped. A loop in `dependsOn` stops
  setup; a `dependsOn` id with no entry skips the entry.
- **Remembered:** once an entry is ready, setup does not run it again on this computer until
  its commands, `uses`, `with`, `env` or `secrets` change. Changing `title`, `failMessage` or
  `troubleshooting` does not count.
- **Secrets:** before an entry's commands run, setup reads each secret with the developer's
  secret command. A secret with no value fails the entry. Values are hidden as `***` in output.

## Fields

| Field | Purpose and rules |
|---|---|
| `team` | Names the team, so a company settings server can add the team's entries |
| `id` | Names the entry for `dependsOn` and for people. Unique |
| `title` | The name shown in the list and in messages |
| `uses`, `with` | Take the commands from a built-in item. `with` gives its values and needs `uses` |
| `check` | Passes when the thing is in place. Must change nothing, and need no network unless the entry is about a network service |
| `fix` | Puts it in place. Runs without asking, unless the developer turned on asking. Must be safe to run twice |
| `prove` | Passes when it works, beyond being installed. Leave it out when `check` already shows that |
| `dependsOn` | Ids that must be ready first. Not the entry's own id |
| `platforms` | The only platforms the entry runs on. At least one. Elsewhere the entry is left out, and entries that depend on it stop waiting for it |
| `env` | Plain values, passed to all three commands as environment variables |
| `secrets` | Secret values, passed the same way. Each gives a secret store path. A name cannot be in both `env` and `secrets` |
| `failMessage` | The one next step for the developer, shown when the entry fails |
| `troubleshooting` | Known problems and what to run. Shown to the developer as notes from the team, and given to any agent asked to help |
| `from` | Where the entry's values came from (below) |

`env` and `secrets` names must be valid environment variable names: letters, digits and `_`, not
starting with a digit.

## Commands

A command is one string, run with `sh -c` on macOS and Linux and PowerShell on Windows, in the
repository folder. It passes when it exits with 0. Commands run without the developer's shell
profile.

Each entry must be one of these:

| Kind | How to write it | Example |
|---|---|---|
| Same command everywhere | one string that runs the same in sh and PowerShell | `check: bundle check` |
| Different per platform | `{ posix: ..., windows: ... }` | `fix: { posix: sh bin/onboarding/ruby.sh, windows: ... }` |
| Only some platforms | `platforms: [...]`, with commands for just those | `platforms: [macos]` and `fix: brew install cmake` |

An entry with only a `posix` form fails on Windows with "no command for this computer", and the
other way round. Never test `uname` in a command; split the entry, or use `platforms`.

## Built-in items

An entry with `uses` gets its commands from a built-in item. Commands the entry gives itself win.

| `uses` | `with` | Checks |
|---|---|---|
| `jdk` | `version`, such as `"21"` | `java` on the PATH is at least that version |
| `gradle-wrapper` | none | `gradlew` is there and its Gradle version is downloaded. Fix downloads it |
| `http-service` | `url` | The address answers at all, with any HTTP status |

## from: where a value came from

Onboarding compares `sha256` with the README section, and tells the developer
when the section has changed. It needs `file`, `section` and `sha256` to do that.

| Field | What it is |
|---|---|
| `source` | `guessed`: read from the README by an agent; update the value when the text changes. `person`: a choice the team made; keep the value and ask the developer which is right |
| `file` | The Markdown or `.rst` file, relative to the repository folder |
| `section` | The heading exactly as written. In Markdown, include its `#` marks. In a `.rst` file, give the title without its underline |
| `sha256` | The section's SHA, from Onboarding's SHA tool or command. Never compute it yourself |
| `date` | When the value was taken, `YYYY-MM-DD`. For people; Onboarding does not use it |

## mcpServers

MCP servers the team uses. Onboarding hands them to Copilot in VS Code. Names are unique.

| Field | Purpose and rules |
|---|---|
| `name` | The name Copilot shows. Required |
| `url` | Address of a server that runs elsewhere. Give `url` or `command`, not both |
| `command` | A server to start on this computer: the program, then its arguments, as a list |
| `tokenSecret` | Secret store path of a token, sent as `Authorization: Bearer`. Only with `url` |

## Layers

A company settings server can add an Org layer and a Team layer, read before the project's own
file. An entry whose `id` appears in more than one layer is combined: the project's single values
win, `dependsOn` lists are joined, and `with`, `env` and `secrets` are merged name by name.
An MCP server with the same name is replaced whole.

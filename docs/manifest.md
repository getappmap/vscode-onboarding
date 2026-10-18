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
to set up. Setup runs them in order, after the entries each one depends on.

A command is either one line for every computer, or a `posix` form for `sh` and a `windows`
form for PowerShell. A command succeeds when it exits with 0.

| Field | What it does |
|---|---|
| `id` | A short name. Required |
| `title` | The name shown in the list. Defaults to `id` |
| `check`, `fix`, `prove` | The commands. Each is optional |
| `uses`, `with` | A built-in item, and its values (below) |
| `dependsOn` | Ids that must be ready first |
| `platforms` | Run only on `macos`, `linux` or `windows`. Left out: every computer |
| `env` | Plain values passed to the commands as environment variables |
| `secrets` | Secrets passed to the commands. Gives each secret's path in your secret store, never its value |
| `failMessage` | What to tell the developer when the item fails |
| `troubleshooting` | Hints for Copilot when it helps with a failure |
| `from` | Where the commands came from, such as a README section. Onboarding warns when that section changes |

## Built-in items

An entry with `uses` gets its commands from a built-in item. Commands the entry gives itself win.

| `uses` | `with` | Checks |
|---|---|---|
| `jdk` | `version`, such as `"21"` | `java` on the PATH is at least that version |
| `gradle-wrapper` | none | `gradlew` is there and its Gradle version is downloaded. Fix downloads it |
| `http-service` | `url` | The address answers at all, with any HTTP status |

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
| `url` | Address of a server that runs elsewhere |
| `command` | Command that starts a server on this computer, as a list |
| `tokenSecret` | Secret store path of a token for a `url` server |

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

## Secrets

Setup runs `onboarding.secretCommand` once for each secret an entry needs, with `{path}`
replaced by the secret's path from `onboarding.yaml`. The path reaches the command as an
environment variable, so it cannot break the command's quoting. What the command prints is the
secret. It is passed only to that entry's commands, and hidden as `***` in any output shown.

# Onboarding

Set up a developer's computer for a repository, and keep it set up.

A repository lists what a developer needs in one file, `onboarding.yaml`: a JDK, a build tool,
a VPN, a token for a package server. For each item it gives three commands:

| Command | Answers |
|---|---|
| `check` | Is it already in place? Changes nothing |
| `fix` | Put it in place |
| `prove` | Does it actually work? |

Onboarding runs every item the same way, in order, and shows what is ready and what is not.
When something fails, GitHub Copilot can explain it and help fix it.

```
onboarding.yaml ──► check ──ready──► prove ──► ✓ ready
                      │                ▲
                      └─not ready─► fix┘
```

## Requirements

| Need | Version |
|---|---|
| VS Code | 1.134 or later |
| GitHub Copilot Chat | Only for the AI features: Ask Copilot to Help, Draft Manifest, and the skills |

Onboarding works on macOS, Linux and Windows. Commands run in `sh`, or in PowerShell on Windows.

## Get started

1. Open a repository that has an `onboarding.yaml`.
2. Open **Onboarding** from its icon in the Activity Bar.
3. Press the play button, or run **Onboarding: Run Setup** from the Command Palette.

Each item shows as ready, failed or skipped. Select one to see its commands and output. For a
failed item, press **Ask Copilot to Help**.

If the repository has no `onboarding.yaml` yet, run **Onboarding: Draft Manifest**. It opens
Copilot Chat, which looks through the repository and writes a first version for you to review.

Setup only runs in folders you trust (VS Code's Workspace Trust). Fixes run without asking. To
see and approve each fix first, turn on `onboarding.askBeforeFixing`.

Setup remembers each item it has proven on this computer, and skips it until its commands
change. To run everything again, use **Onboarding: Run Setup, Proving Everything Again**.

## The manifest

`onboarding.yaml` lives at the top of the repository and is reviewed like any other code.
A short one looks like this:

```yaml
entries:
  - id: jdk
    uses: jdk
    with: { version: "21" }
    failMessage: Install JDK 21 from the company software portal.

  - id: build
    dependsOn: [jdk]
    check: test -d build
    fix: ./gradlew assemble
    prove: ./gradlew test --quiet
```

Every field, the built-in items, secrets and MCP servers are in the
[onboarding.yaml reference](docs/manifest.md).

## Copilot skills and tools

Onboarding gives Copilot agent mode three skills and two tools:

| Name | Kind | Use |
|---|---|---|
| `/onboarding-manifest-writer` | Skill | Draft or change `onboarding.yaml` |
| `/onboarding-text-reader` | Skill | Read setup values from a README section, and update them when it changes |
| `/onboarding-setup` | Skill | Explain and fix items that are not ready |
| `#checkSetup` | Tool | Run check commands only, never fixes. Items that need secrets are not checked |
| `#sectionSha` | Tool | The SHA of a README section, for the `from` field |

## Use the skills without VS Code

The same three skills work in Claude Code, Copilot CLI and other agents that read `SKILL.md`
folders. Each skill folder carries a small Node script, `scripts/onboard.mjs`, that does what
the extension does. You need Node.js 18 or later.

### Install the skills

Each [release](https://github.com/getappmap/vscode-onboarding/releases) has `onboarding-skills.zip`,
which holds the three skill folders. In the repository you want to set up, run:

```bash
curl -fsSL -o /tmp/onboarding-skills.zip https://github.com/getappmap/vscode-onboarding/releases/latest/download/onboarding-skills.zip
```

```bash
mkdir -p .claude/skills && unzip -o /tmp/onboarding-skills.zip -d .claude/skills
```

Or download it with the GitHub CLI:

```bash
gh release download --repo getappmap/vscode-onboarding --pattern onboarding-skills.zip --dir /tmp --clobber
```

To install for every repository on your computer, unzip into `~/.claude/skills` instead. To get
a newer version, run the same commands again.

Claude Code, Copilot in VS Code and Copilot CLI all read `.claude/skills/`. Claude Code runs each
skill's own script without asking. Copilot asks before running `node`.

Without VS Code, the script reads the settings below from environment variables:
`ONBOARDING_ORG_SETTINGS_URL` and `ONBOARDING_SECRET_COMMAND`. To run it yourself:
`node .claude/skills/onboarding-setup/scripts/onboard.mjs --help`.

## Settings

| Setting | What it does |
|---|---|
| `onboarding.orgSettingsUrl` | Company settings server that adds items for the whole company and for each team. Empty: each repository's `onboarding.yaml` alone |
| `onboarding.secretCommand` | Command that prints one secret; `{path}` marks where its path goes, e.g. `vault kv get -field=value {path}` |
| `onboarding.askBeforeFixing` | Off by default, so fixes run without asking. On, each fix shows its command and asks first |

How the company settings server and the secret command work: see the
[onboarding.yaml reference](docs/manifest.md#company-settings-server).

## Feedback and contributing

Report problems and ideas in [GitHub issues](https://github.com/getappmap/vscode-onboarding/issues).
To work on the extension, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

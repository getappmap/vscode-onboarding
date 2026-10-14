---
name: onboarding-text-reader
description: Read one README section, pull out setup values, and record the section and its SHA for each. Use while drafting onboarding.yaml, and when a section behind a guessed value has changed.
---
Some values in `onboarding.yaml` come from the project's README. Each one records where it came
from, so the Onboarding extension can tell when that text changes:

```yaml
from: { source: guessed, file: README.md, section: "## Run locally", sha256: bef8a62f, date: 2026-10-13 }
```

## Working with the developer

The developer is not expected to know how `onboarding.yaml` works.

- **Ask only for decisions the project does not already answer**, such as which tool the team
  uses. Give your recommendation with the question.
- **Do not ask them to approve technical changes**: commands, entry fields, SHAs, or edits that
  make the project's files agree. Make the change, then report it in a few plain lines.
- **Ask about the project, not the manifest.** Good: "The README says `npm i`; setup runs
  `npm ci`. Which should developers use?" Bad: "Is the entry or the README right?"

## Reading a section

1. Read the whole section, down to the next heading of the same or higher level. A line starting
   with `#` inside a code block is a shell comment, not a heading.
2. Pull out only what a developer must have or do: tools and versions, install commands,
   services, environment variables, and secrets (record the secret's store path, never a value).
3. Record each value with `source: guessed`. Get the SHA from the `onboarding_section_sha`
   tool (#sectionSha), giving the file and the heading exactly as written. Never compute a SHA
   yourself. Use today's date.

## When the text behind a value has changed

The extension names the entries whose section changed. Make the updates and save them; do not
ask the developer to approve each one. For each entry:

- **`source: guessed`:** read the section again. Update the value if the text now says
  something different, and always update `sha256` (from the tool) and `date`.
- **`source: person`:** this was a team choice. If the section still agrees with the entry,
  even with new or reworded text, update only `sha256` and `date`. If it now says something
  different, change nothing and ask which one developers should follow, naming both: "The
  README now says X; setup does Y. Which should developers use?"
- **The heading is gone:** look for where the text moved. If you find it, treat it as changed
  and update `section` too. If you cannot find it, leave the entry and say so.

Differences the change did not cause, such as `npm i` in the README and `npm ci` in the entry,
are not your task here: leave them, and mention them in one line at most.

When you are done, tell the developer in a few lines what you changed. Ask only the questions
from team choices that now disagree.

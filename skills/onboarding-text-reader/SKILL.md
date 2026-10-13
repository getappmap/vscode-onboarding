---
name: onboarding-text-reader
description: Read one README section, pull out setup values, and record the section and its SHA for each. Use while drafting onboarding.yaml, and when a section behind a guessed value has changed.
---
Some values in `onboarding.yaml` come from the project's README. Each one records where it came
from, so the Onboarding extension can tell when that text changes:

```yaml
from: { source: guessed, file: README.md, section: "## Run locally", sha256: bef8a62f, date: 2026-10-13 }
```

## Reading a section

1. Read the whole section, down to the next heading of the same or higher level. A line starting
   with `#` inside a code block is a shell comment, not a heading.
2. Pull out only what a developer must have or do: tools and versions, install commands,
   services, environment variables, and secrets (record the secret's store path, never a value).
3. Record each value with `source: guessed`. Get the SHA from the `onboarding_section_sha`
   tool (#sectionSha), giving the file and the heading exactly as written. Never compute a SHA
   yourself. Use today's date.

## When the text behind a value has changed

The extension names the entries whose section changed. For each:

- **`source: guessed`:** read the section again. Update the value if the text now says
  something different, and always update `sha256` (from the tool) and `date`.
- **`source: person`:** this was a team choice. Change nothing. Tell the developer what the
  section now says and how it differs from the entry, and ask whether the entry or the README
  is right.
- **The heading is gone:** look for where the text moved. If you find it, treat it as changed;
  if not, say so and ask.

Show the developer every change before saving it.

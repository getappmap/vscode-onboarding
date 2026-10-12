import type { Entry } from '../manifest/manifest';

/**
 * Ready-made commands for very common dependencies. A preset only fills in commands;
 * the entry still runs the same check, fix and prove steps, and its own commands win.
 * Each preset gives both a windows and a posix form.
 *
 * Values from `with` reach the commands as ONBOARDING_* environment variables, never
 * pasted into the command text, so no value can break the quoting in either shell.
 */
type Preset = (values: Record<string, string>) => Pick<Entry, 'check' | 'fix' | 'prove' | 'env'>;

const presets: Record<string, Preset> = {
  // JDK of at least v.version, found as `java` on the PATH. Java 8 reports "1.8", so a leading "1." is skipped.
  'jdk': v => ({
    env: { ONBOARDING_JDK_VERSION: required(v, 'version', /^\d+$/, 'a whole number such as 21') },
    check: {
      posix: 'v=$(java -version 2>&1 | sed -n \'s/.*version "\\(1\\.\\)\\{0,1\\}\\([0-9]*\\).*/\\2/p\' | head -n 1); '
        + '[ "${v:-0}" -ge "$ONBOARDING_JDK_VERSION" ]',
      windows: '$out = & { $ErrorActionPreference = \'Continue\'; java -version 2>&1 | Out-String }; '
        + 'if ($out -notmatch \'version "(1\\.)?(\\d+)\') { exit 1 }; '
        + 'if ([int]$Matches[2] -lt [int]$env:ONBOARDING_JDK_VERSION) { exit 1 }',
    },
  }),

  // gradlew is present and the Gradle version it names is already downloaded. Fix downloads it.
  'gradle-wrapper': () => ({
    check: {
      posix: 'test -f gradlew && '
        + 'd=$(sed -n \'s#^distributionUrl=.*/\\(gradle-[^/]*\\)\\.zip.*#\\1#p\' gradle/wrapper/gradle-wrapper.properties) && '
        + 'test -n "$d" && ls -d "${GRADLE_USER_HOME:-$HOME/.gradle}/wrapper/dists/$d"/*/gradle-* >/dev/null 2>&1',
      windows: 'if (-not (Test-Path gradlew.bat)) { exit 1 }; '
        + '$props = Get-Content gradle\\wrapper\\gradle-wrapper.properties -Raw; '
        + 'if ($props -notmatch \'distributionUrl=.*/(gradle-[^/]*)\\.zip\') { exit 1 }; '
        + '$home_ = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { "$HOME\\.gradle" }; '
        + 'if (-not (Test-Path "$home_\\wrapper\\dists\\$($Matches[1])\\*\\gradle-*")) { exit 1 }',
    },
    fix: { posix: 'sh ./gradlew --version', windows: '.\\gradlew.bat --version' },
    prove: { posix: 'sh ./gradlew --offline --version', windows: '.\\gradlew.bat --offline --version' },
  }),

  // v.url answers at all. Any HTTP status counts; only no answer fails.
  'http-service': v => ({
    env: { ONBOARDING_URL: required(v, 'url', /^https?:\/\/\S+$/, 'an http:// or https:// address') },
    check: {
      posix: 'curl --silent --output /dev/null --max-time 10 "$ONBOARDING_URL"',
      windows: 'try { Invoke-WebRequest -Uri $env:ONBOARDING_URL -Method Head -TimeoutSec 10 -UseBasicParsing | Out-Null } '
        + 'catch { if (-not $_.Exception.Response) { exit 1 } }',
    },
  }),
};

/** The names an entry's `uses` may give. */
export const PRESET_NAMES: readonly string[] = Object.keys(presets);

function required(values: Record<string, string>, name: string, pattern: RegExp, expected: string): string {
  const value = values[name];
  if (value === undefined) {
    throw new Error(`needs "with: { ${name}: ... }"`);
  }
  if (!pattern.test(value)) {
    throw new Error(`with.${name} "${value}" must be ${expected}`);
  }
  return value;
}

/** Returns the entry with the preset's commands filled in where the entry has none. */
export function expandPreset(entry: Entry): Entry {
  if (entry.uses === undefined) {
    return entry;
  }
  const preset = presets[entry.uses];
  if (!preset) {
    throw new Error(`${entry.id}: "${entry.uses}" is not a preset. Presets: ${PRESET_NAMES.join(', ')}`);
  }
  let filled: ReturnType<Preset>;
  try {
    filled = preset(entry.with ?? {});
  } catch (err) {
    throw new Error(`${entry.id}: preset "${entry.uses}" ${(err as Error).message}`);
  }
  const expanded: Entry = {
    ...entry,
    check: entry.check ?? filled.check,
    fix: entry.fix ?? filled.fix,
    prove: entry.prove ?? filled.prove,
    env: filled.env || entry.env ? { ...filled.env, ...entry.env } : undefined,
  };
  return Object.fromEntries(Object.entries(expanded).filter(([, v]) => v !== undefined)) as Entry;
}

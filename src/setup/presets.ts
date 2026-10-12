import type { Entry } from '../manifest/manifest';

/**
 * Ready-made commands for very common dependencies. A preset only fills in commands;
 * the entry still runs the same check, fix and prove steps, and its own commands win.
 * Each preset gives both a windows and a posix form.
 */
type Preset = (values: Record<string, string>) => Pick<Entry, 'check' | 'fix' | 'prove'>;

const presets: Record<string, Preset> = {
  'jdk': v => ({ check: { windows: 'TODO', posix: 'TODO' } }),             // JDK of at least v.version
  'gradle-wrapper': () => ({ check: { windows: 'TODO', posix: 'TODO' } }), // gradlew present and runs
  'http-service': v => ({ check: { windows: 'TODO', posix: 'TODO' } }),    // v.url answers at all
};

/** The names an entry's `uses` may give. */
export const PRESET_NAMES: readonly string[] = Object.keys(presets);

/** Returns the entry with the preset's commands filled in where the entry has none. */
export function expandPreset(entry: Entry): Entry {
  throw new Error('TODO: look up entry.uses in presets; unknown preset is an error');
}

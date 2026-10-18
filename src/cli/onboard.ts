import * as path from 'path';
import { parseArgs } from 'util';
import { failureDetails } from '../agent/prompts';
import { fetchOrgSettings, readSecret } from '../company/company';
import { Entry, MANIFEST_FILE, Manifest, combineLayers, forPlatform, readManifest } from '../manifest/manifest';
import { sectionShaOfFile } from '../manifest/sectionSha';
import { findStale, staleMessage } from '../manifest/staleCheck';
import type { EntryState, EntryStatus, SetupReporter } from '../report/report';
import { StatusRecorder, emptyStatus, provenFrom, readStatus } from '../report/statusFile';
import { checkEntries } from '../setup/checkEntries';
import { runSetup } from '../setup/runSetup';

/**
 * The Onboarding command line: the same setup the VS Code extension runs, for agents and
 * people without VS Code. The standalone skills run it as `node scripts/onboard.mjs`.
 *
 * Settings come from environment variables that match the extension's settings:
 *   ONBOARDING_ORG_SETTINGS_URL   onboarding.orgSettingsUrl
 *   ONBOARDING_SECRET_COMMAND     onboarding.secretCommand
 */

const USAGE = `Usage: node onboard.mjs <command> [--project <folder>]

Commands:
  run [--reprove]          Check, fix and prove every entry in ${MANIFEST_FILE}.
                           Writes .onboarding/status.yaml. Exits 1 if any entry is not ready.
  check [entry] [--json]   Run check commands only. Changes nothing.
  sha <file> <heading> [--json]
                           The SHA of a Markdown section, for a from: field.
  stale                    Entries whose README section changed since it was recorded.
  status                   The last setup results on this computer.

--project is the folder that holds ${MANIFEST_FILE}. Left out, it is the current folder.`;

/** Where the command writes. Tests pass their own. */
export interface Io {
  out(text: string): void;
  err(text: string): void;
  env: Record<string, string | undefined>;
  /** Set to true to stop a running setup, as Ctrl-C does. */
  cancel?: { isCancellationRequested: boolean };
}

/** Runs one command and returns the exit code: 0 done, 1 not everything is ready, 2 could not run. */
export async function main(argv: string[], io: Io): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        project: { type: 'string' },
        reprove: { type: 'boolean' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    io.err(`${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals: [command, ...args] } = parsed;
  if (values.help || command === undefined || command === 'help') {
    io.out(USAGE);
    return command === undefined && !values.help ? 2 : 0;
  }
  const folder = path.resolve(values.project ?? '.');

  try {
    switch (command) {
      case 'run': return await run(folder, !!values.reprove, io);
      case 'check': return await check(folder, args[0], !!values.json, io);
      case 'sha': return await sha(folder, args, !!values.json, io);
      case 'stale': return await stale(folder, io);
      case 'status': return await status(folder, io);
      default: throw new Error(`There is no command "${command}".\n\n${USAGE}`);
    }
  } catch (err) {
    // Every failure is shown as its message alone, in plain words, with no stack trace.
    io.err((err as Error).message);
    return 2;
  }
}

/** The project's manifest, and the plan for this computer: the Org and Team layers, then the project. */
async function loadPlan(folder: string, io: Io): Promise<{ project: Manifest; plan: Manifest }> {
  const project = await readManifest(folder);
  if (!project) {
    throw new Error(`There is no ${MANIFEST_FILE} in ${folder}. Give the project folder with --project.`);
  }
  let layers: Manifest[] = [];
  try {
    layers = (await fetchOrgSettings(project.team, io.env.ONBOARDING_ORG_SETTINGS_URL ?? '')).layers;
  } catch (err) {
    io.err(`Org and Team settings not loaded, so only ${MANIFEST_FILE} is used: ${(err as Error).message}`);
  }
  return { project, plan: forPlatform(combineLayers([...layers, project])) };
}

const FINISHED: EntryState[] = ['ready', 'failed', 'skipped'];

/** One line per entry as it finishes. */
function lineFor(status: EntryStatus): string {
  const word = status.state.padEnd(8);
  if (status.state === 'ready') {
    return `${word}${status.title}${status.because === 'proven-earlier' ? ' (proven earlier)' : ''}`;
  }
  if (status.state === 'skipped') {
    return `${word}${status.title}: ${status.detail ?? ''}`;
  }
  return `${word}${status.title}`;
}

async function run(folder: string, reprove: boolean, io: Io): Promise<number> {
  const { plan } = await loadPlan(folder, io);
  if (plan.entries.length === 0) {
    io.out(`There is nothing to set up: ${MANIFEST_FILE} lists no setup steps.`);
    return 0;
  }

  const previous = await readStatus(folder) ?? emptyStatus();
  const proven = provenFrom(previous);
  const recorder = new StatusRecorder(folder, previous, proven,
    err => io.err(`Could not write the status file: ${err.message}`));
  const printer: SetupReporter = {
    begin: entries => io.out(`Setting up ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} in ${folder}`),
    update: s => FINISHED.includes(s.state) && io.out(lineFor(s)),
    end: () => undefined,
  };
  const reporter: SetupReporter = {
    begin: e => { recorder.begin(e); printer.begin(e); },
    update: s => { recorder.update(s); printer.update(s); },
    end: s => { recorder.end(); printer.end(s); },
  };
  const secretCommand = io.env.ONBOARDING_SECRET_COMMAND ?? '';
  const readSecrets = async (paths: Record<string, string>) => {
    const found: Record<string, string> = {};
    for (const [name, secretPath] of Object.entries(paths)) {
      const value = await readSecret(secretPath, secretCommand);
      if (value !== undefined) {
        found[name] = value;
      }
    }
    return found;
  };

  let statuses: EntryStatus[];
  try {
    statuses = await runSetup(plan.entries, {
      folder, readSecrets, reporter, proven, reprove, token: io.cancel ?? { isCancellationRequested: false },
    });
  } finally {
    await recorder.saved();
  }

  const notReady = statuses.filter(s => s.state !== 'ready');
  if (notReady.length === 0) {
    io.out('\nEvery entry is ready.');
  } else {
    io.out(`\n${notReady.length} of ${statuses.length} ${statuses.length === 1 ? 'entry is' : 'entries are'} not ready.\n`);
    io.out(failureDetails(notReady.map(s => ({ status: s, entry: plan.entries.find(e => e.id === s.id) }))));
  }
  await tellStale(plan.entries, folder, io);
  return notReady.length === 0 ? 0 : 1;
}

async function check(folder: string, entryId: string | undefined, json: boolean, io: Io): Promise<number> {
  const { plan } = await loadPlan(folder, io);
  const results = await checkEntries(plan.entries, folder, {
    entryId, token: io.cancel,
    secretsNextStep: 'Run setup (onboard.mjs run), which reads them from the secret store without showing them.',
  });
  if (json) {
    io.out(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      const word = r.ready === null ? 'unknown' : r.ready ? 'ready' : 'not ready';
      io.out(`${word.padEnd(10)}${r.title} (${r.id})`);
      if (r.ready !== true && r.output) {
        io.out(r.output.split('\n').map(l => `    ${l}`).join('\n'));
      }
    }
  }
  return results.every(r => r.ready) ? 0 : 1;
}

async function sha(folder: string, [file, heading]: string[], json: boolean, io: Io): Promise<number> {
  if (!file || !heading) {
    throw new Error('Give the file and the heading, such as: sha README.md "## Run locally"');
  }
  const sha256 = await sectionShaOfFile(folder, file, heading);
  io.out(json ? JSON.stringify({ file, section: heading, sha256 }) : sha256);
  return 0;
}

async function stale(folder: string, io: Io): Promise<number> {
  const project = await readManifest(folder);
  if (!project) {
    throw new Error(`There is no ${MANIFEST_FILE} in ${folder}. Give the project folder with --project.`);
  }
  const changed = await findStale(project.entries, folder);
  if (changed.length === 0) {
    io.out(`No README section behind ${MANIFEST_FILE} has changed.`);
    return 0;
  }
  io.out(staleMessage(changed));
  for (const e of changed) {
    io.out(`- ${e.id}: ${e.from!.file} section "${e.from!.section}"${e.from!.source === 'person' ? ', a team choice' : ''}`);
  }
  return 1;
}

async function status(folder: string, io: Io): Promise<number> {
  const recorded = await readStatus(folder);
  if (!recorded || Object.keys(recorded.entries).length === 0) {
    io.out('Setup has not run on this computer yet.');
    return 1;
  }
  const entries = (await readManifest(folder).catch(() => undefined))?.entries ?? [];
  const statuses: EntryStatus[] = Object.entries(recorded.entries).map(([id, r]) => ({
    id, title: r.title, state: r.state, ...(r.detail ? { detail: r.detail } : {}), ...(r.because ? { because: r.because } : {}),
  }));
  io.out(recorded.run_finished
    ? `Last setup finished ${recorded.run_finished}.`
    : `A setup run started ${recorded.run_started} and has not finished.`);
  statuses.forEach(s => io.out(lineFor(s)));
  const notReady = statuses.filter(s => s.state !== 'ready');
  if (notReady.length > 0) {
    io.out('');
    io.out(failureDetails(notReady.map(s => ({ status: s, entry: entries.find(e => e.id === s.id) }))));
  }
  return notReady.length === 0 ? 0 : 1;
}

/** Mentions README sections that changed under the manifest, so the agent can offer to update it. */
async function tellStale(entries: Entry[], folder: string, io: Io): Promise<void> {
  const changed = await findStale(entries, folder).catch(() => []);
  if (changed.length > 0) {
    io.out(`\n${staleMessage(changed)} Run "onboard.mjs stale" for the list.`);
  }
}

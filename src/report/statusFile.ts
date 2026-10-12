import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parse, stringify } from 'yaml';
import type { Entry } from '../manifest/manifest';
import type { Because, EntryState, EntryStatus, SetupReporter } from './report';

/**
 * This computer's setup results for one project, in `.onboarding/status.yaml`. Setup writes
 * it as it runs; the Onboarding list and anything else that shows results read it.
 * The folder holds its own .gitignore, so the file is never committed.
 */
export const STATUS_DIR = '.onboarding';
export const STATUS_FILE = 'status.yaml';

export interface EntryRecord {
  title: string;
  state: EntryState;
  detail?: string;
  because?: Because;
  last_ran?: string;   // when this entry last finished
  proven?: string;     // definitionHash of the entry when it was proven on this computer
}

export interface Status {
  run_started?: string;
  run_finished?: string | null;   // null while a run is going
  machine: string;
  platform: 'windows' | 'macos' | 'linux';
  entries: Record<string, EntryRecord>;
}

export function statusPath(folder: string): string {
  return path.join(folder, STATUS_DIR, STATUS_FILE);
}

/** The status file, or undefined when there is none or it cannot be read. */
export async function readStatus(folder: string): Promise<Status | undefined> {
  try {
    const data = parse(await fs.readFile(statusPath(folder), 'utf8')) as Status | null;
    return data && typeof data === 'object' && data.entries && typeof data.entries === 'object' ? data : undefined;
  } catch {
    return undefined;
  }
}

/** Writes the whole file at once, so a reader never sees half of it. */
export async function writeStatus(folder: string, status: Status): Promise<void> {
  const dir = path.join(folder, STATUS_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, '.gitignore'), '# Written by the Onboarding extension. Results for this computer only.\n*\n',
    { flag: 'wx' }).catch(() => undefined);
  const file = statusPath(folder);
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `# Setup results for this computer. Written by the Onboarding extension.\n${stringify(status)}`);
  await fs.rename(temp, file);
}

export function emptyStatus(): Status {
  return { machine: os.hostname(), platform: platformName(), entries: {} };
}

function platformName(): Status['platform'] {
  return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
}

/** The entry id -> definition hash of entries proven on this computer, as runSetup takes it. */
export function provenFrom(status: Status | undefined): Map<string, string> {
  return new Map(Object.entries(status?.entries ?? {})
    .filter(([, record]) => record.proven)
    .map(([id, record]) => [id, record.proven!]));
}

/**
 * Records a setup run in the status file as it goes. Reads `proven` at each update, since
 * runSetup changes it just before reporting an entry's result.
 */
export class StatusRecorder implements SetupReporter {
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly folder: string,
    private status: Status,
    private readonly proven: Map<string, string>,
    private readonly onError: (err: Error) => void = () => undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  begin(entries: Entry[]): void {
    const previous = this.status.entries;
    this.status = {
      run_started: this.now().toISOString(),
      run_finished: null,
      machine: os.hostname(),
      platform: platformName(),
      entries: Object.fromEntries(entries.map(e => [e.id, {
        ...previous[e.id],
        title: e.title ?? e.id,
        state: 'waiting' as EntryState,
      }])),
    };
    this.save();
  }

  update(status: EntryStatus): void {
    const finished = !['waiting', 'checking', 'fixing', 'proving'].includes(status.state);
    const previous = this.status.entries[status.id];
    const record: EntryRecord = { title: status.title, state: status.state };
    if (status.detail) {
      record.detail = status.detail;
    }
    if (status.because) {
      record.because = status.because;
    }
    const lastRan = finished ? this.now().toISOString() : previous?.last_ran;
    if (lastRan) {
      record.last_ran = lastRan;
    }
    const proven = this.proven.get(status.id);
    if (proven) {
      record.proven = proven;
    }
    this.status.entries[status.id] = record;
    this.save();
  }

  end(): void {
    this.status.run_finished = this.now().toISOString();
    this.save();
  }

  /** Resolves when everything reported so far is on disk. */
  saved(): Promise<void> {
    return this.writing;
  }

  private save(): void {
    const snapshot = structuredClone(this.status);
    // One write at a time, in order, so the last state reported is the one on disk.
    this.writing = this.writing.then(() => writeStatus(this.folder, snapshot)).catch(err => this.onError(err as Error));
  }
}

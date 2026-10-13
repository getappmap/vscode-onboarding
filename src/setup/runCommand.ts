import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { Command } from '../manifest/manifest';

export interface CommandResult {
  ok: boolean;       // exit code 0
  exitCode: number;  // -1 when the command never ran or was stopped
  output: string;    // last lines only, secrets masked
  stopped?: 'timeout' | 'cancelled';
}

export interface RunOptions {
  /** Values to hide from the output, such as secrets passed in env. */
  secrets?: string[];
  /** Stop the command after this long. Default 10 minutes. */
  timeoutMs?: number;
  /** How many lines of output to keep. Default 40. */
  maxLines?: number;
}

export interface Shell {
  program: string;
  args: (script: string) => string[];
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_LINES = 40;
const MAX_BUFFER_BYTES = 64 * 1024;
const CANCEL_POLL_MS = 200;
const MASK = '***';

/**
 * Makes errors fail the command, and stops progress bars, which PowerShell would
 * otherwise write to the output as XML.
 */
const POWERSHELL_PRELUDE = "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'\n";

/** PowerShell 7 (pwsh) on Windows, falling back to Windows PowerShell; sh elsewhere. */
export function pickShell(platform: NodeJS.Platform = process.platform): Shell {
  if (platform !== 'win32') {
    return { program: '/bin/sh', args: script => ['-c', script] };
  }
  return {
    program: findOnPath('pwsh.exe') ?? 'powershell.exe',
    // The script goes in base64 so its quotes and $ signs reach PowerShell unchanged.
    args: script => ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
      Buffer.from(POWERSHELL_PRELUDE + script, 'utf16le').toString('base64')],
  };
}

function findOnPath(program: string): string | undefined {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, program);
    if (dir && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/** The text to run on this computer, or undefined if the entry has no form for it. */
export function commandFor(command: Command, platform: NodeJS.Platform = process.platform): string | undefined {
  if (typeof command === 'string') {
    return command;
  }
  return platform === 'win32' ? command.windows : command.posix;
}

/**
 * Runs one command in the project folder. A command fails by exiting non-zero;
 * in PowerShell, by `exit 1` or by throwing an error.
 */
export async function runCommand(
  command: Command, cwd: string, env: Record<string, string>, token?: { isCancellationRequested: boolean },
  options: RunOptions = {},
): Promise<CommandResult> {
  const script = commandFor(command);
  if (script === undefined) {
    const os = process.platform === 'win32' ? 'Windows' : 'macOS and Linux';
    return { ok: false, exitCode: -1, output: `This setup step has no command for ${os}.` };
  }
  if (token?.isCancellationRequested) {
    return { ok: false, exitCode: -1, output: 'Cancelled before it started.', stopped: 'cancelled' };
  }

  const shell = pickShell();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const finish = (exitCode: number, raw: string, note?: string, stopped?: CommandResult['stopped']) => ({
    ok: exitCode === 0 && !stopped,
    exitCode: stopped ? -1 : exitCode,
    output: lastLines(mask(raw, options.secrets ?? []), options.maxLines ?? DEFAULT_MAX_LINES, note),
    ...(stopped ? { stopped } : {}),
  });

  return new Promise<CommandResult>(resolve => {
    const child = spawn(shell.program, shell.args(script), {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // Its own process group on macOS and Linux, so a stop reaches every child it started.
      detached: process.platform !== 'win32',
    });

    const output = new TailBuffer(MAX_BUFFER_BYTES);
    child.stdout.on('data', (chunk: Buffer) => output.add(chunk));
    child.stderr.on('data', (chunk: Buffer) => output.add(chunk));

    let stopped: CommandResult['stopped'];
    const stop = (why: NonNullable<CommandResult['stopped']>) => {
      if (!stopped) {
        stopped = why;
        killTree(child.pid);
      }
    };
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    const poll = setInterval(() => token?.isCancellationRequested && stop('cancelled'), CANCEL_POLL_MS);
    const cleanUp = () => {
      clearTimeout(timer);
      clearInterval(poll);
    };

    child.on('error', err => {
      cleanUp();
      resolve(finish(-1, output.text(), `Could not start ${shell.program}: ${err.message}`));
    });
    child.on('close', code => {
      cleanUp();
      const seconds = Math.max(1, Math.round(timeoutMs / 1000));
      const note = stopped === 'timeout' ? `Stopped after ${seconds} second${seconds === 1 ? '' : 's'}.`
        : stopped === 'cancelled' ? 'Cancelled.'
          : undefined;
      resolve(finish(code ?? -1, output.text(), note, stopped));
    });
  });
}

/** Stops a process and every process it started. */
function killTree(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

/** Keeps only the last bytes written, so a noisy command cannot fill memory. */
class TailBuffer {
  private chunks: Buffer[] = [];
  private size = 0;
  private dropped = false;

  constructor(private readonly limit: number) {}

  add(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
    while (this.size - this.chunks[0].length >= this.limit) {
      this.size -= this.chunks.shift()!.length;
      this.dropped = true;
    }
  }

  text(): string {
    const text = Buffer.concat(this.chunks).toString('utf8');
    // The first line may have been cut part way through, so it is dropped.
    return this.dropped ? text.slice(text.indexOf('\n') + 1) : text;
  }
}

/** Replaces every secret value with ***. A secret over several lines is also hidden line by line. */
export function mask(text: string, secrets: string[]): string {
  const pieces = new Set<string>();
  for (const secret of secrets) {
    if (!secret) {
      continue;
    }
    pieces.add(secret);
    for (const line of secret.split(/\r?\n/)) {
      if (line.trim().length >= 4) {
        pieces.add(line);
      }
    }
  }
  // Longest first, so a secret that contains another is hidden whole.
  for (const piece of [...pieces].sort((a, b) => b.length - a.length)) {
    text = text.split(piece).join(MASK);
  }
  return text;
}

function lastLines(text: string, maxLines: number, note?: string): string {
  const lines = text.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const kept = lines.length > maxLines ? ['…', ...lines.slice(-maxLines)] : lines;
  if (note) {
    kept.push(note);
  }
  return kept.join('\n').trim();
}

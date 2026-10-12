import { Command } from '../manifest/manifest';

export interface CommandResult {
  ok: boolean;       // exit code 0
  exitCode: number;
  output: string;    // last lines only, secrets masked
}

/** PowerShell 7 (pwsh) on Windows, falling back to Windows PowerShell; sh elsewhere. */
export function pickShell(): { program: string; args: (script: string) => string[] } {
  throw new Error('TODO: choose the shell for this computer');
}

/** The text to run on this computer, or undefined if the entry has no form for it. */
export function commandFor(command: Command): string | undefined {
  throw new Error('TODO: plain string, or the windows / posix form');
}

/**
 * Runs one command in the project folder. A command fails by exiting non-zero;
 * in PowerShell, by `exit 1` or by throwing an error.
 */
export async function runCommand(
  command: Command, cwd: string, env: Record<string, string>, token?: { isCancellationRequested: boolean },
): Promise<CommandResult> {
  throw new Error('TODO: spawn the shell, capture output, mask secret values, apply a time limit');
}

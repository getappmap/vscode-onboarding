import type { Entry } from '../manifest/manifest';
import type { CommandResult } from '../setup/runCommand';
import type { CommandOutput, Step } from '../setup/runSetup';
import type { EntryStatus, SetupReporter } from './report';

export const OUTPUT_CHANNEL = 'Onboarding Setup';

/**
 * Writes a setup run to an output channel as it happens: each command, its output line by
 * line, how it ended, and each entry's result. For example:
 *
 *   ── Setup started 12:52:03, 3 steps ──
 *   ▶ ruby check: sh bin/onboarding/ruby.sh check
 *       ruby 3.4.9 is not 3.4.10
 *     ✘ exit 1, 0.4s
 *   ▶ ruby fix: sh bin/onboarding/ruby.sh fix
 *   ...
 *   ✔ ruby: ready
 *   ── Setup finished 12:53:40: 2 ready, 1 not ready ──
 */
export class SetupOutput implements SetupReporter, CommandOutput {
  constructor(
    private readonly channel: { appendLine(text: string): void },
    private readonly now: () => Date = () => new Date(),
  ) {}

  begin(entries: Entry[]): void {
    this.channel.appendLine('');
    this.channel.appendLine(`── Setup started ${this.time()}, ${plural(entries.length, 'step')} ──`);
  }

  update(status: EntryStatus): void {
    const reason = status.detail?.split('\n')[0];
    switch (status.state) {
      case 'ready':
        this.channel.appendLine(`✔ ${status.id}: ${status.because === 'proven-earlier' ? 'ready, proven earlier' : 'ready'}`);
        break;
      case 'failed':
        this.channel.appendLine(`✘ ${status.id}: ${reason ?? 'failed'}`);
        break;
      case 'skipped':
        this.channel.appendLine(`⊘ ${status.id}: skipped. ${reason ?? ''}`.trimEnd());
        break;
    }
  }

  end(statuses: EntryStatus[]): void {
    const ready = statuses.filter(s => s.state === 'ready').length;
    const notReady = statuses.length - ready;
    this.channel.appendLine(`── Setup finished ${this.time()}: ${ready} ready${notReady ? `, ${notReady} not ready` : ''} ──`);
  }

  commandStarted(entry: Entry, step: Step, command: string): void {
    const [first, ...rest] = command.trim().split('\n');
    this.channel.appendLine(`▶ ${entry.id} ${step}: ${first}`);
    rest.forEach(line => this.channel.appendLine(`    ${line}`));
  }

  commandLine(line: string): void {
    this.channel.appendLine(`    ${line}`);
  }

  commandEnded(result: CommandResult, ms: number): void {
    const seconds = `${(ms / 1000).toFixed(1)}s`;
    if (result.stopped) {
      this.channel.appendLine(`  ✘ ${result.stopped === 'timeout' ? 'stopped at the time limit' : 'cancelled'}, ${seconds}`);
    } else {
      this.channel.appendLine(`  ${result.ok ? '✔' : '✘'} exit ${result.exitCode}, ${seconds}`);
    }
  }

  private time(): string {
    return this.now().toTimeString().slice(0, 8);
  }
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

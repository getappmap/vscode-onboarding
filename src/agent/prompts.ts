import { stringify } from 'yaml';
import type { Entry } from '../manifest/manifest';
import type { EntryStatus } from '../report/report';

const STATE_WORDS: Partial<Record<EntryStatus['state'], string>> = {
  'failed': 'failed',
  'skipped': 'was skipped',
  'needs-approval': 'is waiting for approval',
};

/**
 * The prompt that asks the troubleshooter skill about entries that are not ready. It holds
 * what the developer can already see: the result, the entry as written in onboarding.yaml
 * (secret paths, never values), and the team's troubleshooting note.
 */
export function troubleshootPrompt(items: { status: EntryStatus; entry?: Entry }[]): string {
  const names = items.map(({ status }) => `"${status.title}"`).join(', ');
  const parts = [
    `/troubleshooter Onboarding setup could not finish ${names} in this repository. Help me find out why and fix it.`,
  ];
  for (const { status, entry } of items) {
    parts.push(`## ${status.title} ${STATE_WORDS[status.state] ?? `is ${status.state}`}`);
    if (status.detail) {
      parts.push(`What happened:\n\n\`\`\`text\n${status.detail}\n\`\`\``);
    }
    if (entry) {
      const { troubleshooting, ...written } = entry;
      parts.push(`Its entry in onboarding.yaml:\n\n\`\`\`yaml\n${stringify([written]).trimEnd()}\n\`\`\``);
      if (troubleshooting) {
        parts.push(`Notes from the team:\n\n${troubleshooting.trimEnd()}`);
      }
    }
  }
  return parts.join('\n\n');
}

import type { Entry } from '../manifest/manifest';
import { EntryState, EntryStatus, PROBLEMS, stateText } from './report';

/** What the status view's page asks the extension to do. */
export type PageMessage =
  | { command: 'list' }
  | { command: 'entry'; id: string }
  | { command: 'openManifest'; id: string }
  | { command: 'askCopilot'; id: string }
  | { command: 'runSetup' };

/** Everything the entry page shows about one entry. */
export interface EntryDetails {
  status: EntryStatus;
  entry?: Entry;
  /** True when the project's onboarding.yaml has this entry; false when only the Org or Team layer does. */
  inProjectManifest: boolean;
  /** The entries it depends on. No status means the id is not in the setup plan. */
  dependsOn: { id: string; status?: EntryStatus }[];
}

export type Page =
  | { kind: 'list'; statuses: EntryStatus[] }
  | { kind: 'entry'; details: EntryDetails };

/** A glyph and a theme color for each state, like the icons in the sidebar list. */
const STATE_MARK: Record<EntryState, [glyph: string, color: string]> = {
  'unchecked': ['○', '--vscode-descriptionForeground'],
  'waiting': ['◷', '--vscode-descriptionForeground'],
  'checking': ['↻', '--vscode-progressBar-background'],
  'fixing': ['↻', '--vscode-progressBar-background'],
  'proving': ['↻', '--vscode-progressBar-background'],
  'ready': ['✓', '--vscode-testing-iconPassed'],
  'failed': ['✕', '--vscode-testing-iconFailed'],
  'skipped': ['⊘', '--vscode-disabledForeground'],
};

/**
 * The status view's HTML. Links and buttons carry `data-command` (and `data-id`); the page's
 * script posts them to the extension as a PageMessage. Nothing loads from outside the page.
 */
export function renderPage(page: Page, cspSource: string, nonce: string): string {
  const body = page.kind === 'list' ? listBody(page.statuses) : entryBody(page.details);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Onboarding</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
${body}
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}

function listBody(statuses: EntryStatus[]): string {
  const ready = statuses.filter(s => s.state === 'ready').length;
  const rows = statuses.map(s => `<li><a href="#" data-command="entry" data-id="${escape(s.id)}">${mark(s.state)}`
    + `<span class="title">${escape(s.title)}</span><span class="state">${escape(stateText(s))}</span></a></li>`);
  return `<header>
<h1>Onboarding</h1>
<button data-command="runSetup">Run Setup</button>
</header>
<p class="summary">${ready} of ${statuses.length} ready</p>
${statuses.length > 0 ? `<ul class="entries">${rows.join('\n')}</ul>` : '<p>There are no setup steps.</p>'}`;
}

function entryBody({ status, entry, inProjectManifest, dependsOn }: EntryDetails): string {
  const parts = [
    '<nav><a href="#" data-command="list">← All entries</a></nav>',
    `<header><h1>${mark(status.state)}${escape(status.title)}</h1><span class="state">${escape(stateText(status))}</span></header>`,
  ];
  if (status.detail) {
    parts.push(`<h2>What happened</h2><pre>${escape(status.detail)}</pre>`);
  }
  if (entry?.failMessage) {
    parts.push(`<h2>What to do</h2><p>${escape(entry.failMessage)}</p>`);
  }
  if (entry?.troubleshooting) {
    parts.push(`<h2>Notes from the team</h2><pre class="notes">${escape(entry.troubleshooting)}</pre>`);
  }
  if (status.provenAt) {
    const when = new Date(status.provenAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    parts.push(`<p>Last proven on this computer: ${escape(when)}.</p>`);
  }
  if (dependsOn.length > 0) {
    const items = dependsOn.map(({ id, status: dep }) => dep
      ? `<li><a href="#" data-command="entry" data-id="${escape(id)}">${mark(dep.state)}`
        + `<span class="title">${escape(dep.title)}</span><span class="state">${escape(stateText(dep))}</span></a></li>`
      : `<li><span class="row"><span class="mark"></span>${escape(id)}<span class="state">is not in the setup plan</span></span></li>`);
    parts.push(`<h2>Depends on</h2><ul class="entries">${items.join('\n')}</ul>`);
  }

  const actions = [inProjectManifest
    ? `<a href="#" data-command="openManifest" data-id="${escape(status.id)}">Open in onboarding.yaml</a>`
    : '<span class="state">This entry comes from the Org or Team settings, not onboarding.yaml.</span>'];
  if (PROBLEMS.includes(status.state)) {
    actions.push(`<button data-command="askCopilot" data-id="${escape(status.id)}">Ask Copilot to Help</button>`);
  }
  parts.push(`<footer>${actions.join('\n')}</footer>`);
  return parts.join('\n');
}

function mark(state: EntryState): string {
  const [glyph] = STATE_MARK[state];
  return `<span class="mark mark-${state}" aria-hidden="true">${glyph}</span>`;
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const STYLE = `
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground);
  background: var(--vscode-editor-background); padding: 16px 24px; max-width: 760px; }
header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
h1 { font-size: 1.5em; font-weight: 600; margin: 8px 0; }
h2 { font-size: 1.1em; font-weight: 600; margin: 20px 0 6px; }
a { color: var(--vscode-textLink-foreground); text-decoration: none; }
a:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
.state, .summary { color: var(--vscode-descriptionForeground); }
.mark { display: inline-block; width: 1.3em; text-align: center; margin-right: 4px; }
ul.entries { list-style: none; padding: 0; margin: 0; }
ul.entries a, ul.entries .row { display: flex; align-items: baseline; gap: 8px; padding: 4px 6px; border-radius: 3px; color: inherit; }
ul.entries a:hover { background: var(--vscode-list-hoverBackground); text-decoration: none; }
ul.entries .title { flex: none; }
ul.entries .state { margin-left: auto; }
pre { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size);
  background: var(--vscode-textCodeBlock-background); padding: 8px 10px; border-radius: 3px; margin: 0; }
pre.notes { font-family: inherit; font-size: inherit; }
footer { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 24px; padding-top: 12px;
  border-top: 1px solid var(--vscode-panel-border); }
button { font: inherit; color: var(--vscode-button-foreground); background: var(--vscode-button-background);
  border: none; border-radius: 2px; padding: 4px 12px; cursor: pointer; }
button:hover { background: var(--vscode-button-hoverBackground); }
header button { margin-left: auto; }
${Object.entries(STATE_MARK).map(([state, [, color]]) => `.mark-${state} { color: var(${color}); }`).join('\n')}
`;

const SCRIPT = `
const vscode = acquireVsCodeApi();
document.addEventListener('click', event => {
  const target = event.target.closest('[data-command]');
  if (!target) {
    return;
  }
  event.preventDefault();
  vscode.postMessage(target.dataset.id === undefined
    ? { command: target.dataset.command }
    : { command: target.dataset.command, id: target.dataset.id });
});
`;

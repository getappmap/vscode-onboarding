import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import type { Entry } from '../manifest/manifest';
import type { EntryStatus } from './report';
import { EntryDetails, Page, PageMessage, renderPage } from './statusPage';

/** What the status view needs from the rest of the extension. */
export interface StatusViewHost {
  /** The rows the sidebar shows now, in the same order. */
  statuses(): EntryStatus[];
  entry(id: string): Entry | undefined;
  /** True when the project's onboarding.yaml has this entry. */
  inProjectManifest(id: string): boolean;
  openInManifest(id: string): Promise<void>;
  askCopilot(status: EntryStatus): Promise<void>;
  runSetup(): Promise<void>;
}

export const STATUS_VIEW = 'onboarding.status';

/**
 * The status view: one editor tab that shows either the list of entries, like the sidebar,
 * or one entry's page. It shows new results as they arrive.
 */
export class StatusView implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private showing: { kind: 'list' } | { kind: 'entry'; id: string } = { kind: 'list' };
  private readonly listener: vscode.Disposable;

  constructor(private readonly host: StatusViewHost, changed: vscode.Event<unknown>) {
    this.listener = changed(() => this.render());
  }

  showList(): void {
    this.showing = { kind: 'list' };
    this.open();
  }

  showEntry(id: string): void {
    this.showing = { kind: 'entry', id };
    this.open();
  }

  dispose(): void {
    this.listener.dispose();
    this.panel?.dispose();
  }

  private open(): void {
    if (this.panel) {
      this.render();
      this.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(STATUS_VIEW, 'Onboarding', vscode.ViewColumn.Active,
      { enableScripts: true, localResourceRoots: [] });
    panel.iconPath = new vscode.ThemeIcon('checklist');
    panel.onDidDispose(() => (this.panel = undefined));
    panel.webview.onDidReceiveMessage((message: PageMessage) => void this.receive(message));
    this.panel = panel;
    this.render();
  }

  private render(): void {
    if (!this.panel) {
      return;
    }
    const page = this.page();
    this.panel.title = page.kind === 'entry' ? `Onboarding: ${page.details.status.title}` : 'Onboarding';
    this.panel.webview.html = renderPage(page, this.panel.webview.cspSource, randomBytes(16).toString('base64'));
  }

  /** The page to show. An entry that is no longer in the plan shows the list instead. */
  private page(): Page {
    const statuses = this.host.statuses();
    const status = this.showing.kind === 'entry' ? find(statuses, this.showing.id) : undefined;
    if (!status) {
      this.showing = { kind: 'list' };
      return { kind: 'list', statuses };
    }
    const entry = this.host.entry(status.id);
    const details: EntryDetails = {
      status,
      entry,
      inProjectManifest: this.host.inProjectManifest(status.id),
      dependsOn: (entry?.dependsOn ?? []).map(id => ({ id, status: find(statuses, id) })),
    };
    return { kind: 'entry', details };
  }

  private async receive(message: PageMessage): Promise<void> {
    switch (message.command) {
      case 'list':
        this.showList();
        return;
      case 'runSetup':
        await this.host.runSetup();
        return;
    }
    // The rest name an entry. The page is ours, but check the id anyway.
    const status = find(this.host.statuses(), message.id);
    if (!status) {
      return;
    }
    switch (message.command) {
      case 'entry':
        this.showEntry(status.id);
        return;
      case 'openManifest':
        await this.host.openInManifest(status.id);
        return;
      case 'askCopilot':
        await this.host.askCopilot(status);
        return;
    }
  }
}

function find(statuses: EntryStatus[], id: unknown): EntryStatus | undefined {
  return statuses.find(s => s.id === id);
}

import * as vscode from 'vscode';
import { getAgentHost } from './agent/agentHost';
import { troubleshootPrompt } from './agent/prompts';
import { Entry, MANIFEST_FILE, Manifest, combineLayers, readManifest } from './manifest/manifest';
import { ManifestMcpProvider, PROVIDER_ID } from './connections/mcpServers';
import { EntryStatus, SetupReport, rowsBeforeRun } from './report/report';
import { runSetup } from './setup/runSetup';
import { CheckEntriesTool } from './tools/checkEntriesTool';
import { fetchOrgSettings, readSecret } from './company/company';

// Kept per workspace, on this computer only.
const PROVEN_KEY = 'onboarding.proven';            // entry id -> definition hash
const LAST_RESULTS_KEY = 'onboarding.lastResults'; // entry id -> EntryStatus

const RUN_FIX = 'Run Fix';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const log = vscode.window.createOutputChannel('Onboarding', { log: true });
  let plan: Manifest = { entries: [], mcpServers: [] };
  let preApproved = new Set<string>();
  let running = false;

  const report = new SetupReport();
  const mcp = new ManifestMcpProvider(readSecret);
  const state = context.workspaceState;

  const reload = async () => {
    if (!folder) {
      return;
    }
    let project: Manifest | undefined;
    try {
      project = await readManifest(folder.uri);
    } catch (err) {
      log.error((err as Error).message);
      void vscode.window.showErrorMessage(`${MANIFEST_FILE} cannot be used. ${firstLine(err)}`, 'Show Details')
        .then(choice => choice && log.show());
    }

    let layers: Manifest[] = [];
    try {
      const org = await fetchOrgSettings(project?.team);
      layers = org.layers;
      preApproved = new Set(org.preApproved);
    } catch (err) {
      log.warn(`Org and Team settings not loaded, so only ${MANIFEST_FILE} is used: ${(err as Error).message}`);
      preApproved = new Set();
    }

    plan = combineLayers(project ? [...layers, project] : layers);
    mcp.update(plan.mcpServers);
    if (!running) {
      report.show(rowsBeforeRun(plan.entries, state.get(LAST_RESULTS_KEY, {}), state.get(PROVEN_KEY, {})));
    }
    // TODO: warn about guessed values whose README text changed (findStale, notifyStale).
  };

  const readSecrets = async (paths: Record<string, string>) => {
    const values: Record<string, string> = {};
    for (const [name, path] of Object.entries(paths)) {
      const value = await readSecret(path);
      if (value !== undefined) {
        values[name] = value;
      }
    }
    return values;
  };

  const askToFix = async (entry: Entry, command: string) => {
    const choice = await vscode.window.showWarningMessage(
      `Run the fix for "${entry.title ?? entry.id}"?`,
      { modal: true, detail: `This command will run in ${folder?.name}:\n\n${command}` },
      RUN_FIX);
    return choice === RUN_FIX;
  };

  /** Runs setup and returns each entry's result, or undefined when it could not start. */
  const runProjectSetup = async (reprove: boolean): Promise<EntryStatus[] | undefined> => {
    if (!folder) {
      void vscode.window.showInformationMessage('Open a project folder to set it up.');
      return undefined;
    }
    if (!vscode.workspace.isTrusted) {
      const choice = await vscode.window.showWarningMessage(
        `Setup runs the commands in ${MANIFEST_FILE}, so it runs only in a folder you trust.`, 'Manage Workspace Trust');
      if (choice) {
        await vscode.commands.executeCommand('workbench.trust.manage');
      }
      return undefined;
    }
    if (plan.entries.length === 0) {
      const choice = await vscode.window.showInformationMessage(
        `There is nothing to set up: this folder has no entries in ${MANIFEST_FILE}.`, 'Draft Manifest');
      if (choice) {
        await vscode.commands.executeCommand('onboarding.draftManifest');
      }
      return undefined;
    }
    if (running) {
      void vscode.window.showInformationMessage('Project setup is already running.');
      return undefined;
    }

    running = true;
    const proven = new Map(Object.entries(state.get<Record<string, string>>(PROVEN_KEY, {})));
    try {
      const statuses = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Project setup', cancellable: true },
        (progress, token) => {
          report.attachProgress(progress);
          return runSetup(plan.entries, {
            folder: folder.uri, preApproved, readSecrets, askToFix, reporter: report, token, proven, reprove,
          });
        });
      await state.update(LAST_RESULTS_KEY, Object.fromEntries(statuses.map(s => [s.id, s])));
      return statuses;
    } catch (err) {
      log.error((err as Error).message);
      void vscode.window.showErrorMessage(`Project setup stopped. ${firstLine(err)}`);
      return undefined;
    } finally {
      running = false;
      await state.update(PROVEN_KEY, Object.fromEntries(proven));
    }
  };

  const askCopilot = async (statuses: EntryStatus[]) => {
    if (statuses.length === 0) {
      void vscode.window.showInformationMessage('Every setup entry is ready.');
      return;
    }
    const items = statuses.map(status => ({ status, entry: plan.entries.find(e => e.id === status.id) }));
    await getAgentHost().openChat(troubleshootPrompt(items));
  };

  context.subscriptions.push(
    log,
    vscode.window.registerTreeDataProvider('onboarding.report', report),
    vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID, mcp),
    vscode.lm.registerTool(CheckEntriesTool.NAME, new CheckEntriesTool(() => plan.entries)),
    vscode.commands.registerCommand('onboarding.runSetup', () => runProjectSetup(false)),
    vscode.commands.registerCommand('onboarding.reproveSetup', () => runProjectSetup(true)),
    vscode.commands.registerCommand('onboarding.askCopilot', () => askCopilot(report.notReady())),
    // The button on a row passes that row.
    vscode.commands.registerCommand('onboarding.askCopilotAboutEntry', (status: EntryStatus) => askCopilot([status])),
    vscode.commands.registerCommand('onboarding.draftManifest', () =>
      getAgentHost().openChat('/manifest-writer Draft onboarding.yaml for this repository.')),
  );

  if (folder) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, MANIFEST_FILE));
    const onChange = () => void reload();
    context.subscriptions.push(watcher, watcher.onDidChange(onChange), watcher.onDidCreate(onChange),
      watcher.onDidDelete(onChange));
    // TODO: also watch **/*.md for the README check.
  }
  await reload();
}

export function deactivate(): void {}

function firstLine(err: unknown): string {
  return String((err as Error).message ?? err).split('\n')[0];
}

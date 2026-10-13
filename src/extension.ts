import * as vscode from 'vscode';
import { getAgentHost } from './agent/agentHost';
import { troubleshootPrompt } from './agent/prompts';
import { Entry, MANIFEST_FILE, Manifest, combineLayers, readManifest } from './manifest/manifest';
import { ManifestMcpProvider, PROVIDER_ID } from './connections/mcpServers';
import { EntryStatus, SetupReport, allOf, rowsBeforeRun } from './report/report';
import { STATUS_DIR, STATUS_FILE, StatusRecorder, emptyStatus, provenFrom, readStatus } from './report/statusFile';
import { runSetup } from './setup/runSetup';
import { CheckEntriesTool } from './tools/checkEntriesTool';
import { fetchOrgSettings, readSecret } from './company/company';

const RUN_FIX = 'Run Fix';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Register the list before anything else, with nothing to wait for first: until then,
  // VS Code shows "There is no data provider registered" in the view.
  const report = new SetupReport();
  context.subscriptions.push(vscode.window.registerTreeDataProvider('onboarding.report', report));

  const folder = vscode.workspace.workspaceFolders?.[0];
  const log = vscode.window.createOutputChannel('Onboarding', { log: true });
  // Chooses the message the empty view shows; see viewsWelcome in package.json.
  const setViewState = (state: 'loading' | 'no-folder' | 'invalid' | 'empty' | 'ready') =>
    vscode.commands.executeCommand('setContext', 'onboarding.viewState', state);
  void setViewState(folder ? 'loading' : 'no-folder');
  let plan: Manifest = { entries: [], mcpServers: [] };
  let preApproved = new Set<string>();
  let running = false;

  const mcp = new ManifestMcpProvider(readSecret, folder?.uri);

  /** Shows the last results from the status file. Skipped while setup runs, since it shows live results then. */
  const showLastResults = async () => {
    if (folder && !running) {
      report.show(rowsBeforeRun(plan.entries, (await readStatus(folder.uri.fsPath))?.entries ?? {}));
    }
  };

  const reload = async () => {
    if (!folder) {
      return;
    }
    let project: Manifest | undefined;
    let invalid = false;
    try {
      project = await readManifest(folder.uri);
    } catch (err) {
      invalid = true;
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
    await showLastResults();
    await setViewState(invalid ? 'invalid' : plan.entries.length === 0 ? 'empty' : 'ready');
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
      void vscode.window.showInformationMessage('Onboarding setup is already running.');
      return undefined;
    }

    running = true;
    const status = await readStatus(folder.uri.fsPath) ?? emptyStatus();
    const proven = provenFrom(status);
    const recorder = new StatusRecorder(folder.uri.fsPath, status, proven,
      err => log.error(`Could not write ${STATUS_DIR}/${STATUS_FILE}: ${err.message}`));
    try {
      const statuses = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Onboarding', cancellable: true },
        (progress, token) => {
          report.attachProgress(progress);
          return runSetup(plan.entries, {
            folder: folder.uri, preApproved, readSecrets, reporter: allOf(report, recorder), token, proven, reprove,
            askToFix: vscode.workspace.getConfiguration('onboarding').get('askBeforeFixing', false) ? askToFix : undefined,
          });
        });
      return statuses;
    } catch (err) {
      log.error((err as Error).message);
      void vscode.window.showErrorMessage(`Onboarding setup stopped. ${firstLine(err)}`);
      return undefined;
    } finally {
      await recorder.saved();
      running = false;
      await showLastResults();
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
    vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID, mcp),
    vscode.lm.registerTool(CheckEntriesTool.NAME, new CheckEntriesTool(() => plan.entries)),
    vscode.commands.registerCommand('onboarding.runSetup', () => runProjectSetup(false)),
    vscode.commands.registerCommand('onboarding.reproveSetup', () => runProjectSetup(true)),
    vscode.commands.registerCommand('onboarding.askCopilot', () => askCopilot(report.notReady())),
    // The button on a row passes that row.
    vscode.commands.registerCommand('onboarding.askCopilotAboutEntry', (status: EntryStatus) => askCopilot([status])),
    vscode.commands.registerCommand('onboarding.showLog', () => log.show()),
    vscode.commands.registerCommand('onboarding.draftManifest', () =>
      getAgentHost().openChat('/manifest-writer Draft onboarding.yaml for this repository.')),
  );

  if (folder) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, MANIFEST_FILE));
    const onChange = () => void reload();
    context.subscriptions.push(watcher, watcher.onDidChange(onChange), watcher.onDidCreate(onChange),
      watcher.onDidDelete(onChange));
    // TODO: also watch **/*.md for the README check.

    // Another window, or a person, may change the results.
    const statusWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, `${STATUS_DIR}/${STATUS_FILE}`));
    const onStatusChange = () => void showLastResults();
    context.subscriptions.push(statusWatcher, statusWatcher.onDidChange(onStatusChange),
      statusWatcher.onDidCreate(onStatusChange), statusWatcher.onDidDelete(onStatusChange));
  }
  await reload();
}

export function deactivate(): void {}

function firstLine(err: unknown): string {
  return String((err as Error).message ?? err).split('\n')[0];
}

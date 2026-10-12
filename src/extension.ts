import * as vscode from 'vscode';
import { getAgentHost } from './agent/agentHost';
import { Manifest, combineLayers, readManifest } from './manifest/manifest';
import { ManifestMcpProvider, PROVIDER_ID } from './connections/mcpServers';
import { SetupReport } from './report/report';
import { runSetup } from './setup/runSetup';
import { CheckEntriesTool } from './tools/checkEntriesTool';
import { fetchOrgSettings, readSecret } from './company/company';
import { findStale, notifyStale } from './manifest/staleCheck';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  let plan: Manifest = { entries: [], mcpServers: [] };
  let preApproved = new Set<string>();

  const report = new SetupReport();
  const mcp = new ManifestMcpProvider(readSecret);

  const reload = async () => {
    // TODO: read the project manifest; fetch Org and Team layers (project alone if that fails);
    // combine; update mcp; notifyStale(await findStale(...)).
  };

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('onboarding.report', report),
    vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID, mcp),
    vscode.lm.registerTool(CheckEntriesTool.NAME, new CheckEntriesTool(() => plan.entries)),
    vscode.commands.registerCommand('onboarding.runSetup', async () => {
      // TODO: require a trusted folder; then, inside vscode.window.withProgress (cancellable):
      // runSetup(plan.entries, { folder, preApproved, readSecrets, reporter: report, token })
    }),
    vscode.commands.registerCommand('onboarding.askCopilot', async () => {
      // TODO: getAgentHost().openChat('/troubleshooter ' + the failed rows from the report)
    }),
    vscode.commands.registerCommand('onboarding.draftManifest', () =>
      getAgentHost().openChat('/manifest-writer Draft onboarding.yaml for this repository.')),
    // TODO: watch onboarding.yaml and **/*.md; call reload on change.
  );
  await reload();
}

export function deactivate(): void {}

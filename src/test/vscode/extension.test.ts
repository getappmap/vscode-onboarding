import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension', () => {
  test('activates in a folder with onboarding.yaml and registers its commands', async () => {
    const extension = vscode.extensions.getExtension('your-company.onboarding');
    assert.ok(extension, 'extension not found');
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'onboarding.runSetup', 'onboarding.stopSetup', 'onboarding.runEntry', 'onboarding.reproveSetup', 'onboarding.askCopilot', 'onboarding.askCopilotAboutEntry',
      'onboarding.showLog', 'onboarding.showOutput', 'onboarding.draftManifest', 'onboarding.showStatus', 'onboarding.showEntry',
    ]) {
      assert.ok(commands.includes(id), `${id} is not registered`);
    }
  });

  test('the status view opens as an editor tab', async () => {
    const isStatus = (tab: vscode.Tab) =>
      tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith('onboarding.status');
    const findTab = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).find(isStatus);
    // The tab list catches up with a new webview panel a moment later.
    const opened = new Promise<void>(resolve => {
      const listener = vscode.window.tabGroups.onDidChangeTabs(() => findTab() && (listener.dispose(), resolve()));
    });
    await vscode.commands.executeCommand('onboarding.showStatus');
    await Promise.race([opened, new Promise(resolve => setTimeout(resolve, 5_000))]);
    const status = findTab();
    assert.ok(status, 'no status view tab');
    await vscode.window.tabGroups.close(status);
  });

  test('the Onboarding list has its own Activity Bar icon', async () => {
    // VS Code adds this command for each Activity Bar container it accepts.
    const open = 'workbench.view.extension.onboarding';
    assert.ok((await vscode.commands.getCommands(true)).includes(open), 'no Activity Bar container');
    await vscode.commands.executeCommand(open);
  });

  test('the chat commands Copilot help relies on exist', async () => {
    // Built-in commands, not a stable API: this catches a VS Code release that renames them.
    const commands = await vscode.commands.getCommands(true);
    for (const id of ['workbench.action.chat.newChat', 'workbench.action.chat.open']) {
      assert.ok(commands.includes(id), `${id} is missing`);
    }
  });

  test('Copilot sees both onboarding tools', () => {
    const names = vscode.lm.tools.map(t => t.name);
    for (const name of ['onboarding_check_entries', 'onboarding_section_sha']) {
      assert.ok(names.includes(name), `${name} is not registered`);
    }
  });
});

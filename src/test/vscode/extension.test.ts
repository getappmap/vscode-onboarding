import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension', () => {
  test('activates in a folder with onboarding.yaml and registers its commands', async () => {
    const extension = vscode.extensions.getExtension('your-company.onboarding');
    assert.ok(extension, 'extension not found');
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'onboarding.runSetup', 'onboarding.reproveSetup', 'onboarding.askCopilot', 'onboarding.askCopilotAboutEntry',
      'onboarding.showLog', 'onboarding.draftManifest',
    ]) {
      assert.ok(commands.includes(id), `${id} is not registered`);
    }
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
});

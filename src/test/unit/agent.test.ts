import * as assert from 'assert';
import { CopilotAgentHost } from '../../agent/agentHost';
import { troubleshootPrompt } from '../../agent/prompts';
import { fake } from './vscode.fake';

suite('Copilot: opening the chat', () => {
  setup(() => fake.reset());

  test('starts a new session in agent mode and sends the prompt', async () => {
    await new CopilotAgentHost().openChat('/onboarding-setup help');
    assert.deepStrictEqual(fake.executed, ['workbench.action.chat.newChat', 'workbench.action.chat.open']);
    assert.deepStrictEqual(fake.executedArgs[1], [{ query: '/onboarding-setup help', isPartialQuery: false, mode: 'agent' }]);
  });

  test('says so when Copilot Chat cannot be opened', async () => {
    fake.failing.add('workbench.action.chat.open');
    await new CopilotAgentHost().openChat('hello');
    assert.strictEqual(fake.messages.length, 1);
    assert.match(fake.messages[0].message, /^Could not open Copilot Chat\. Is the GitHub Copilot Chat extension installed\?/);
  });

  test('is available when Copilot offers a chat model', async () => {
    assert.strictEqual(await new CopilotAgentHost().isAvailable(), false);
    fake.chatModels = [{ id: 'gpt' }];
    assert.strictEqual(await new CopilotAgentHost().isAvailable(), true);
  });
});

suite('Copilot: the troubleshooting prompt', () => {
  test('one entry: its result, its definition and the team notes', () => {
    const prompt = troubleshootPrompt([{
      status: { id: 'splunk', title: 'Logs reach Splunk', state: 'failed', detail: 'No value for SPLUNK_HEC_TOKEN in the secret store.' },
      entry: {
        id: 'splunk', title: 'Logs reach Splunk',
        secrets: { SPLUNK_HEC_TOKEN: 'dev/splunk/hec-token' }, check: 'test -n "$SPLUNK_HEC_TOKEN"',
        troubleshooting: 'Tokens come from the Observability team.\n',
      },
    }]);

    assert.strictEqual(prompt, [
      '/onboarding-setup Onboarding setup could not finish "Logs reach Splunk" in this repository. Help me find out why and fix it.',
      '## Logs reach Splunk failed',
      'What happened:\n\n```text\nNo value for SPLUNK_HEC_TOKEN in the secret store.\n```',
      'How onboarding.yaml defines it:\n\n```yaml\n- id: splunk\n  title: Logs reach Splunk\n'
        + '  secrets:\n    SPLUNK_HEC_TOKEN: dev/splunk/hec-token\n  check: test -n "$SPLUNK_HEC_TOKEN"\n```',
      'Notes from the team:\n\nTokens come from the Observability team.',
    ].join('\n\n'));
  });

  test('several entries are listed in turn, and an entry no longer in the plan still gets its result', () => {
    const prompt = troubleshootPrompt([
      { status: { id: 'jdk', title: 'Java 21', state: 'failed', detail: 'Its check failed.' }, entry: { id: 'jdk', uses: 'jdk' } },
      { status: { id: 'gone', title: 'gone', state: 'skipped', detail: 'Waits for jdk, which is not ready.' } },
    ]);
    assert.ok(prompt.startsWith('/onboarding-setup Onboarding setup could not finish "Java 21", "gone" in this repository.'));
    assert.ok(prompt.includes('## Java 21 failed'));
    assert.ok(prompt.includes('## gone was skipped\n\nWhat happened:\n\n```text\nWaits for jdk, which is not ready.\n```'));
    assert.ok(prompt.endsWith('Waits for jdk, which is not ready.\n```'), 'no definition for an entry not in the plan');
  });
});

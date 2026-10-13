import * as vscode from 'vscode';

/** The one place the extension talks to an AI agent. Copilot is the default. */
export interface AgentHost {
  isAvailable(): Promise<boolean>;
  /** Opens a new chat session with the agent, with a prompt the developer reads before sending. */
  openChat(prompt: string): Promise<void>;
}

export class CopilotAgentHost implements AgentHost {
  async isAvailable(): Promise<boolean> {
    return (await vscode.lm.selectChatModels({ vendor: 'copilot' })).length > 0;
  }

  async openChat(prompt: string): Promise<void> {
    try {
      // Built-in commands; their arguments are not a stable API, so re-check after VS Code updates.
      // newChat first, so each request starts its own session; VS Code does the same when it
      // prefills a chat. isPartialQuery puts the prompt in the input box without sending it.
      await vscode.commands.executeCommand('workbench.action.chat.newChat');
      await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt, isPartialQuery: true, mode: 'agent' });
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Could not open Copilot Chat. Is the GitHub Copilot Chat extension installed? ${(err as Error).message}`);
    }
  }
}

export function getAgentHost(): AgentHost {
  return new CopilotAgentHost();
}

import * as vscode from 'vscode';

/** The one place the extension talks to an AI agent. Copilot is the default. */
export interface AgentHost {
  isAvailable(): Promise<boolean>;
  /** Opens the agent's chat with a prompt the developer reads before sending. */
  openChat(prompt: string): Promise<void>;
}

export class CopilotAgentHost implements AgentHost {
  async isAvailable(): Promise<boolean> {
    throw new Error("TODO: vscode.lm.selectChatModels({ vendor: 'copilot' }) returns at least one");
  }

  async openChat(prompt: string): Promise<void> {
    // TODO: 'workbench.action.chat.open' with { query: prompt, isPartialQuery: true, mode: 'agent' }.
    // Built-in command; its arguments are not a stable API, so re-check after VS Code updates.
  }
}

export function getAgentHost(): AgentHost {
  return new CopilotAgentHost();
}

/**
 * A stand-in for the `vscode` module, so unit tests run in plain Node instead of inside
 * VS Code. It holds only what the code under test uses; add to it as more code is tested.
 * Behaviour copies the real API: see the comments for the parts that matter.
 */
import * as fs from 'fs/promises';
import * as path from 'path';

export class Uri {
  private constructor(readonly fsPath: string) {}

  static file(fsPath: string): Uri {
    return new Uri(path.resolve(fsPath));
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(path.join(base.fsPath, ...segments));
  }

  get path(): string {
    return this.fsPath.split(path.sep).join('/');
  }

  toString(): string {
    return `file://${this.path}`;
  }
}

/** The real one carries the error name in `code`, e.g. 'FileNotFound'. */
export class FileSystemError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = `${code} (FileSystemError)`;
  }

  static FileNotFound(uri: Uri): FileSystemError {
    return new FileSystemError(`File not found: ${uri}`, 'FileNotFound');
  }
}

export const workspace = {
  workspaceFolders: undefined as { uri: Uri; name: string; index: number }[] | undefined,
  fs: {
    async readFile(uri: Uri): Promise<Uint8Array> {
      try {
        return new Uint8Array(await fs.readFile(uri.fsPath));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          throw FileSystemError.FileNotFound(uri);
        }
        throw err;
      }
    },
  },
};

/** What the code under test showed or ran, and the answer the next message returns. */
export const fake = {
  messages: [] as { kind: 'info' | 'warning' | 'error'; message: string; items: string[] }[],
  executed: [] as string[],
  answer: undefined as string | undefined,
  reset(): void {
    this.messages = [];
    this.executed = [];
    this.answer = undefined;
  },
};

function showMessage(kind: 'info' | 'warning' | 'error') {
  return async (message: string, ...rest: unknown[]): Promise<string | undefined> => {
    const items = rest.filter((r): r is string => typeof r === 'string');
    fake.messages.push({ kind, message, items });
    return fake.answer;
  };
}

export const window = {
  showInformationMessage: showMessage('info'),
  showWarningMessage: showMessage('warning'),
  showErrorMessage: showMessage('error'),
};

export const commands = {
  async executeCommand(command: string): Promise<unknown> {
    fake.executed.push(command);
    return undefined;
  },
};

export class EventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];

  readonly event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter(l => l !== listener)) };
  };

  fire(data: T): void {
    this.listeners.forEach(l => l(data));
  }
}

export enum TreeItemCollapsibleState { None = 0, Collapsed = 1, Expanded = 2 }

export class TreeItem {
  id?: string;
  description?: string;
  iconPath?: ThemeIcon;
  tooltip?: MarkdownString;
  contextValue?: string;

  constructor(readonly label: string, readonly collapsibleState = TreeItemCollapsibleState.None) {}
}

export class ThemeColor {
  constructor(readonly id: string) {}
}

export class ThemeIcon {
  constructor(readonly id: string, readonly color?: ThemeColor) {}
}

/** Builds the same Markdown text as the real one. */
export class MarkdownString {
  value = '';

  appendMarkdown(value: string): this {
    this.value += value;
    return this;
  }

  appendCodeblock(code: string, language = ''): this {
    this.value += `\n\`\`\`${language}\n${code}\n\`\`\`\n`;
    return this;
  }
}

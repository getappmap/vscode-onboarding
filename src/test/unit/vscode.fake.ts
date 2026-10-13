/**
 * A stand-in for the `vscode` module, so unit tests run in plain Node instead of inside
 * VS Code. It holds only what the code under test uses; add to it as more code is tested.
 * Behaviour copies the real API: see the comments for the parts that matter.
 */
import * as fs from 'fs/promises';
import * as path from 'path';

export class Uri {
  private raw?: string;

  private constructor(readonly fsPath: string) {}

  /** Keeps the text as given; only toString is used for parsed URIs. */
  static parse(value: string): Uri {
    const uri = new Uri(value);
    uri.raw = value;
    return uri;
  }

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
    return this.raw ?? `file://${this.path}`;
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
  get isTrusted(): boolean {
    return fake.trusted;
  },
  getConfiguration(section?: string) {
    return {
      get<T>(key: string, defaultValue?: T): T | undefined {
        const name = section ? `${section}.${key}` : key;
        return name in fake.settings ? fake.settings[name] as T : defaultValue;
      },
    };
  },
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
  /** Arguments of each executed command, in the same order as `executed`. */
  executedArgs: [] as unknown[][],
  /** Commands that throw when executed, as a missing extension's would. */
  failing: new Set<string>(),
  answer: undefined as string | undefined,
  chatModels: [] as unknown[],
  /** Settings by full name, such as 'onboarding.secretCommand'. */
  settings: {} as Record<string, unknown>,
  trusted: true,
  /** The location of each withProgress call, outermost first. */
  progressLocations: [] as unknown[],
  /** Every webview panel created, oldest first. */
  panels: [] as WebviewPanel[],
  reset(): void {
    this.progressLocations = [];
    this.panels = [];
    this.settings = {};
    this.trusted = true;
    this.messages = [];
    this.executed = [];
    this.executedArgs = [];
    this.failing = new Set();
    this.answer = undefined;
    this.chatModels = [];
  },
};

function showMessage(kind: 'info' | 'warning' | 'error') {
  return async (message: string, ...rest: unknown[]): Promise<string | undefined> => {
    const items = rest.filter((r): r is string => typeof r === 'string');
    fake.messages.push({ kind, message, items });
    return fake.answer;
  };
}

export enum ProgressLocation { SourceControl = 1, Window = 10, Notification = 15 }

export enum ViewColumn { Active = -1, Beside = -2, One = 1, Two = 2 }

/**
 * A webview panel. `send` stands in for the page's script posting a message. As in the real one,
 * a disposed panel fires onDidDispose once, and setting html or revealing it afterwards throws.
 */
export class WebviewPanel {
  title: string;
  iconPath?: ThemeIcon;
  reveals = 0;
  disposed = false;
  private readonly disposeEmitter = new EventEmitter<void>();
  private readonly messageEmitter = new EventEmitter<unknown>();
  private htmlValue = '';
  readonly onDidDispose = this.disposeEmitter.event;
  readonly webview: { cspSource: string; onDidReceiveMessage: EventEmitter<unknown>['event']; html: string };

  constructor(readonly viewType: string, title: string, readonly showOptions: unknown, readonly options: unknown) {
    this.title = title;
    const panel = this;
    this.webview = {
      cspSource: 'vscode-webview://fake',
      onDidReceiveMessage: this.messageEmitter.event,
      get html(): string {
        return panel.htmlValue;
      },
      set html(value: string) {
        if (panel.disposed) {
          throw new Error('Webview is disposed');
        }
        panel.htmlValue = value;
      },
    };
  }

  reveal(): void {
    if (this.disposed) {
      throw new Error('Webview is disposed');
    }
    this.reveals++;
  }

  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      this.disposeEmitter.fire();
    }
  }

  send(message: unknown): void {
    this.messageEmitter.fire(message);
  }
}

export const window = {
  showInformationMessage: showMessage('info'),
  showWarningMessage: showMessage('warning'),
  showErrorMessage: showMessage('error'),
  withProgress<R>(
    options: { location: unknown },
    task: (progress: { report(value: unknown): void }, token: { isCancellationRequested: boolean }) => Thenable<R>,
  ): Thenable<R> {
    fake.progressLocations.push(options.location);
    return task({ report: () => undefined }, { isCancellationRequested: false });
  },
  createWebviewPanel(viewType: string, title: string, showOptions: unknown, options?: unknown): WebviewPanel {
    const panel = new WebviewPanel(viewType, title, showOptions, options);
    fake.panels.push(panel);
    return panel;
  },
};

export const commands = {
  async executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    fake.executed.push(command);
    fake.executedArgs.push(args);
    if (fake.failing.has(command)) {
      throw new Error(`command '${command}' not found`);
    }
    return undefined;
  },
};

export const lm = {
  async selectChatModels(_selector?: { vendor?: string }): Promise<unknown[]> {
    return fake.chatModels;
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
  command?: { command: string; title: string; arguments?: unknown[] };

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

export class McpHttpServerDefinition {
  constructor(readonly label: string, public uri: Uri, public headers: Record<string, string> = {}, public version?: string) {}
}

export class McpStdioServerDefinition {
  cwd?: Uri;

  constructor(
    readonly label: string, public command: string, public args: string[] = [],
    public env: Record<string, string | number | null> = {}, public version?: string,
  ) {}
}

export class LanguageModelTextPart {
  constructor(public value: string) {}
}

export class LanguageModelToolResult {
  constructor(public content: unknown[]) {}
}

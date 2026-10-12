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

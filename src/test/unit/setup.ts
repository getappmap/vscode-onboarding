/**
 * Loaded by Mocha before any unit test (see .mocharc.json). Makes `require('vscode')`
 * return the fake in vscode.fake.ts, since the real module exists only inside VS Code.
 */
import Module = require('module');

const fakePath = require.resolve('./vscode.fake');
const moduleWithResolve = Module as unknown as {
  _resolveFilename(request: string, ...rest: unknown[]): string;
};
const resolve = moduleWithResolve._resolveFilename;

moduleWithResolve._resolveFilename = function (request: string, ...rest: unknown[]): string {
  return request === 'vscode' ? fakePath : resolve.call(this, request, ...rest);
};

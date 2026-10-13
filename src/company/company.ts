import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { Manifest, validateManifest } from '../manifest/manifest';
import { pickShell } from '../setup/runCommand';

export interface OrgSettings {
  layers: Manifest[];   // Org first, then Team
}

const SETTINGS_TIMEOUT_MS = 10_000;
const SECRET_TIMEOUT_MS = 60_000;

/**
 * Fetches the Org and Team layers from the company settings server, named by the
 * onboarding.orgSettingsUrl setting. It answers GET <url>?team=<team> with JSON:
 *   { "org": <manifest>, "team": <manifest or null> }
 * No server set means no layers. Anything else that goes wrong is an error, which the
 * caller reports before carrying on with the project's manifest alone.
 */
export async function fetchOrgSettings(team: string | undefined): Promise<OrgSettings> {
  const url = vscode.workspace.getConfiguration('onboarding').get<string>('orgSettingsUrl', '').trim();
  if (!url) {
    return { layers: [] };
  }
  const address = new URL(url);
  if (address.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)) {
    throw new Error(`onboarding.orgSettingsUrl must use https: ${url}`);
  }
  if (team) {
    address.searchParams.set('team', team);
  }

  // TODO: sign in as the developer, once we know how the settings server checks who is asking.
  const response = await fetch(address, { signal: AbortSignal.timeout(SETTINGS_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${address.origin} answered ${response.status} ${response.statusText}`);
  }
  const body = await response.json() as { org?: unknown; team?: unknown };
  const layers = [validateManifest(body.org ?? {}, 'Org layer')];
  if (body.team) {
    layers.push(validateManifest(body.team, 'Team layer'));
  }
  return { layers };
}

/**
 * Reads one secret with the secret store's own command line tool, signed in as the developer.
 * Runs the onboarding.secretCommand setting, where {path} marks the secret's path; the path
 * reaches the command as an environment variable, so no path can break its quoting. Returns
 * standard output, less one final line break.
 */
export async function readSecret(path: string): Promise<string | undefined> {
  const template = vscode.workspace.getConfiguration('onboarding').get<string>('secretCommand', '').trim();
  if (!template) {
    throw new Error('no secret store is set up. Set onboarding.secretCommand, for example `vault kv get -field=value {path}`');
  }
  const pathVariable = process.platform === 'win32' ? '$env:ONBOARDING_SECRET_PATH' : '"$ONBOARDING_SECRET_PATH"';
  const script = template.split('{path}').join(pathVariable);
  const shell = pickShell();

  return new Promise((resolve, reject) => {
    const child = spawn(shell.program, shell.args(script), {
      env: { ...process.env, ONBOARDING_SECRET_PATH: path },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: SECRET_TIMEOUT_MS,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', e => reject(new Error(`could not run onboarding.secretCommand: ${e.message}`)));
    child.on('close', code => {
      if (code !== 0) {
        // Only the error stream is shown: standard output may hold part of a secret.
        const message = Buffer.concat(err).toString('utf8').trim().split('\n').slice(-3).join('\n');
        reject(new Error(`the secret store could not read ${path}${message ? `: ${message}` : ''}`));
        return;
      }
      const value = Buffer.concat(out).toString('utf8').replace(/\r?\n$/, '');
      resolve(value || undefined);
    });
  });
}

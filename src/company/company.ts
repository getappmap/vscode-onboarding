import { Manifest } from '../manifest/manifest';

export interface OrgSettings {
  layers: Manifest[];      // Org first, then Team
  preApproved: string[];   // entry ids whose fix may run without asking
}

/** Fetches the Org and Team layers from the company settings server (HTTPS, JSON). */
export async function fetchOrgSettings(team: string | undefined): Promise<OrgSettings> {
  throw new Error('TODO: sign in as the developer; empty layers when no server is set');
}

/** Reads one secret with the secret store's own command line tool, signed in as the developer. */
export async function readSecret(path: string): Promise<string | undefined> {
  throw new Error('TODO: run the onboarding.secretCommand setting; return its standard output');
}

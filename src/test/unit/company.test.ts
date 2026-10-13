import * as assert from 'assert';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { fetchOrgSettings, readSecret } from '../../company/company';
import { fake } from './vscode.fake';

const isWindows = process.platform === 'win32';

suite('Company: secret store', function () {
  this.timeout(20_000);
  setup(() => fake.reset());

  test('runs the secretCommand setting with the path, and returns what it prints', async () => {
    fake.settings['onboarding.secretCommand'] = isWindows ? 'Write-Output "value-of-$({path})"' : 'echo "value-of-{path}"';
    assert.strictEqual(await readSecret('dev/splunk/hec-token'), 'value-of-dev/splunk/hec-token');
  });

  test('a path cannot break out of the command', async () => {
    fake.settings['onboarding.secretCommand'] = isWindows ? 'Write-Output {path}' : 'printf %s {path}';
    assert.strictEqual(await readSecret('a b; echo injected'), 'a b; echo injected');
  });

  test('keeps a secret exactly as printed, apart from one final line break', async () => {
    fake.settings['onboarding.secretCommand'] = isWindows ? "[Console]::Out.Write(\"  two`nlines  `n\")" : "printf '  two\\nlines  \\n'";
    assert.strictEqual(await readSecret('x'), '  two\nlines  ');
  });

  test('an empty answer is no value', async () => {
    fake.settings['onboarding.secretCommand'] = isWindows ? "[Console]::Out.Write('')" : 'true';
    assert.strictEqual(await readSecret('x'), undefined);
  });

  test('a failure shows the error output, never standard output', async () => {
    fake.settings['onboarding.secretCommand'] = isWindows
      ? '[Console]::Out.Write("half-secret"); [Console]::Error.WriteLine("permission denied"); exit 2'
      : 'printf half-secret; echo "permission denied" >&2; exit 2';
    await assert.rejects(readSecret('dev/token'), (err: Error) => {
      assert.strictEqual(err.message, 'the secret store could not read dev/token: permission denied');
      return true;
    });
  });

  test('says how to set it up when there is no secret store', async () => {
    await assert.rejects(readSecret('x'), /no secret store is set up\. Set onboarding\.secretCommand/);
  });
});

suite('Company: Org settings server', function () {
  this.timeout(20_000);
  let server: http.Server;
  let url: string;
  let answer: { status: number; body: unknown };
  let lastPath = '';

  suiteSetup(async () => {
    server = http.createServer((req, res) => {
      lastPath = req.url ?? '';
      res.statusCode = answer.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(answer.body));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/onboarding`;
  });
  suiteTeardown(() => new Promise(resolve => server.close(resolve)));
  setup(() => fake.reset());

  test('no server set gives no layers', async () => {
    assert.deepStrictEqual(await fetchOrgSettings('payments'), { layers: [] });
  });

  test('reads the Org and Team layers for the team', async () => {
    fake.settings['onboarding.orgSettingsUrl'] = url;
    answer = {
      status: 200,
      body: {
        org: { entries: [{ id: 'proxy', check: 'true' }], mcpServers: [{ name: 'access', url: 'https://access.example.com' }] },
        team: { entries: [{ id: 'vpn', check: 'true' }] },
      },
    };
    const settings = await fetchOrgSettings('payments');

    assert.strictEqual(lastPath, '/onboarding?team=payments');
    assert.deepStrictEqual(settings.layers.map(l => l.entries.map(e => e.id)), [['proxy'], ['vpn']]);
    assert.deepStrictEqual(settings.layers[0].mcpServers, [{ name: 'access', url: 'https://access.example.com' }]);
  });

  test('no team layer is fine', async () => {
    fake.settings['onboarding.orgSettingsUrl'] = url;
    answer = { status: 200, body: { org: { entries: [] }, team: null } };
    assert.strictEqual((await fetchOrgSettings(undefined)).layers.length, 1);
    assert.strictEqual(lastPath, '/onboarding');
  });

  test('a layer with mistakes is checked like a manifest', async () => {
    fake.settings['onboarding.orgSettingsUrl'] = url;
    answer = { status: 200, body: { org: { entries: [{ id: 'x' }] } } };
    await assert.rejects(fetchOrgSettings(undefined), /^ManifestError: Org layer has a problem/);
  });

  test('an error status is an error', async () => {
    fake.settings['onboarding.orgSettingsUrl'] = url;
    answer = { status: 403, body: {} };
    await assert.rejects(fetchOrgSettings(undefined), /answered 403 Forbidden/);
  });

  test('only https, except on this computer', async () => {
    fake.settings['onboarding.orgSettingsUrl'] = 'http://settings.example.com/onboarding';
    await assert.rejects(fetchOrgSettings(undefined), /must use https/);
  });
});

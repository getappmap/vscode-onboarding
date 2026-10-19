import { main } from './onboard';

// The entry point esbuild bundles into dist/onboard.mjs.

// The oldest Node the command line is tested on. A version manager such as mise or Volta can
// pick an older one from the project's own files, so say that plainly instead of crashing.
const OLDEST_NODE = 18;
const major = Number(process.versions.node.split('.')[0]);
if (major < OLDEST_NODE) {
  process.stderr.write(`Onboarding needs Node.js ${OLDEST_NODE} or later, but ${process.execPath} is Node ${process.versions.node}. `
    + 'A version manager may have picked it from this project\'s .tool-versions, .nvmrc or package.json. '
    + 'Run this script with a newer node, given by its full path.\n');
  process.exit(1);
}
const cancel = { isCancellationRequested: false };
process.on('SIGINT', () => {
  if (cancel.isCancellationRequested) {
    process.exit(130);
  }
  cancel.isCancellationRequested = true;
  process.stderr.write('Stopping setup. Press Ctrl-C again to quit now.\n');
});

main(process.argv.slice(2), {
  out: text => process.stdout.write(`${text}\n`),
  err: text => process.stderr.write(`${text}\n`),
  env: process.env,
  cancel,
}).then(code => { process.exitCode = code; });

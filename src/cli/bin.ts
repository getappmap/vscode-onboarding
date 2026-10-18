import { main } from './onboard';

// The entry point esbuild bundles into dist/onboard.mjs.
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

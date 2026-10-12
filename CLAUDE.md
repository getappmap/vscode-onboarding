# CLAUDE.md

## Tests: plain Node first, VS Code only when needed

- Put new tests in `src/test/unit/`. They run in plain Node (`npm test`), with the fake
  `vscode` module in `src/test/unit/vscode.fake.ts`. If the code under test uses a part of
  the VS Code API the fake lacks, add it to the fake, copying the real API's behaviour.
- Put a test in `src/test/vscode/` (`npm run test:vscode`) only when a fake cannot check
  it, such as activation or `package.json` contributions.
- Why: AppMap Gold Traces cannot record tests that run inside VS Code.

Commands and details: see the Tests section of README.md.

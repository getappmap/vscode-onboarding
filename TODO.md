# TODO

Open work for Onboarding. Remove each line when it is done.

## Before the VS Code Marketplace

- [ ] Add screenshots to README.md: the Onboarding list, an entry page, Ask Copilot to Help.
      Use `https://` image links; the Marketplace does not show SVG images.
- [ ] Add a 128×128 PNG icon, and set `icon` in `package.json`. The Marketplace does not accept
      SVG for this.
- [ ] Confirm `publisher` (`appland`) and the copyright holder in LICENSE (AppLand, Inc.).
- [ ] Publish to the Marketplace from `.github/workflows/release.yml`: add `vsce publish` and a
      `VSCE_PAT` repository secret. Today the workflow only makes a GitHub release.

## Housekeeping

- [ ] Delete the empty `kgilpin/onboard` GitHub repository, made by mistake.
- [ ] The design notes (Onboarding Manifest Reference) are a private claude.ai artifact. Move
      anything contributors need into `docs/`, or share the artifact.
- [ ] Run the tests on Windows and on macOS or Linux before each release (see CONTRIBUTING.md).
      The release workflow runs them on Linux only.

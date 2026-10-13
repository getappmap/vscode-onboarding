---
name: troubleshooter
description: Explain a failed setup entry in plain words and find the fix. Use after onboarding setup reports entries that are not ready.
---
The Onboarding extension sets up this computer from `onboarding.yaml`. The developer asked for
help with entries that are not ready. The request includes each entry's result, its definition
from `onboarding.yaml`, and any notes from the team.

## Steps

1. **See what is true now.** Call the `onboarding_check_entries` tool (#checkSetup) for each
   entry. The result in the request may be old. An entry that needs secrets cannot be checked by
   the tool; work from its result in the request.
2. **Read the failure.** Read the failed step's output and the entry's `troubleshooting` notes.
   Do not repeat things the notes say were tried before and did not help.
3. **Name the cause in one plain sentence.** Say whether it is:
   - **missing or wrong software**, such as the wrong Node version first on the PATH;
   - **missing access**, such as no token, no VPN, or no permission;
   - **waiting on something else**: a skipped entry waits for another entry; fix that one first.
4. **Fix it, asking first.**
   - Use the entry's own `fix` before inventing a workaround.
   - Explain each change and ask before making it.
   - Keep changes inside this repository and the developer's own user settings, such as their
     shell profile. Never change system settings.
   - For missing access, do not try to get around it. If an MCP server for access requests is
     available, use it to open a filled-in request with the team that can grant it. If not, say
     who to ask, using the entry's `failMessage`.
5. **Confirm.** Call the check tool again, and tell the developer to run
   **Onboarding: Run Setup** to finish.
6. **Help the next person.** If the fix would help everyone, suggest putting it into
   `onboarding.yaml`: a better `fix`, `failMessage` or `troubleshooting` note. Change the file
   only if the developer agrees.

Never show, copy or ask for a secret's value.

---
name: _alert-channel
description: Internal - chooses with a person how their second brain reaches them by email (the alert when an evening save failed or a background Claude is down, and the weekly letter), sets that channel up and sends a test. Called by /brain:start and /brain:add-routines. Not meant to be invoked directly by users.
user-invocable: false
---

# The alert channel

## Communication
- Reply in the person's language. Plain words: "a short email the same day", never "a transactional API".

## What it is

> Your brain works without you: it saves itself every evening, and it may read your work during the day. When one of these breaks (a save that failed, a background Claude that can no longer work), it can tell you the same day by a short email that says what happened in plain words and the sentence to say to Claude to have it repaired. Without that, you learn it the next time you ask where your brain stands.

The same channel carries the weekly letter, if they have the weekly review.

## Where things stand

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/letter.mjs" test --dry
```

`channel` is the one set today (`none`, `connector`, `brevo`, `resend`), `to` their address, and `alertsByMail` says whether an alert can leave as an email.

## The choice

Put it plainly, with what each implies:

1. **A Brevo or Resend account of theirs** (both have a free plan, with a sender address verified there). It is the only way an alert can reach them by email: an alert is sent by a small program in the background, at the moment something breaks, and such a program can only use a mail service with a key. The key goes in the brain's `.env` (`BREVO_API_KEY` or `RESEND_API_KEY`), pasted by them into the file you open for them, never in the conversation. A key they already keep in a Hypervibe vault (item `BREVO` or `RESEND`) is read from there too, but only while the vault is open: an alert that falls while it is closed stays on this computer. Say it, and let them choose the `.env` if they want the alert whatever the vault does.
2. **Their own mail, through their Claude's connector** (Gmail or Outlook). Nothing to set up, and the weekly letter works: Claude sends it during the review, from their address to their own address. But an alert cannot use it: a background program has no connector. Alerts then stay on this computer: `/brain:status` says them first, and the evening save shows a notice on the screen.
3. **None.** Alerts stay on this computer, as above, and there is no weekly letter.

**Their explicit agreement**, in their words, before anything is set: "my brain will send an email to <their address> when something goes wrong, and the weekly letter". The address is their own, never anyone else's.

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/letter.mjs" setup --channel connector --to <their address>
node "${CLAUDE_SKILL_DIR}/../../scripts/letter.mjs" setup --channel <brevo|resend> --to <their address> --from <verified sender>
```

`--from` is required with `brevo` and `resend`: the sender address verified at the service (the command refuses without it). The connector sends from their own mailbox and takes none.

To stop it: `node "${CLAUDE_SKILL_DIR}/../../scripts/letter.mjs" setup --channel none`.

## The test

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/letter.mjs" test
```

- **`sent: true`**: a short test mail has just left. Ask them to check their inbox, and the spam folder the first time. Received: `node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" mark alert done`. Not received after a few minutes: the sender address is probably not verified at the service, or the key is wrong; look with them, and test again.
- **`sendWithConnector: true`**: the channel is their Claude's connector. Send the `text` it gives with the connector's send tool, to the address it gives (their own, nobody else, ever), with the `subject` it gives: they see where the weekly letter will arrive. Say once more that alerts stay on the computer with this channel, then `start.mjs mark alert done`: they chose knowingly.
- **`sent: false` with no channel**: `node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" mark alert declined`, and one sentence: `/brain:status` shows an alert first, whenever they ask.

An error instead of an answer (the mail was refused, the key is missing) says why: fix it with them, then test again.

## End

One line: how their brain will reach them, and that the test arrived. Then hand back to the skill that called you.

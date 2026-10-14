# Privacy and data handling

## Data currently collected

The contact endpoint stores only the fields needed to respond to an inquiry: name, email, subject, message, consent flag, and timestamp. The newsletter endpoint stores an email address and timestamp but does not yet send confirmation or unsubscribe messages.

## Explicitly out of scope

Do not collect national identity numbers, passport data, photographs of identity documents, father's name, exact home address, or other high-risk personal data in the current implementation. An ID-number format check is not proof of identity. Any future identity process requires a documented purpose, legal basis, minimization assessment, access controls, encryption strategy, retention schedule, deletion process, incident response, and qualified legal/security review.

## Operational gaps to close before launch

- Name the data controller and provide jurisdiction-specific rights information.
- Decide and implement a retention period and automated deletion.
- Restrict database and backup access; encrypt storage and backups where supported.
- Configure TLS, secret management, audit logging, and monitoring at the host.
- Test backup restoration and incident-response procedures.
- Implement verified email and unsubscribe before enabling a newsletter.
- Do not use personal information for political profiling, targeting, or unrelated purposes.

The public-facing privacy page is a transparent initial notice, not a substitute for jurisdiction-specific legal advice.

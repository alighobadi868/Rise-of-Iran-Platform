# Roadmap

## Delivered in this repository

- Responsive public website with mission, priorities, research themes, transparency status, and contact information.
- Original vector brand mark and hero illustration.
- Working contact form backed by server-side validation and SQLite persistence.
- Health endpoint, basic request throttling, security headers, PWA manifest and offline cache for static assets.
- Docker deployment configuration and initial privacy/architecture documentation.

## Required before public production launch

- Deploy to a managed host with HTTPS and a durable volume or managed database.
- Configure backups, monitoring, logs, and automated security/dependency scans.
- Establish controller identity, privacy/legal review, and a data retention/deletion policy.
- Configure and test contact email delivery; currently contact submissions are stored in SQLite and do not trigger an email.
- Add CI and integration tests for API validation, throttling, and persistence.
- Add a real AI endpoint only after provider, budget, retention, and abuse controls are chosen.

## Future platform modules

- **Android:** native client consuming documented API endpoints; signing keys and Play Console configuration must remain outside source control.
- **AI:** server-side provider adapter with strict rate limits, user notice, content-safety checks, and a configurable spend ceiling.
- **Accounts:** defer until authentication, email verification, account recovery, and privacy requirements are designed and tested.

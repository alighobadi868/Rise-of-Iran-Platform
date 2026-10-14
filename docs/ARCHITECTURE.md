# Architecture

## Current implementation

- **Web frontend:** semantic HTML, responsive CSS, browser JavaScript, SVG artwork, and a PWA manifest/service worker.
- **HTTP server:** Node.js 20+ and Express.
- **Persistence:** SQLite via better-sqlite3 for contact messages and newsletter requests.
- **Security controls:** Helmet headers and CSP, JSON body size limit, schema validation, rate limits on public write endpoints, compression, generic server error responses, and no client-side secrets.
- **Deployment:** Docker image and Compose configuration with a persistent named volume.

## API

- GET /api/health — health status and timestamp.
- POST /api/contact — validates and stores a contact inquiry; maximum 5 submissions per IP per 15 minutes.
- POST /api/newsletter — stores an email request; maximum 3 per IP per hour. Confirmation and unsubscribe are not implemented, so do not promote this as a functioning mailing list.
- GET /api/ai/status — reports whether AI environment variables are configured. It does not expose keys or call an AI provider.

## Production requirements before launch

1. Configure a real HTTPS domain and hosting, backups, monitoring, log retention, and alerting.
2. Set and verify proxy trust only when the deployment sits behind a known reverse proxy.
3. Establish data controller/contact details, lawful basis, retention/deletion procedures, and incident response.
4. Add email delivery only after provider setup, domain authentication, verification, and unsubscribe support.
5. Add account registration or identity verification only after a separate threat model and privacy/legal review.
6. Add an AI route only after choosing a provider, defining abuse controls, setting usage budgets, and documenting whether prompts are retained by that provider.
7. Add automated tests and a CI pipeline in the deployment environment; run dependency and container scans before public launch.

This repository is a functioning application codebase, not a claim that hosting, domain, email delivery, or external AI credentials have already been configured.

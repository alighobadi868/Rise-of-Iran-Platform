# Website and Android app audit

Audit date: 15 October 2026  
Repository: `alighobadi868/Rise-of-Iran-Platform`

This is a source-code and repository-configuration audit. It is not a production penetration test or a visual test of a live deployment.

## Confirmed structure

- Public responsive website and Persian charter page under `public/`.
- Express API and SQLite persistence under `server/`.
- PWA manifest and service worker.
- Android native source under `android/`.
- GitHub Actions syntax checks and tests.
- The latest recorded main-branch CI run before this audit succeeded.

## Fixed in the current review branch

1. The health endpoint now checks SQLite and reports HTTP 503 if the database check fails; it no longer reports healthy solely because the process is running.
2. Duplicate `class` attributes were removed from `public/assistant.html` and `public/privacy.html`.
3. API integration tests cover health/database connectivity, the career-guide payload, contact submission, and the disabled-AI guardrail.
4. A regression test checks public HTML opening tags for duplicate attributes.
5. An optional dual-provider AI code-review workflow and weekly Dependabot proposals were added. AI reviews are not active until API keys are configured as GitHub Actions secrets.

## Blockers before public launch

### P0 — Production deployment and monitoring
No production URL or custom domain was found in the connected Vercel, Wix, or Floot project inventory. The two Floot projects are not published. Therefore the live website, production headers, TLS, mobile rendering, and uptime could not be verified. A hosting target, production URL, and deployment access are required.

### P0 — Contact and expert submissions
The API stores contact, expert, and collaboration submissions in SQLite but does not email them, and the repository has no authenticated admin inbox for reading these records. Without secure database access or a delivery/inbox workflow, an operator may not see submissions. Configure an email provider or a secure admin queue before relying on these forms.

### P0 — Video upload moderation and persistence
The public video endpoint accepts uploads and publishes them immediately without an authenticated moderation step. Files are stored under a temporary directory by default, while database metadata can persist longer. This creates abuse, moderation, and broken-media risks. Before launch, add moderation and persistent object storage, or disable public uploads until both are ready.

### P1 — AI functionality
The public AI assistant is disabled by default and needs server-side provider credentials, an approved model, budget controls, and a data-handling policy. The charter Q&A endpoint currently returns canned fallback text; it is not connected to a searchable, versioned charter knowledge base and should not be marketed as a fully AI-powered charter assistant yet.

### P1 — Newsletter lifecycle
Newsletter addresses can be stored, but double opt-in/confirmation and unsubscribe workflows are not implemented. Do not advertise an active newsletter until these are complete.

### P1 — Android release readiness
Android source exists, but the repository does not include a Gradle wrapper. The app has no verified production endpoint, signed release build, store listing, or device-test evidence. It is source code, not a confirmed installable production app.

### P1 — Privacy operations
The privacy notice itself says the responsible controller, retention/deletion process, backups, monitoring, and incident response still need decisions. Implement a retention schedule, restricted access, persistent encrypted backups, and a documented incident-response process before collecting data at scale.

## Required access/configuration

- Hosting provider or server account and the chosen production domain/URL.
- Persistent database and media storage plus backup/restore access.
- Email provider credentials, stored only as hosting secrets.
- Optional OpenAI and Anthropic API keys, stored only as GitHub Actions secrets, to enable independent code reviews.
- For Android distribution: production HTTPS API URL, signing configuration held securely, and the relevant app-store accounts.

Do not put API keys, signing keys, database passwords, or personal credentials in source code or chat.

## Release rule

Do not deploy solely because CI passes or AI reviewers find no issue. Review the PR, configure the blocked services, test the live site and Android build, and verify backups and form delivery before launch.

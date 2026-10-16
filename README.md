# Rise of Iran Platform

**An independent, civic-research initiative in formation.**

Rise of Iran Platform is the public digital foundation for publishing documented analysis, explaining civic and policy questions, and inviting constructive project inquiries. It is independent and nonpartisan; it does not claim to represent all Iranians, any government, party, or unaffiliated person.

![Rise of Iran — a new horizon](public/assets/hero-banner.svg)

## Included

- Responsive public website with accessible navigation and original SVG artwork.
- Node.js/Express backend and SQLite persistence.
- Contact form with server-side validation and rate limiting.
- Health endpoint and service-status page.
- PWA manifest and service worker for static asset caching.
- Docker and Docker Compose deployment configuration.
- Android native app source module.
- Architecture, privacy, and roadmap documentation.

## Run the web platform locally

Requires Node.js 20+ and a C/C++ build toolchain for the SQLite native dependency.

```sh
cp .env.example .env
npm install
npm start
```

Open http://localhost:3000. Health endpoint: http://localhost:3000/api/health.

## Run with Docker

```sh
cp .env.example .env
docker compose up --build -d
```

The Compose configuration persists SQLite data in a named volume. Configure HTTPS and an appropriate reverse proxy at the hosting layer before exposing the service publicly.

## Android

The native Android source is under android/. Open that directory in Android Studio. For emulator development, run the web backend locally and use the default emulator host configuration. For a release build, set the Gradle property platformBaseUrl to the real HTTPS deployment URL; do not release with a development URL.

## AI

The API exposes a status endpoint. AI inference must remain disabled until a provider key, model, budget, and data-handling policy are deliberately configured on the server. Secrets must never be placed in browser code or committed to Git.

## Important current limitations

- Contact messages are stored in SQLite; **they are not emailed automatically**.
- Newsletter submissions are stored, but confirmation and unsubscribe flows are not implemented; do not advertise an active mailing list.
- Password-protected accounts and a manual profile-review queue are implemented. Automatic email verification and official government-ID verification are not configured; the site does not collect ID numbers or document images.
- A production domain, deployment, backups, monitoring, legal review, and email provider have not been configured by this repository commit.

## Privacy and security

Read docs/PRIVACY.md, docs/ARCHITECTURE.md, and docs/ROADMAP.md. Do not add identity-document collection or high-risk personal-data processing without a separate privacy, legal, and security review.

## Project structure

```
android/       Native Android app source
public/        Website, styles, browser code, PWA assets, and SVG artwork
server/        Express API and SQLite initialization
docs/          Architecture, privacy, and roadmap
tests/         Validation tests
Dockerfile     Container definition
docker-compose.yml
```

## Automated quality checks

- GitHub Actions runs syntax checks and API integration tests on pushes and pull requests.
- Optional OpenAI and Anthropic reviewers can independently review pull-request diffs. Configure their API keys as GitHub Actions secrets; see [AI review setup](docs/AI_REVIEW_SETUP.md). These reviews are advisory and do not modify or deploy the application.
- Dependabot proposes weekly dependency and workflow updates.

## Project status

The initiative is currently in formation. This repository does not claim a registered legal entity, committed funding, established expert membership, or a publication record that has not actually been achieved.

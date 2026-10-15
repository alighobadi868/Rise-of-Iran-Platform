# Continuous AI review setup

The repository can request two independent code reviews on each non-draft pull request:

- OpenAI reviewer (default model: `gpt-4.1-mini`)
- Anthropic reviewer (default model: `claude-sonnet-4-20250514`)

The workflow only reviews the pull-request diff and posts a review summary comment. It does **not** edit files, merge code, deploy the site, or claim that tests were run. The existing CI workflow remains the deterministic check; AI reviews are advisory and can miss defects or report false positives.

## Required setup

In GitHub, open **Settings → Secrets and variables → Actions** for this repository and add one or both repository secrets:

- `OPENAI_API_KEY` — an API key from the OpenAI API platform.
- `ANTHROPIC_API_KEY` — an API key from Anthropic.

Do not put these keys in source code, the website, chat messages, or `.env.example`. Store them only as GitHub Actions secrets. API use may incur separate charges; set provider-side spending limits before enabling both reviewers.

Optional repository Actions variables can override model names:

- `OPENAI_REVIEW_MODEL`
- `ANTHROPIC_REVIEW_MODEL`

If no keys are configured, the workflow exits without making AI API calls. Fork-originated pull requests do not receive repository secrets, by design. Reviewers analyze a truncated diff if it exceeds 40,000 characters and report that limitation.

## What still requires separate configuration

This workflow does not connect AI models to the live website. The website's public AI assistant is a separate feature controlled by server environment variables (`AI_ENABLED`, `AI_API_KEY`, `AI_MODEL`, and optionally `AI_BASE_URL`). Keep provider keys server-side. Do not enable it until budget limits, data handling, and the provider's retention/privacy settings are reviewed.

## Human release gate

Review findings, run CI, and manually inspect the site and Android app before merging or deploying. Do not automatically merge or publish solely because AI reviewers approve a change.

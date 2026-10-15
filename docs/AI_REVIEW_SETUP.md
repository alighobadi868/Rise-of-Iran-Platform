# Continuous AI review setup

The repository runs an advisory code review on each non-draft pull request using **Qwen2.5-Coder 3B through Ollama on the GitHub Actions runner**.

## API keys are not required

The workflow downloads a public model and runs inference locally on the temporary GitHub-hosted runner. It does not call OpenAI, Anthropic, or another hosted inference API, and it does not require `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or a model-provider account. GitHub Actions uses its built-in `GITHUB_TOKEN` only to read the pull-request diff and post the review comment.

The model is cached between runs when GitHub's cache is available. The first run can take longer because the model must be downloaded. If the runner cannot download or start Ollama, the workflow fails rather than claiming that a review was completed.

## Review limits

- The review analyzes the pull-request diff, not the entire repository.
- Diffs longer than 26,000 characters are truncated and the review is labeled partial.
- The model may miss defects or produce false positives; treat findings as advisory.
- The workflow does not edit files, merge pull requests, deploy the site, or claim tests were run.
- Fork-originated pull requests may not be able to post comments because GitHub restricts write permissions for their default token.

## Website assistant is separate

This workflow only reviews pull requests. It does not enable the public AI assistant on the live website. The website currently requires server-side `AI_ENABLED`, `AI_API_KEY`, and `AI_MODEL` settings, so it remains disabled until a suitable provider or a local/self-hosted inference approach is deliberately configured. Never put private keys in browser code or commit them to Git.

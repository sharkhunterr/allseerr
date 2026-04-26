# Release & Deploy Scripts

Adapted from [sharkhunterr/ghostarr](https://github.com/sharkhunterr/ghostarr).
Drives version bumps, multi-remote pushes (GitLab + GitHub),
GitLab/GitHub release creation, and Docker Hub publishing.

The actual heavy lifting (Docker build, GitHub mirror push, GitHub
release creation, Docker Hub publish) happens in
[`.gitlab-ci.yml`](../.gitlab-ci.yml). These local scripts just
orchestrate the bump + push that triggers the CI side-effects.

## Required CI variables

Set these on GitLab → Settings → CI/CD → Variables:

| Variable | Purpose |
|---|---|
| `DOCKER_HUB_USER` | Docker Hub username (image published as `${DOCKER_HUB_USER}/allseerr`) |
| `DOCKER_HUB_TOKEN` | Docker Hub access token (Account Settings → Security) |
| `GITHUB_TOKEN` | Personal access token with `repo` scope |
| `GITHUB_REPO` | `owner/repo` slug (e.g. `jeremiedathee/allseerr`) |

Toggle the `DOCKER_HUB_ENABLED` / `GITHUB_DEPLOY_ENABLED` pipeline
variables to skip a destination on a given run.

## Local CLIs (optional)

The scripts call these CLIs when present, otherwise they fall
through and let GitLab CI create the releases:

```bash
# GitLab CLI
brew install glab
glab auth login

# GitHub CLI
brew install gh
gh auth login
```

## Commands

### Release

```bash
npm run release                # Patch bump, GitLab only
npm run release:github         # Patch bump, GitLab + GitHub
npm run release:deploy         # Patch bump, GitLab + Docker Hub via CI
npm run release:full           # GitLab + GitHub + Docker Hub
npm run release:dry            # Preview, no writes
```

Each script accepts `patch | minor | major` as the first arg:

```bash
node scripts/release.js minor --github        # 1.2.3 → 1.3.0 + GitHub
node scripts/release.js major --github --deploy
```

The release flow runs:

1. `standard-version` — bump `package.json`, regenerate `CHANGELOG.md`,
   commit and tag (`vX.Y.Z`).
2. `git push origin <branch> --follow-tags` (with `-o ci.variable="DEPLOY=true"`
   when `--deploy`).
3. GitLab CI's `deploy` job sees the tag + `DEPLOY=true` and:
    - Builds the Docker image and publishes to Docker Hub.
    - Mirrors the branch + tag to GitHub via `GITHUB_TOKEN`.
4. `release:gitlab` + `release:github` CI jobs create release pages
   on both platforms, sourcing the body from the matching `## [vX.Y.Z]`
   block in `GITHUB_RELEASES.md` (or `CHANGELOG.md` as a fallback).

### Push

```bash
npm run push                   # Push current branch to GitLab
npm run push:github            # Push current branch to GitHub
npm run push:all               # Push to both
npm run push:tags              # Push tags only
npm run push:notags            # Push branch without tags
```

Same flag system as ghostarr's: `--force`, `--no-tags`, `--dry-run`.

### Docker

For local one-off builds; CI handles the production publish:

```bash
npm run docker:build           # Build locally, no push
npm run docker:deploy          # Build + push to Docker Hub
npm run docker:deploy:multi    # linux/amd64 + linux/arm64
```

Image name is read from `package.json` `config.dockerImage` (set
to your own repo) or defaults to `${USER}/allseerr`.

## Release notes layout

The CI extracts the latest release notes from `GITHUB_RELEASES.md`,
falling back to `CHANGELOG.md` if absent. Format expected:

```markdown
## [v1.4.0] - 2026-04-23

### ✨ Features
- ...

### 🐛 Bug Fixes
- ...

# v1.3.0
... (older releases)
```

The "next # vX.Y.Z" boundary tells the parser where the most recent
section ends.

## Troubleshooting

- **`Working directory not clean`** — commit or stash before running
  `release`.
- **`glab not found` / `gh not found`** — local release creation is
  skipped, GitLab CI takes over.
- **GitHub release missing** — confirm `GITHUB_TOKEN` and
  `GITHUB_REPO` variables exist on GitLab CI/CD; the local script
  doesn't call GitHub directly when CI is the canonical creator.
- **Docker Hub push fails on CI** — confirm `DOCKER_HUB_USER` /
  `DOCKER_HUB_TOKEN` and that the token has read+write+delete on
  the repo.

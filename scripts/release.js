#!/usr/bin/env node
/**
 * Flexible release script for Allseerr — adapted from
 * sharkhunterr/ghostarr's release.js. Drives standard-version,
 * pushes to GitLab (origin) + GitHub (handled by GitLab CI), and
 * creates releases on both via CLI when available.
 *
 * Usage:
 *   npm run release              # Standard release (GitLab only)
 *   npm run release:github       # Release to both GitLab and GitHub
 *   npm run release:deploy       # Release and trigger Docker deploy via CI
 *   npm run release:full         # Release to both + Docker deploy
 *
 * Optional flags:
 *   patch | minor | major        # Force a release-as bump
 *   --dry-run                    # Preview changes without writing
 *   --skip-push                  # Bump + tag locally, don't push
 *   --skip-release               # Push, but don't open a release page
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const options = {
  github: args.includes('--github'),
  gitlab: !args.includes('--no-gitlab'),
  deploy: args.includes('--deploy'),
  dryRun: args.includes('--dry-run'),
  skipPush: args.includes('--skip-push'),
  skipRelease: args.includes('--skip-release'),
  releaseType: args.find((a) => ['patch', 'minor', 'major'].includes(a)) || null,
};

function getRemoteUrl(remote) {
  try {
    return execSync(`git remote get-url ${remote}`, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function exec(command, description) {
  console.log(`\n📦 ${description}...`);
  if (options.dryRun) {
    console.log(`   [DRY RUN] ${command}`);
    return '';
  }
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'inherit' });
  } catch {
    console.error(`❌ Failed: ${description}`);
    process.exit(1);
  }
}

function getLatestReleaseNotes() {
  const releasesFile = path.join(__dirname, '..', 'GITHUB_RELEASES.md');
  if (!fs.existsSync(releasesFile)) {
    console.warn(
      '⚠️  GITHUB_RELEASES.md not found, release will have no description'
    );
    return '';
  }
  const content = fs.readFileSync(releasesFile, 'utf8');
  // First H2 release header up to next "# vX.Y.Z" boundary
  const match = content.match(/##\s+\[?v?[\d.]+\]?[^\n]*\n([\s\S]*?)(?=\n##|\n---|\Z)/);
  return match ? match[0].trim() : content.trim();
}

function getCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return pkg.version;
}

async function main() {
  console.log('🚀 Allseerr Release Script\n');
  console.log('Options:', options);

  // Working tree must be clean — refuse to mix uncommitted work into a release.
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status && !options.dryRun) {
      console.error('❌ Working directory not clean. Commit or stash first.');
      process.exit(1);
    }
  } catch {
    console.error('❌ Failed to check git status');
    process.exit(1);
  }

  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
    encoding: 'utf8',
  }).trim();
  console.log(`\n📌 Current branch: ${currentBranch}`);

  const gitlabUrl = getRemoteUrl('origin');
  console.log(`\n🔗 Remotes:`);
  console.log(`   GitLab: ${gitlabUrl || 'not configured'}`);
  console.log(`   GitHub: handled by GitLab CI when --github is set`);

  if (options.gitlab && !gitlabUrl) {
    console.error('❌ GitLab remote (origin) not configured');
    process.exit(1);
  }

  // standard-version handles bump + CHANGELOG + commit + tag.
  let versionCmd = 'npx standard-version';
  if (options.releaseType) versionCmd += ` --release-as ${options.releaseType}`;
  if (options.dryRun) versionCmd += ' --dry-run';
  exec(versionCmd, 'Bumping version with standard-version');

  if (options.dryRun) {
    console.log('\n✅ Dry run completed. No changes made.');
    return;
  }

  const newVersion = getCurrentVersion();
  const tag = `v${newVersion}`;
  console.log(`\n✨ New version: ${tag}`);

  // Push: GitHub mirror + Docker Hub publish are CI side-effects of
  // the tag arriving on origin (see .gitlab-ci.yml deploy job). The
  // --deploy flag toggles the DEPLOY=true CI variable that gates
  // those jobs.
  if (!options.skipPush) {
    const pushOptions = options.deploy ? '-o ci.variable="DEPLOY=true"' : '';
    if (options.gitlab) {
      exec(
        `git push origin ${currentBranch} --follow-tags ${pushOptions}`,
        'Pushing to GitLab'
      );
      if (options.github) {
        console.log('\n💡 GitHub push will be handled by GitLab CI');
      }
    }
  }

  if (!options.skipRelease) {
    const releaseNotes = getLatestReleaseNotes();
    const releaseNotesFile = '/tmp/allseerr-release-notes.md';
    fs.writeFileSync(releaseNotesFile, releaseNotes);

    if (options.gitlab && gitlabUrl) {
      console.log('\n📋 Creating GitLab release...');
      try {
        execSync('which glab', { stdio: 'ignore' });
        exec(
          `glab release create ${tag} --notes-file "${releaseNotesFile}" --name "Release ${tag}"`,
          'Creating GitLab release'
        );
      } catch {
        console.warn(
          '⚠️  glab CLI not found. Skipping local GitLab release; CI will create it.'
        );
      }
    }

    if (options.github) {
      console.log('\n📋 Creating GitHub release...');
      const githubToken = process.env.GITHUB_TOKEN;
      const githubRepo = process.env.GITHUB_REPO;
      if (!githubToken || !githubRepo) {
        console.warn(
          '⚠️  GITHUB_TOKEN / GITHUB_REPO env vars not set locally — GitLab CI will create the GitHub release.'
        );
      } else {
        try {
          execSync('which gh', { stdio: 'ignore' });
          exec(
            `GH_TOKEN=${githubToken} gh release create ${tag} --repo ${githubRepo} --notes-file "${releaseNotesFile}" --title "Release ${tag}"`,
            'Creating GitHub release'
          );
        } catch {
          console.warn(
            '⚠️  gh CLI not found locally — GitLab CI will create the GitHub release.'
          );
        }
      }
    }

    if (fs.existsSync(releaseNotesFile)) fs.unlinkSync(releaseNotesFile);
  }

  console.log('\n✅ Release completed successfully!');
  console.log(`\n📦 Version: ${tag}`);
  if (options.deploy) {
    console.log(`\n🐳 Docker deployment triggered via GitLab CI`);
    console.log(`   Check pipeline: ${gitlabUrl}/-/pipelines`);
  }
}

main().catch((error) => {
  console.error('\n❌ Release failed:', error.message);
  process.exit(1);
});

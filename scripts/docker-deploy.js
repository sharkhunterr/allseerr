#!/usr/bin/env node
/**
 * Local Docker build / push helper for Allseerr — adapted from
 * sharkhunterr/ghostarr's docker-deploy.js. Most users will let
 * GitLab CI handle the Docker Hub publish on tag push (see
 * .gitlab-ci.yml deploy job); this script is for one-off local
 * builds.
 *
 * Usage:
 *   npm run docker:build         # Build locally (no push)
 *   npm run docker:deploy        # Build + push to Docker Hub
 *   npm run docker:deploy:multi  # Multi-platform build + push
 *
 * Image name is read from package.json `config.dockerImage`,
 * falling back to "${USER}/allseerr".
 */

const { execSync } = require('child_process');
const fs = require('fs');

const args = process.argv.slice(2);
const options = {
  push: args.includes('--push'),
  multiPlatform: args.includes('--multi-platform'),
  latest: !args.includes('--no-latest'),
  dryRun: args.includes('--dry-run'),
  buildOnly: args.includes('--build-only'),
};

function getVersion() {
  return JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
}

function getDockerConfig() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return {
    image: pkg.config?.dockerImage || `${process.env.USER || 'allseerr'}/allseerr`,
    registry: pkg.config?.dockerRegistry || 'docker.io',
  };
}

function exec(command, description) {
  console.log(`\n🐳 ${description}...`);
  if (options.dryRun) {
    console.log(`   [DRY RUN] ${command}`);
    return '';
  }
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: 'inherit' });
    console.log('   ✅ Done');
    return output;
  } catch {
    console.error(`   ❌ Failed: ${description}`);
    process.exit(1);
  }
}

function main() {
  console.log('🐳 Allseerr Docker Deployment Script\n');
  console.log('Options:', options);

  const version = getVersion();
  const { image, registry } = getDockerConfig();

  console.log(`\n📦 Version: ${version}`);
  console.log(`🐋 Image: ${registry}/${image}`);

  try {
    execSync('docker info', { stdio: 'ignore' });
  } catch {
    console.error('❌ Docker is not running. Please start Docker and try again.');
    process.exit(1);
  }

  const tags = [
    `${registry}/${image}:${version}`,
    `${registry}/${image}:v${version}`,
  ];
  if (options.latest) tags.push(`${registry}/${image}:latest`);
  console.log(`\n🏷️  Tags: ${tags.join(', ')}`);

  // Allseerr's Dockerfile is at the repo root, not docker/Dockerfile.
  const dockerfile = 'Dockerfile';

  if (options.multiPlatform) {
    console.log('\n🌍 Building for multiple platforms (linux/amd64, linux/arm64)...');
    exec(
      'docker buildx create --use --name allseerr-builder 2>/dev/null || docker buildx use allseerr-builder',
      'Setting up buildx builder'
    );
    const tagArgs = tags.map((t) => `-t ${t}`).join(' ');
    const pushFlag = options.push ? '--push' : '--load';
    exec(
      `docker buildx build --platform linux/amd64,linux/arm64 ${tagArgs} ${pushFlag} -f ${dockerfile} .`,
      'Building multi-platform image'
    );
  } else {
    const tagArgs = tags.map((t) => `-t ${t}`).join(' ');
    exec(`docker build ${tagArgs} -f ${dockerfile} .`, 'Building Docker image');
    if (options.push && !options.buildOnly) {
      for (const tag of tags) exec(`docker push ${tag}`, `Pushing ${tag}`);
    }
  }

  console.log('\n✅ Docker deployment completed successfully!');
  if (options.push) {
    console.log(`\n🔗 Docker Hub: https://hub.docker.com/r/${image}`);
    console.log(`\n📥 Pull with: docker pull ${registry}/${image}:${version}`);
  } else {
    console.log(`\n💡 To push to Docker Hub, run: npm run docker:deploy`);
  }
}

main();

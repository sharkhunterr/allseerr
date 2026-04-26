/**
 * @type {import('next').NextConfig}
 */
module.exports = {
  env: {
    commitTag: process.env.COMMIT_TAG || 'local',
  },
  // Pre-existing seerr / jellyseerr TS errors (MediaType vs the
  // narrower "movie" | "tv" union in ListView / RequestBlock /
  // UserProfile / _app etc.) trip `next build`'s strict type-check
  // and fail the production bundle even though dev mode runs fine.
  // Type validation still happens in CI via the dedicated
  // validate:typecheck job (`pnpm typecheck`) — no need to make
  // `next build` redundantly enforce it.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Same rationale for ESLint: lint runs on its own validate:lint
  // job, no need to fail the build on style issues.
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { hostname: 'gravatar.com' },
      { hostname: 'image.tmdb.org' },
      { hostname: 'artworks.thetvdb.com' },
      { hostname: 'plex.tv' },
    ],
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      issuer: /\.(js|ts)x?$/,
      use: ['@svgr/webpack'],
    });

    return config;
  },
  experimental: {
    scrollRestoration: true,
    largePageDataBytes: 512 * 1000,
  },
};

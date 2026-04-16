import logger from '@server/logger';

/**
 * Music feature flag — defaults to disabled.
 * Set ENABLE_MUSIC=true environment variable to activate stubs.
 * FR-015, FR-016, FR-017, FR-018.
 */
export function isMusicEnabled(): boolean {
  return process.env.ENABLE_MUSIC?.toLowerCase() === 'true';
}

/**
 * Log the music feature flag state at startup.
 * FR-018.
 */
export function logMusicFeatureFlagState(): void {
  const enabled = isMusicEnabled();
  logger.info(`Music feature flag: ${enabled ? 'ENABLED' : 'DISABLED'}`, {
    label: 'music',
  });
}

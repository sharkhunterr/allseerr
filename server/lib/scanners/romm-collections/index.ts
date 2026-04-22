import { createRommAdapterFromSettings } from '@server/lib/adapters/game/RommAdapter';
import cacheManager from '@server/lib/cache';
import type { StatusBase } from '@server/lib/scanners/baseScanner';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface RommCollectionsScanStatus extends StatusBase {
  totalCollections: number;
  lastScanAt?: number;
  lastDurationMs?: number;
}

/**
 * Pre-populates the ROMM collection cache so interactive /game/:id and
 * /game/search requests don't pay the "list all + fetch each" cost on
 * first hit. Only touches the in-memory NodeCache keyed off
 * `collections:list` and `collection:<id>` on the romm bucket — no DB
 * writes.
 */
class RommCollectionsScanner {
  private running = false;
  private progress = 0;
  private totalSize = 0;
  private totalCollections = 0;
  private lastScanAt: number | undefined;
  private lastDurationMs: number | undefined;

  public status(): RommCollectionsScanStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.totalSize,
      totalCollections: this.totalCollections,
      lastScanAt: this.lastScanAt,
      lastDurationMs: this.lastDurationMs,
    };
  }

  public cancel(): void {
    this.running = false;
  }

  public async run(): Promise<void> {
    if (this.running) {
      logger.warn('ROMM collections scan already running', {
        label: 'ROMM Collections Scan',
      });
      return;
    }

    const rommSettings = getSettings().game?.romm;
    if (!rommSettings?.enabled || !rommSettings?.url) {
      logger.debug('ROMM collections scan skipped: ROMM not configured', {
        label: 'ROMM Collections Scan',
      });
      return;
    }

    const adapter = createRommAdapterFromSettings();
    if (!adapter) {
      logger.debug('ROMM collections scan skipped: adapter unavailable', {
        label: 'ROMM Collections Scan',
      });
      return;
    }

    this.running = true;
    this.progress = 0;
    this.totalSize = 0;
    const startedAt = Date.now();

    try {
      logger.info('Starting ROMM collections scan', {
        label: 'ROMM Collections Scan',
      });

      // Nuke the entire ROMM cache bucket so we force a fresh
      // listCollections call — the list call itself populates every
      // per-collection detail key from the same response payload,
      // so there's no per-id GET loop to run afterwards. This
      // matters on instances with 1000+ virtual collections where
      // the old loop drowned ROMM in parallel requests (socket
      // hang ups, 502s in the logs).
      const cache = cacheManager.getCache('romm').data;
      cache.flushAll();

      const summaries = await adapter.listCollections();
      this.totalSize = summaries.length;
      this.totalCollections = summaries.length;
      this.progress = summaries.length;

      this.lastScanAt = Date.now();
      this.lastDurationMs = this.lastScanAt - startedAt;
      const userCount = summaries.filter((s) => s.kind === 'user').length;
      const virtualCount = summaries.filter((s) => s.kind === 'virtual').length;
      logger.info(
        `ROMM collections scan complete: ${summaries.length} cached (${userCount} user, ${virtualCount} virtual) in ${this.lastDurationMs}ms`,
        { label: 'ROMM Collections Scan' }
      );
    } catch (e) {
      logger.error('ROMM collections scan failed', {
        label: 'ROMM Collections Scan',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      this.running = false;
    }
  }
}

export const rommCollectionsScanner = new RommCollectionsScanner();

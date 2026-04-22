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

      // Force a cache miss so we re-fetch the authoritative list.
      // The adapter will then re-populate the `collections:list` key
      // itself; we also prime the per-collection detail cache below.
      const cache = cacheManager.getCache('romm').data;
      cache.del('collections:list');

      const summaries = await adapter.listCollections();
      this.totalSize = summaries.length;
      this.totalCollections = summaries.length;

      for (const s of summaries) {
        if (!this.running) break;
        // Force-refresh each per-collection detail too so a brand-new
        // ROM that was just added to a collection surfaces in the
        // next /game/:id hit without waiting for the 10-min TTL.
        cache.del(`collection:${s.id}`);
        await adapter.getCollection(s.id);
        this.progress++;
      }

      this.lastScanAt = Date.now();
      this.lastDurationMs = this.lastScanAt - startedAt;
      logger.info(
        `ROMM collections scan complete: ${summaries.length} collections cached in ${this.lastDurationMs}ms`,
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

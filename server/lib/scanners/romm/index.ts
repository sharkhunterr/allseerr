import { MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { GameMedia } from '@server/entity/GameMedia';
import { RommAdapter } from '@server/lib/adapters/game/RommAdapter';
import type { StatusBase } from '@server/lib/scanners/baseScanner';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { In } from 'typeorm';

export interface RommSyncStatus extends StatusBase {
  newGames: number;
  updatedGames: number;
}

const PAGE_SIZE = 250;

class RommScanner {
  private running = false;
  private progress = 0;
  private totalSize = 0;
  private newGames = 0;
  private updatedGames = 0;

  public status(): RommSyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.totalSize,
      newGames: this.newGames,
      updatedGames: this.updatedGames,
    };
  }

  public cancel(): void {
    this.running = false;
  }

  public async run(): Promise<void> {
    if (this.running) {
      logger.warn('ROMM scan already running', { label: 'ROMM Scan' });
      return;
    }

    const settings = getSettings();
    const rommSettings = settings.game.romm;

    if (!rommSettings.enabled || !rommSettings.url) {
      logger.debug('ROMM scan skipped: not configured or disabled', {
        label: 'ROMM Scan',
      });
      return;
    }

    this.running = true;
    this.progress = 0;
    this.totalSize = 0;
    this.newGames = 0;
    this.updatedGames = 0;

    try {
      const rommUrl = new URL(rommSettings.url);
      const adapter = new RommAdapter({
        hostname: rommUrl.hostname,
        port:
          parseInt(rommUrl.port) ||
          (rommUrl.protocol === 'https:' ? 443 : 80),
        apiKey: rommSettings.apiKey,
        useSsl: rommUrl.protocol === 'https:',
      });

      logger.info('Starting ROMM scan', { label: 'ROMM Scan' });

      const gameMediaRepo = getRepository(GameMedia);
      let page = 1;
      let hasMore = true;

      while (hasMore && this.running) {
        const result = await adapter.getGamesPage(page, PAGE_SIZE);
        hasMore = result.hasMore;
        this.totalSize = result.total;

        // Filter games that have an IGDB ID
        const gamesWithIgdb = result.games.filter((g) => g.igdb_id);

        if (gamesWithIgdb.length > 0) {
          // Batch lookup: find all existing GameMedia for these IGDB IDs
          const igdbIds = gamesWithIgdb.map((g) => g.igdb_id!);
          const existingMedia = await gameMediaRepo.find({
            where: { igdbId: In(igdbIds) },
          });
          const existingByIgdbId = new Map(
            existingMedia.map((m) => [m.igdbId, m])
          );

          for (const game of gamesWithIgdb) {
            const existing = existingByIgdbId.get(game.igdb_id!);

            if (existing) {
              if (existing.status !== MediaStatus.AVAILABLE) {
                existing.status = MediaStatus.AVAILABLE;
                existing.rommId = game.id;
                await gameMediaRepo.save(existing);
                this.updatedGames++;
              }
            } else {
              const newMedia = new GameMedia({
                title: game.fs_name_no_tags || game.name,
                igdbId: game.igdb_id!,
                platformIgdbId: 0,
                platformName:
                  game.platform_display_name ??
                  game.platform_name ??
                  'Unknown',
                status: MediaStatus.AVAILABLE,
                rommId: game.id,
              });
              await gameMediaRepo.save(newMedia);
              this.newGames++;
            }
          }
        }

        this.progress += result.games.length;
        page++;
      }

      logger.info(
        `ROMM scan complete: ${this.newGames} new, ${this.updatedGames} updated out of ${this.totalSize} games`,
        { label: 'ROMM Scan' }
      );
    } catch (e) {
      logger.error('ROMM scan failed', {
        label: 'ROMM Scan',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      this.running = false;
    }
  }
}

export const rommScanner = new RommScanner();

import { MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { GameMedia } from '@server/entity/GameMedia';
import { RommAdapter } from '@server/lib/adapters/game/RommAdapter';
import type { StatusBase } from '@server/lib/scanners/baseScanner';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface RommSyncStatus extends StatusBase {
  newGames: number;
  updatedGames: number;
}

const PAGE_SIZE = 100;

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

        for (const game of result.games) {
          if (!this.running) {
            logger.info('ROMM scan cancelled', { label: 'ROMM Scan' });
            return;
          }

          this.progress++;
          this.totalSize = this.progress + (hasMore ? PAGE_SIZE : 0);

          if (!game.igdb_id) {
            continue;
          }

          const existing = await gameMediaRepo.findOne({
            where: {
              igdbId: game.igdb_id,
              ...(game.platform_igdb_id
                ? { platformIgdbId: game.platform_igdb_id }
                : {}),
            },
          });

          if (existing) {
            if (existing.status !== MediaStatus.AVAILABLE) {
              existing.status = MediaStatus.AVAILABLE;
              existing.rommId = game.id;
              await gameMediaRepo.save(existing);
              this.updatedGames++;
            }
          } else {
            const newMedia = new GameMedia({
              title: game.name,
              igdbId: game.igdb_id,
              platformIgdbId: game.platform_igdb_id ?? 0,
              platformName: game.platform_name ?? 'Unknown',
              status: MediaStatus.AVAILABLE,
              rommId: game.id,
            });
            await gameMediaRepo.save(newMedia);
            this.newGames++;
          }
        }

        page++;
      }

      this.totalSize = this.progress;

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

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

      const publicUrl = rommSettings.publicUrl || rommSettings.url;
      const gameMediaRepo = getRepository(GameMedia);
      let page = 1;
      let hasMore = true;
      // Track seen igdbId+platformId across all pages to skip
      // duplicate ROMs (hacks, regions, No-Intro variants, etc.)
      const seen = new Set<string>();

      while (hasMore && this.running) {
        const result = await adapter.getGamesPage(page, PAGE_SIZE);
        hasMore = result.hasMore;
        this.totalSize = result.total;

        // Filter games that have an IGDB ID
        const gamesWithIgdb = result.games.filter((g) => g.igdb_id);

        if (gamesWithIgdb.length > 0) {
          for (const game of gamesWithIgdb) {
            const platformId = game.platform_id ?? 0;
            const key = `${game.igdb_id}:${platformId}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const existing = await gameMediaRepo.findOne({
              where: { igdbId: game.igdb_id!, platformIgdbId: platformId },
            });

            const rommUrl = `${publicUrl}/rom/${game.id}`;

            if (existing) {
              if (existing.status !== MediaStatus.AVAILABLE || !existing.rommUrl) {
                existing.status = MediaStatus.AVAILABLE;
                existing.rommId = game.id;
                existing.rommUrl = rommUrl;
                await gameMediaRepo.save(existing);
                this.updatedGames++;
              }
            } else {
              try {
                const newMedia = new GameMedia({
                  title: game.fs_name_no_tags || game.name,
                  igdbId: game.igdb_id!,
                  platformIgdbId: platformId,
                  platformName:
                    game.platform_display_name ??
                    game.platform_name ??
                    'Unknown',
                  status: MediaStatus.AVAILABLE,
                  rommId: game.id,
                  rommUrl,
                });
                await gameMediaRepo.save(newMedia);
                this.newGames++;
              } catch {
                // Skip duplicates from concurrent inserts
              }
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

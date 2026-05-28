import MylarAPI from '@server/api/mylar';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { ComicMedia } from '@server/entity/ComicMedia';
import { MediaRequest } from '@server/entity/MediaRequest';
import notificationManager, {
  Notification,
} from '@server/lib/notifications';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

/**
 * Polls Mylar3 for the download progress of every comic that's
 * currently PENDING / PROCESSING / PARTIALLY_AVAILABLE and
 * mirrors the counts back onto the ComicMedia row so the
 * dashboard / detail page can derive PARTIALLY_AVAILABLE without
 * a per-render API call.
 *
 * Mylar3's ``getComic`` returns ``haveIssues / totalIssues``:
 *   * have === 0 → leave PROCESSING (Mylar tracking the series
 *     but hasn't downloaded anything yet)
 *   * 0 < have < total → PARTIALLY_AVAILABLE
 *   * have >= total → AVAILABLE + complete the request
 *
 * No-ops when Mylar isn't configured (manual workflow). Falls
 * open on errors so a transient Mylar outage never demotes a
 * media row's status.
 */
export class ComicAvailabilityScanner {
  private running = false;

  public isRunning(): boolean {
    return this.running;
  }

  async run(): Promise<number> {
    if (this.running) {
      logger.debug('Comic availability scan already running', {
        label: 'comic-scanner',
      });
      return 0;
    }
    const cfg = getSettings().comic.mylar;
    if (!cfg?.enabled || !cfg.url || !cfg.apiKey) {
      return 0;
    }
    this.running = true;
    try {
      const api = new MylarAPI({ url: cfg.url, apiKey: cfg.apiKey });
      const mediaRepo = getRepository(ComicMedia);
      const requestRepo = getRepository(MediaRequest);

      const pending = await mediaRepo.find({
        where: [
          { status: MediaStatus.PENDING },
          { status: MediaStatus.PROCESSING },
          { status: MediaStatus.PARTIALLY_AVAILABLE },
        ],
      });

      let updated = 0;
      for (const media of pending) {
        try {
          const summary = await api.getComic(media.comicVineId);
          if (!summary) continue;
          const total = summary.totalIssues ?? media.issueCount ?? 0;
          const have = summary.haveIssues ?? 0;
          if (total <= 0) continue;
          const before = media.status;
          let next = before;
          if (have <= 0) {
            next = MediaStatus.PROCESSING;
          } else if (have >= total) {
            next = MediaStatus.AVAILABLE;
          } else {
            next = MediaStatus.PARTIALLY_AVAILABLE;
          }
          media.availableIssues = have;
          // Keep the cached total in sync — Mylar's count is more
          // authoritative than the original ComicVine snapshot,
          // which can lag when issues are added late.
          if (typeof summary.totalIssues === 'number' && summary.totalIssues > 0) {
            media.issueCount = summary.totalIssues;
          }
          if (next !== before) {
            media.status = next;
          }
          await mediaRepo.save(media);
          updated++;

          if (next === MediaStatus.AVAILABLE && before !== next) {
            const requests = await requestRepo.find({
              where: { comicMedia: { id: media.id } },
              relations: ['requestedBy'],
            });
            for (const request of requests) {
              if (
                request.status === MediaRequestStatus.APPROVED ||
                request.status === MediaRequestStatus.PENDING
              ) {
                request.status = MediaRequestStatus.COMPLETED;
                await requestRepo.save(request);
                notificationManager.sendNotification(
                  Notification.MEDIA_AVAILABLE,
                  {
                    subject: `Available: ${media.title}`,
                    message: `"${media.title}" is now available in your library`,
                    notifyAdmin: true,
                    notifySystem: true,
                    media: {
                      mediaType: 'comic' as never,
                      tmdbId: 0,
                      tvdbId: 0,
                      status: MediaStatus.AVAILABLE,
                      status4k: MediaStatus.UNKNOWN,
                    },
                    request,
                  } as unknown as Parameters<
                    typeof notificationManager.sendNotification
                  >[1]
                );
              }
            }
          }
        } catch (e) {
          logger.debug(
            `Comic scanner failed for "${media.title}": ${
              e instanceof Error ? e.message : String(e)
            }`,
            { label: 'comic-scanner' }
          );
        }
      }
      if (updated > 0) {
        logger.info(`Comic availability scan updated ${updated} rows`, {
          label: 'comic-scanner',
        });
      }
      return updated;
    } finally {
      this.running = false;
    }
  }
}

export const comicAvailabilityScanner = new ComicAvailabilityScanner();
export default ComicAvailabilityScanner;

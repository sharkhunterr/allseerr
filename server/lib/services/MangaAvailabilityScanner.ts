import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { MangaMedia } from '@server/entity/MangaMedia';
import { MediaRequest } from '@server/entity/MediaRequest';
import SuwayomiAPI from '@server/api/suwayomi';
import notificationManager, {
  Notification,
} from '@server/lib/notifications';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

/**
 * Polls Suwayomi for the download progress of every manga that's
 * currently PENDING or PROCESSING and mirrors the counts back
 * onto the MangaMedia row so the dashboard / detail page can
 * derive PARTIALLY_AVAILABLE without a per-render API call.
 *
 * Transitions, derived from Suwayomi's
 * ``chaptersTotalCount`` + ``chaptersDownloadedCount``:
 *   * downloaded === 0 → leave PROCESSING (download not started)
 *   * 0 < downloaded < total → PARTIALLY_AVAILABLE
 *   * downloaded >= total → AVAILABLE + complete the request
 *
 * No-ops when Suwayomi isn't configured (manual workflow). Falls
 * open on Suwayomi errors so a transient outage never demotes a
 * media row's status.
 */
export class MangaAvailabilityScanner {
  private running = false;

  public isRunning(): boolean {
    return this.running;
  }

  async run(): Promise<number> {
    if (this.running) {
      logger.debug('Manga availability scan already running', {
        label: 'manga-scanner',
      });
      return 0;
    }
    const cfg = getSettings().manga.suwayomi;
    if (!cfg?.enabled || !cfg.url) {
      return 0;
    }
    this.running = true;
    try {
      const api = new SuwayomiAPI({
        url: cfg.url,
        apiKey: cfg.apiKey,
        username: cfg.username,
        password: cfg.password,
      });
      const mediaRepo = getRepository(MangaMedia);
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
        const extId = media.downloadManagerExternalId;
        if (!extId) continue;
        const suwayomiId = Number(extId);
        if (!Number.isInteger(suwayomiId)) continue;
        try {
          const m = await api.getManga(suwayomiId);
          if (!m) continue;
          const total = m.chaptersTotalCount ?? media.chapters ?? 0;
          const have = m.chaptersDownloadedCount ?? 0;
          // Skip rows where Suwayomi hasn't yet populated a total
          // (race: dispatch just happened, source hasn't been
          // crawled for chapters yet).
          if (total <= 0) continue;
          const before = media.status;
          let next = before;
          if (have <= 0) {
            // Stay PROCESSING — Suwayomi is tracking the manga
            // but hasn't downloaded anything yet.
            next = MediaStatus.PROCESSING;
          } else if (have >= total) {
            next = MediaStatus.AVAILABLE;
          } else {
            next = MediaStatus.PARTIALLY_AVAILABLE;
          }
          media.availableChapters = have;
          // ``volumes`` isn't tracked by Suwayomi directly;
          // approximate from total/have ratio when AniList told
          // us how many volumes the series has. Rounding keeps
          // the badge logic stable.
          if (typeof media.volumes === 'number' && media.volumes > 0) {
            media.availableVolumes = Math.min(
              media.volumes,
              Math.floor((have / total) * media.volumes)
            );
          }
          if (next !== before) {
            media.status = next;
          }
          await mediaRepo.save(media);
          updated++;

          // Promote in-flight request rows to COMPLETED on
          // first AVAILABLE — mirrors the BookAvailabilityScanner
          // notification path so the requester gets a heads-up.
          if (next === MediaStatus.AVAILABLE && before !== next) {
            const requests = await requestRepo.find({
              where: { mangaMedia: { id: media.id } },
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
                      mediaType: 'manga' as never,
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
            `Manga scanner failed for "${media.title}": ${
              e instanceof Error ? e.message : String(e)
            }`,
            { label: 'manga-scanner' }
          );
        }
      }
      if (updated > 0) {
        logger.info(`Manga availability scan updated ${updated} rows`, {
          label: 'manga-scanner',
        });
      }
      return updated;
    } finally {
      this.running = false;
    }
  }
}

export const mangaAvailabilityScanner = new MangaAvailabilityScanner();
export default MangaAvailabilityScanner;

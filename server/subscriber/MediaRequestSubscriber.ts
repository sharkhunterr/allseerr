import type { RadarrMovieOptions } from '@server/api/servarr/radarr';
import RadarrAPI from '@server/api/servarr/radarr';
import type {
  AddSeriesOptions,
  SonarrSeries,
} from '@server/api/servarr/sonarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import TheMovieDb from '@server/api/themoviedb';
import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { AudiobookMedia } from '@server/entity/AudiobookMedia';
import { BookMedia } from '@server/entity/BookMedia';
import type { GameMedia as GameMediaType } from '@server/entity/GameMedia';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import SeasonRequest from '@server/entity/SeasonRequest';
import notificationManager, { Notification } from '@server/lib/notifications';
import { submitToBindery } from '@server/lib/services/binderyDispatcher';
import { submitToBookshelf } from '@server/lib/services/bookshelfDispatcher';
import { submitToLivrarr } from '@server/lib/services/livrarrDispatcher';
import { submitToMylar } from '@server/lib/services/mylarDispatcher';
import {
  romarrStillHasGame,
  submitToRomarr,
} from '@server/lib/services/romarrDispatcher';
import { submitToSuwayomi } from '@server/lib/services/suwayomiDispatcher';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { isEqual, truncate } from 'lodash';
import type {
  EntityManager,
  EntitySubscriberInterface,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { EventSubscriber, Not } from 'typeorm';

const sanitizeDisplayName = (displayName: string): string => {
  return displayName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

@EventSubscriber()
export class MediaRequestSubscriber implements EntitySubscriberInterface<MediaRequest> {
  private async notifyAvailableMovie(
    entity: MediaRequest,
    event?: UpdateEvent<MediaRequest>
  ) {
    // Get fresh media state using event manager
    let latestMedia: Media | null = null;
    if (event?.manager) {
      latestMedia = await event.manager.findOne(Media, {
        where: { id: entity.media.id },
      });
    }
    if (!latestMedia) {
      const mediaRepository = getRepository(Media);
      latestMedia = await mediaRepository.findOne({
        where: { id: entity.media.id },
      });
    }

    // Check availability using fresh media state
    if (
      !latestMedia ||
      latestMedia[entity.is4k ? 'status4k' : 'status'] !== MediaStatus.AVAILABLE
    ) {
      return;
    }

    const tmdb = new TheMovieDb();

    try {
      const movie = await tmdb.getMovie({
        movieId: entity.media.tmdbId,
      });

      notificationManager.sendNotification(Notification.MEDIA_AVAILABLE, {
        event: `${entity.is4k ? '4K ' : ''}Movie Request Now Available`,
        notifyAdmin: false,
        notifySystem: true,
        notifyUser: entity.requestedBy,
        subject: `${movie.title}${
          movie.release_date ? ` (${movie.release_date.slice(0, 4)})` : ''
        }`,
        message: truncate(movie.overview, {
          length: 500,
          separator: /\s/,
          omission: '…',
        }),
        media: latestMedia,
        image: `https://image.tmdb.org/t/p/w600_and_h900_bestv2${movie.poster_path}`,
        request: entity,
      });
    } catch (e) {
      logger.error('Something went wrong sending media notification(s)', {
        label: 'Notifications',
        errorMessage: e.message,
        mediaId: entity.id,
      });
    }
  }

  private async notifyAvailableSeries(
    entity: MediaRequest,
    event?: UpdateEvent<MediaRequest>
  ) {
    // Get fresh media state with seasons using event manager
    let latestMedia: Media | null = null;
    if (event?.manager) {
      latestMedia = await event.manager.findOne(Media, {
        where: { id: entity.media.id },
        relations: { seasons: true },
      });
    }
    if (!latestMedia) {
      const mediaRepository = getRepository(Media);
      latestMedia = await mediaRepository.findOne({
        where: { id: entity.media.id },
        relations: { seasons: true },
      });
    }

    if (!latestMedia) {
      return;
    }

    // Check availability using fresh media state
    const requestedSeasons =
      entity.seasons?.map((entitySeason) => entitySeason.seasonNumber) ?? [];
    const availableSeasons = latestMedia.seasons.filter(
      (season) =>
        season[entity.is4k ? 'status4k' : 'status'] === MediaStatus.AVAILABLE &&
        requestedSeasons.includes(season.seasonNumber)
    );
    const isMediaAvailable =
      availableSeasons.length > 0 &&
      availableSeasons.length === requestedSeasons.length;

    if (!isMediaAvailable) {
      return;
    }

    const tmdb = new TheMovieDb();

    try {
      const tv = await tmdb.getTvShow({ tvId: entity.media.tmdbId });

      notificationManager.sendNotification(Notification.MEDIA_AVAILABLE, {
        event: `${entity.is4k ? '4K ' : ''}Series Request Now Available`,
        subject: `${tv.name}${
          tv.first_air_date ? ` (${tv.first_air_date.slice(0, 4)})` : ''
        }`,
        message: truncate(tv.overview, {
          length: 500,
          separator: /\s/,
          omission: '…',
        }),
        notifyAdmin: false,
        notifySystem: true,
        notifyUser: entity.requestedBy,
        image: `https://image.tmdb.org/t/p/w600_and_h900_bestv2${tv.poster_path}`,
        media: latestMedia,
        extra: [
          {
            name: 'Requested Seasons',
            value: entity.seasons
              .map((season) => season.seasonNumber)
              .join(', '),
          },
        ],
        request: entity,
      });
    } catch (e) {
      logger.error('Something went wrong sending media notification(s)', {
        label: 'Notifications',
        errorMessage: e.message,
        mediaId: entity.id,
      });
    }
  }

  public async sendToRadarr(entity: MediaRequest): Promise<void> {
    if (
      entity.status === MediaRequestStatus.APPROVED &&
      entity.type === MediaType.MOVIE
    ) {
      try {
        const mediaRepository = getRepository(Media);
        const settings = getSettings();
        if (settings.radarr.length === 0 && !settings.radarr[0]) {
          logger.info(
            'No Radarr server configured, skipping request processing',
            {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
            }
          );
          return;
        }

        let radarrSettings = settings.radarr.find(
          (radarr) => radarr.isDefault && radarr.is4k === entity.is4k
        );

        if (
          entity.serverId !== null &&
          entity.serverId >= 0 &&
          radarrSettings?.id !== entity.serverId
        ) {
          radarrSettings = settings.radarr.find(
            (radarr) => radarr.id === entity.serverId
          );
          logger.info(
            `Request has an override server: ${radarrSettings?.name}`,
            {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
            }
          );
        }

        if (!radarrSettings) {
          logger.warn(
            `There is no default ${
              entity.is4k ? '4K ' : ''
            }Radarr server configured. Did you set any of your ${
              entity.is4k ? '4K ' : ''
            }Radarr servers as default?`,
            {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
            }
          );
          return;
        }

        let rootFolder = radarrSettings.activeDirectory;
        let qualityProfile = radarrSettings.activeProfileId;
        let tags = radarrSettings.tags ? [...radarrSettings.tags] : [];

        if (
          entity.rootFolder &&
          entity.rootFolder !== '' &&
          entity.rootFolder !== radarrSettings.activeDirectory
        ) {
          rootFolder = entity.rootFolder;
          logger.info(`Request has an override root folder: ${rootFolder}`, {
            label: 'Media Request',
            requestId: entity.id,
            mediaId: entity.media.id,
          });
        }

        if (
          entity.profileId &&
          entity.profileId !== radarrSettings.activeProfileId
        ) {
          qualityProfile = entity.profileId;
          logger.info(
            `Request has an override quality profile ID: ${qualityProfile}`,
            {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
            }
          );
        }

        if (entity.tags && !isEqual(entity.tags, radarrSettings.tags)) {
          tags = entity.tags;
          logger.info(`Request has override tags`, {
            label: 'Media Request',
            requestId: entity.id,
            mediaId: entity.media.id,
            tagIds: tags,
          });
        }

        const tmdb = new TheMovieDb();
        const radarr = new RadarrAPI({
          apiKey: radarrSettings.apiKey,
          url: RadarrAPI.buildUrl(radarrSettings, '/api/v3'),
        });
        const movie = await tmdb.getMovie({ movieId: entity.media.tmdbId });

        const media = await mediaRepository.findOne({
          where: { id: entity.media.id },
        });

        if (!media) {
          logger.error('Media data not found', {
            label: 'Media Request',
            requestId: entity.id,
            mediaId: entity.media.id,
          });
          return;
        }

        if (radarrSettings.tagRequests) {
          const radarrTags = await radarr.getTags();
          // old tags had space around the hyphen
          let userTag = radarrTags.find((v) =>
            v.label.startsWith(entity.requestedBy.id + ' - ')
          );
          // new tags do not have spaces around the hyphen, since spaces are not allowed anymore
          if (!userTag) {
            userTag = radarrTags.find((v) =>
              v.label.startsWith(entity.requestedBy.id + '-')
            );
          }
          if (!userTag) {
            logger.info(`Requester has no active tag. Creating new`, {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
              userId: entity.requestedBy.id,
              newTag:
                entity.requestedBy.id +
                '-' +
                sanitizeDisplayName(entity.requestedBy.displayName),
            });
            userTag = await radarr.createTag({
              label:
                entity.requestedBy.id +
                '-' +
                sanitizeDisplayName(entity.requestedBy.displayName),
            });
          }
          if (userTag.id) {
            if (!tags?.find((v) => v === userTag?.id)) {
              tags?.push(userTag.id);
            }
          } else {
            logger.warn(`Requester has no tag and failed to add one`, {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
              userId: entity.requestedBy.id,
              radarrServer: radarrSettings.hostname + ':' + radarrSettings.port,
            });
          }
        }

        if (
          media[entity.is4k ? 'status4k' : 'status'] === MediaStatus.AVAILABLE
        ) {
          logger.warn('Media already exists, marking request as COMPLETED', {
            label: 'Media Request',
            requestId: entity.id,
            mediaId: entity.media.id,
          });

          const requestRepository = getRepository(MediaRequest);
          entity.status = MediaRequestStatus.COMPLETED;
          await requestRepository.save(entity);
          return;
        }

        const radarrMovieOptions: RadarrMovieOptions = {
          profileId: qualityProfile,
          qualityProfileId: qualityProfile,
          rootFolderPath: rootFolder,
          minimumAvailability: radarrSettings.minimumAvailability,
          title: movie.title,
          tmdbId: movie.id,
          year: Number(movie.release_date.slice(0, 4)),
          monitored: true,
          tags,
          searchNow: !radarrSettings.preventSearch,
        };

        // Run entity asynchronously so we don't wait for it on the UI side
        radarr
          .addMovie(radarrMovieOptions)
          .then(async (radarrMovie) => {
            // We grab media again here to make sure we have the latest version of it
            const media = await mediaRepository.findOne({
              where: { id: entity.media.id },
            });

            if (!media) {
              throw new Error('Media data not found');
            }

            media[entity.is4k ? 'externalServiceId4k' : 'externalServiceId'] =
              radarrMovie.id;
            media[
              entity.is4k ? 'externalServiceSlug4k' : 'externalServiceSlug'
            ] = radarrMovie.titleSlug;
            media[entity.is4k ? 'serviceId4k' : 'serviceId'] =
              radarrSettings?.id;
            await mediaRepository.save(media);
          })
          .catch(async () => {
            try {
              const requestRepository = getRepository(MediaRequest);

              if (entity.status !== MediaRequestStatus.FAILED) {
                entity.status = MediaRequestStatus.FAILED;
                await requestRepository.save(entity);
              }
            } catch (saveError) {
              logger.error('Failed to mark request as FAILED', {
                label: 'Media Request',
                requestId: entity.id,
                errorMessage:
                  saveError instanceof Error
                    ? saveError.message
                    : String(saveError),
              });
            }

            logger.warn(
              'Something went wrong sending movie request to Radarr, marking status as FAILED',
              {
                label: 'Media Request',
                requestId: entity.id,
                mediaId: entity.media.id,
                radarrMovieOptions,
              }
            );

            MediaRequest.sendNotification(
              entity,
              media,
              Notification.MEDIA_FAILED
            );
          })
          .finally(() => {
            radarr.clearCache({
              tmdbId: movie.id,
              externalId: entity.is4k
                ? media.externalServiceId4k
                : media.externalServiceId,
            });
          });
        logger.info('Sent request to Radarr', {
          label: 'Media Request',
          requestId: entity.id,
          mediaId: entity.media.id,
        });
      } catch (e) {
        const requestRepository = getRepository(MediaRequest);
        const mediaRepository = getRepository(Media);
        const media = await mediaRepository.findOne({
          where: { id: entity.media.id },
        });

        if (media) {
          entity.status = MediaRequestStatus.FAILED;
          await requestRepository.save(entity);

          logger.warn(
            'Failed to send movie request to Radarr due to connection or configuration error, marking status as FAILED',
            {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
              errorMessage: e.message,
            }
          );

          MediaRequest.sendNotification(
            entity,
            media,
            Notification.MEDIA_FAILED
          );
        }
      }
    }
  }

  public async sendToSonarr(entity: MediaRequest): Promise<void> {
    if (
      entity.status === MediaRequestStatus.APPROVED &&
      entity.type === MediaType.TV
    ) {
      try {
        const mediaRepository = getRepository(Media);
        const settings = getSettings();
        if (settings.sonarr.length === 0 && !settings.sonarr[0]) {
          logger.warn(
            'No Sonarr server configured, skipping request processing',
            {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
            }
          );
          return;
        }

        let sonarrSettings = settings.sonarr.find(
          (sonarr) => sonarr.isDefault && sonarr.is4k === entity.is4k
        );

        if (
          entity.serverId !== null &&
          entity.serverId >= 0 &&
          sonarrSettings?.id !== entity.serverId
        ) {
          sonarrSettings = settings.sonarr.find(
            (sonarr) => sonarr.id === entity.serverId
          );
          logger.info(
            `Request has an override server: ${sonarrSettings?.name}`,
            {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
            }
          );
        }

        if (!sonarrSettings) {
          logger.warn(
            `There is no default ${
              entity.is4k ? '4K ' : ''
            }Sonarr server configured. Did you set any of your ${
              entity.is4k ? '4K ' : ''
            }Sonarr servers as default?`,
            {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
            }
          );
          return;
        }

        const media = await mediaRepository.findOne({
          where: { id: entity.media.id },
        });

        if (!media) {
          throw new Error('Media data not found');
        }

        if (
          media[entity.is4k ? 'status4k' : 'status'] === MediaStatus.AVAILABLE
        ) {
          logger.warn('Media already exists, marking request as COMPLETED', {
            label: 'Media Request',
            requestId: entity.id,
            mediaId: entity.media.id,
          });

          const requestRepository = getRepository(MediaRequest);
          entity.status = MediaRequestStatus.COMPLETED;
          entity.seasons.forEach((season) => {
            season.status = MediaRequestStatus.COMPLETED;
          });
          await requestRepository.save(entity);
          return;
        }

        const tmdb = new TheMovieDb();
        const sonarr = new SonarrAPI({
          apiKey: sonarrSettings.apiKey,
          url: SonarrAPI.buildUrl(sonarrSettings, '/api/v3'),
        });
        const series = await tmdb.getTvShow({ tvId: media.tmdbId });
        const tvdbId = series.external_ids.tvdb_id ?? media.tvdbId;

        if (!tvdbId) {
          const requestRepository = getRepository(MediaRequest);
          await mediaRepository.remove(media);
          await requestRepository.remove(entity);
          throw new Error('TVDB ID not found');
        }

        let seriesType: SonarrSeries['seriesType'] = 'standard';

        // Change series type to anime if the anime keyword is present on tmdb
        if (
          series.keywords.results.some(
            (keyword) => keyword.id === ANIME_KEYWORD_ID
          )
        ) {
          seriesType = sonarrSettings.animeSeriesType ?? 'anime';
        }

        let rootFolder =
          seriesType === 'anime' && sonarrSettings.activeAnimeDirectory
            ? sonarrSettings.activeAnimeDirectory
            : sonarrSettings.activeDirectory;
        let qualityProfile =
          seriesType === 'anime' && sonarrSettings.activeAnimeProfileId
            ? sonarrSettings.activeAnimeProfileId
            : sonarrSettings.activeProfileId;
        let languageProfile =
          seriesType === 'anime' && sonarrSettings.activeAnimeLanguageProfileId
            ? sonarrSettings.activeAnimeLanguageProfileId
            : sonarrSettings.activeLanguageProfileId;
        let tags =
          seriesType === 'anime'
            ? sonarrSettings.animeTags
              ? [...sonarrSettings.animeTags]
              : []
            : sonarrSettings.tags
              ? [...sonarrSettings.tags]
              : [];

        if (
          entity.rootFolder &&
          entity.rootFolder !== '' &&
          entity.rootFolder !== rootFolder
        ) {
          rootFolder = entity.rootFolder;
          logger.info(`Request has an override root folder: ${rootFolder}`, {
            label: 'Media Request',
            requestId: entity.id,
            mediaId: entity.media.id,
          });
        }

        if (entity.profileId && entity.profileId !== qualityProfile) {
          qualityProfile = entity.profileId;
          logger.info(
            `Request has an override quality profile ID: ${qualityProfile}`,
            {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
            }
          );
        }

        if (
          entity.languageProfileId &&
          entity.languageProfileId !== languageProfile
        ) {
          languageProfile = entity.languageProfileId;
          logger.info(
            `Request has an override language profile ID: ${languageProfile}`,
            {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
            }
          );
        }

        if (entity.tags && !isEqual(entity.tags, tags)) {
          tags = entity.tags;
          logger.info(`Request has override tags`, {
            label: 'Media Request',
            requestId: entity.id,
            mediaId: entity.media.id,
            tagIds: tags,
          });
        }

        if (sonarrSettings.tagRequests) {
          const sonarrTags = await sonarr.getTags();
          // old tags had space around the hyphen
          let userTag = sonarrTags.find((v) =>
            v.label.startsWith(entity.requestedBy.id + ' - ')
          );
          // new tags do not have spaces around the hyphen, since spaces are not allowed anymore
          if (!userTag) {
            userTag = sonarrTags.find((v) =>
              v.label.startsWith(entity.requestedBy.id + '-')
            );
          }
          if (!userTag) {
            logger.info(`Requester has no active tag. Creating new`, {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
              userId: entity.requestedBy.id,
              newTag:
                entity.requestedBy.id +
                '-' +
                sanitizeDisplayName(entity.requestedBy.displayName),
            });
            userTag = await sonarr.createTag({
              label:
                entity.requestedBy.id +
                '-' +
                sanitizeDisplayName(entity.requestedBy.displayName),
            });
          }
          if (userTag.id) {
            if (!tags?.find((v) => v === userTag?.id)) {
              tags?.push(userTag.id);
            }
          } else {
            logger.warn(`Requester has no tag and failed to add one`, {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
              userId: entity.requestedBy.id,
              sonarrServer: sonarrSettings.hostname + ':' + sonarrSettings.port,
            });
          }
        }

        const sonarrSeriesOptions: AddSeriesOptions = {
          profileId: qualityProfile,
          languageProfileId: languageProfile,
          rootFolderPath: rootFolder,
          title: series.name,
          tvdbid: tvdbId,
          seasons: entity.seasons.map((season) => season.seasonNumber),
          seasonFolder: sonarrSettings.enableSeasonFolders,
          seriesType,
          tags,
          monitored: true,
          monitorNewItems: sonarrSettings.monitorNewItems,
          searchNow: !sonarrSettings.preventSearch,
        };

        // Run entity asynchronously so we don't wait for it on the UI side
        sonarr
          .addSeries(sonarrSeriesOptions)
          .then(async (sonarrSeries) => {
            // We grab media again here to make sure we have the latest version of it
            const media = await mediaRepository.findOne({
              where: { id: entity.media.id },
            });

            if (!media) {
              throw new Error('Media data not found');
            }

            media[entity.is4k ? 'externalServiceId4k' : 'externalServiceId'] =
              sonarrSeries.id;
            media[
              entity.is4k ? 'externalServiceSlug4k' : 'externalServiceSlug'
            ] = sonarrSeries.titleSlug;
            media[entity.is4k ? 'serviceId4k' : 'serviceId'] =
              sonarrSettings?.id;
            await mediaRepository.save(media);
          })
          .catch(async () => {
            try {
              const requestRepository = getRepository(MediaRequest);

              if (entity.status !== MediaRequestStatus.FAILED) {
                entity.status = MediaRequestStatus.FAILED;
                await requestRepository.save(entity);
              }
            } catch (saveError) {
              logger.error('Failed to mark request as FAILED', {
                label: 'Media Request',
                requestId: entity.id,
                errorMessage:
                  saveError instanceof Error
                    ? saveError.message
                    : String(saveError),
              });
            }

            logger.warn(
              'Something went wrong sending series request to Sonarr, marking status as FAILED',
              {
                label: 'Media Request',
                requestId: entity.id,
                mediaId: entity.media.id,
                sonarrSeriesOptions,
              }
            );

            MediaRequest.sendNotification(
              entity,
              media,
              Notification.MEDIA_FAILED
            );
          })
          .finally(() => {
            sonarr.clearCache({
              tvdbId,
              externalId: entity.is4k
                ? media.externalServiceId4k
                : media.externalServiceId,
              title: series.name,
            });
          });
        logger.info('Sent request to Sonarr', {
          label: 'Media Request',
          requestId: entity.id,
          mediaId: entity.media.id,
        });
      } catch (e) {
        const requestRepository = getRepository(MediaRequest);
        const mediaRepository = getRepository(Media);
        const media = await mediaRepository.findOne({
          where: { id: entity.media.id },
        });

        if (media) {
          entity.status = MediaRequestStatus.FAILED;
          await requestRepository.save(entity);

          logger.warn(
            'Failed to send series request to Sonarr due to connection or configuration error, marking status as FAILED',
            {
              label: 'Media Request',
              requestId: entity.id,
              mediaId: entity.media.id,
              errorMessage: e.message,
            }
          );

          MediaRequest.sendNotification(
            entity,
            media,
            Notification.MEDIA_FAILED
          );
        }
      }
    }
  }

  public async updateParentStatus(entity: MediaRequest): Promise<void> {
    // Non-TMDB media (book/audiobook/game): when the request transitions
    // to APPROVED, promote the related media to PROCESSING so the badge
    // flips to "Requested" (blue) — matching the movie/TV behaviour.
    // The PUT /book/request handler also does this when the route owns
    // the approval, but the generic POST /request/:id/approve endpoint
    // skips media-status updates for these types, so we centralise it
    // here.
    if (!entity.media) {
      if (
        entity.status === MediaRequestStatus.APPROVED &&
        (entity.type === MediaType.BOOK ||
          entity.type === MediaType.AUDIOBOOK ||
          entity.type === MediaType.GAME ||
          entity.type === MediaType.MANGA ||
          entity.type === MediaType.COMIC ||
          entity.type === MediaType.MAGAZINE)
      ) {
        const requestRepository = getRepository(MediaRequest);
        const fullRequest = await requestRepository.findOne({
          where: { id: entity.id },
          relations: [
            'bookMedia',
            'audiobookMedia',
            'gameMedia',
            'mangaMedia',
            'comicMedia',
          ],
        });
        if (fullRequest?.bookMedia) {
          if (fullRequest.bookMedia.status !== MediaStatus.AVAILABLE) {
            fullRequest.bookMedia.status = MediaStatus.PROCESSING;
            await getRepository(BookMedia).save(fullRequest.bookMedia);
          }
        } else if (fullRequest?.audiobookMedia) {
          if (fullRequest.audiobookMedia.status !== MediaStatus.AVAILABLE) {
            fullRequest.audiobookMedia.status = MediaStatus.PROCESSING;
            await getRepository(AudiobookMedia).save(
              fullRequest.audiobookMedia
            );
          }
        } else if (fullRequest?.gameMedia) {
          if (fullRequest.gameMedia.status !== MediaStatus.AVAILABLE) {
            const { GameMedia } = await import('@server/entity/GameMedia');
            fullRequest.gameMedia.status = MediaStatus.PROCESSING;
            await getRepository(GameMedia).save(
              fullRequest.gameMedia as GameMediaType
            );
          }
        } else if (fullRequest?.mangaMedia) {
          if (fullRequest.mangaMedia.status !== MediaStatus.AVAILABLE) {
            const { MangaMedia } = await import('@server/entity/MangaMedia');
            fullRequest.mangaMedia.status = MediaStatus.PROCESSING;
            await getRepository(MangaMedia).save(fullRequest.mangaMedia);
          }
        } else if (fullRequest?.comicMedia) {
          if (fullRequest.comicMedia.status !== MediaStatus.AVAILABLE) {
            const { ComicMedia } = await import('@server/entity/ComicMedia');
            fullRequest.comicMedia.status = MediaStatus.PROCESSING;
            await getRepository(ComicMedia).save(fullRequest.comicMedia);
          }
        }
      }
      return;
    }

    const mediaRepository = getRepository(Media);
    const media = await mediaRepository.findOne({
      where: { id: entity.media.id },
    });
    if (!media) {
      logger.error('Media data not found', {
        label: 'Media Request',
        requestId: entity.id,
        mediaId: entity.media.id,
      });
      return;
    }

    const statusKey = entity.is4k ? 'status4k' : 'status';
    const seasonRequestRepository = getRepository(SeasonRequest);
    const requestRepository = getRepository(MediaRequest);

    if (
      entity.status === MediaRequestStatus.APPROVED &&
      // Do not update the status if the item is already partially available or available
      media[statusKey] !== MediaStatus.AVAILABLE &&
      media[statusKey] !== MediaStatus.PARTIALLY_AVAILABLE &&
      media[statusKey] !== MediaStatus.PROCESSING
    ) {
      media[statusKey] = MediaStatus.PROCESSING;
      await mediaRepository.save(media);
    }

    if (
      media.mediaType === MediaType.MOVIE &&
      entity.status === MediaRequestStatus.DECLINED &&
      media[statusKey] !== MediaStatus.DELETED
    ) {
      media[statusKey] = MediaStatus.UNKNOWN;
      await mediaRepository.save(media);
    }

    /**
     * If the media type is TV, and we are declining a request,
     * we must check if its the only pending request and that
     * there the current media status is just pending (meaning no
     * other requests have yet to be approved)
     */
    if (
      media.mediaType === MediaType.TV &&
      entity.status === MediaRequestStatus.DECLINED &&
      media[statusKey] === MediaStatus.PENDING
    ) {
      const pendingCount = await requestRepository.count({
        where: {
          media: { id: media.id },
          status: MediaRequestStatus.PENDING,
          is4k: entity.is4k,
          id: Not(entity.id),
        },
      });

      if (pendingCount === 0) {
        // Re-fetch media without requests to avoid cascade issues
        const freshMedia = await mediaRepository.findOne({
          where: { id: media.id },
        });
        if (freshMedia) {
          freshMedia[statusKey] = MediaStatus.UNKNOWN;
          await mediaRepository.save(freshMedia);
        }
      }
    }

    // Reset season statuses when a TV request is declined
    if (
      media.mediaType === MediaType.TV &&
      entity.status === MediaRequestStatus.DECLINED
    ) {
      const seasonRepository = getRepository(Season);
      const actualSeasons = await seasonRepository.find({
        where: { media: { id: media.id } },
      });

      for (const seasonRequest of entity.seasons) {
        seasonRequest.status = MediaRequestStatus.DECLINED;
        await seasonRequestRepository.save(seasonRequest);

        const season = actualSeasons.find(
          (s) => s.seasonNumber === seasonRequest.seasonNumber
        );

        if (season && season[statusKey] === MediaStatus.PENDING) {
          const otherActiveRequests = await requestRepository
            .createQueryBuilder('request')
            .leftJoinAndSelect('request.seasons', 'season')
            .where('request.mediaId = :mediaId', { mediaId: media.id })
            .andWhere('request.id != :requestId', { requestId: entity.id })
            .andWhere('request.is4k = :is4k', { is4k: entity.is4k })
            .andWhere('request.status NOT IN (:...statuses)', {
              statuses: [
                MediaRequestStatus.DECLINED,
                MediaRequestStatus.COMPLETED,
              ],
            })
            .andWhere('season.seasonNumber = :seasonNumber', {
              seasonNumber: season.seasonNumber,
            })
            .getCount();

          if (otherActiveRequests === 0) {
            season[statusKey] = MediaStatus.UNKNOWN;
            await seasonRepository.save(season);
          }
        }
      }
    }

    // Approve child seasons if parent is approved
    if (
      media.mediaType === MediaType.TV &&
      entity.status === MediaRequestStatus.APPROVED
    ) {
      for (const season of entity.seasons) {
        season.status = MediaRequestStatus.APPROVED;
        await seasonRequestRepository.save(season);
      }
    }
  }

  public async handleRemoveParentUpdate(
    manager: EntityManager,
    entity: MediaRequest
  ): Promise<void> {
    // Handle non-TMDB media types (games, books, audiobooks)
    if (!entity.media) {
      if (entity.gameMedia) {
        const { GameMedia } = await import('@server/entity/GameMedia');
        const gm = await manager.findOne(GameMedia, {
          where: { id: entity.gameMedia.id },
        });
        if (gm && gm.status !== MediaStatus.AVAILABLE) {
          gm.status = MediaStatus.UNKNOWN;
          await manager.save(gm);
        }
      }
      if (entity.bookMedia) {
        const { BookMedia } = await import('@server/entity/BookMedia');
        const bm = await manager.findOne(BookMedia, {
          where: { id: entity.bookMedia.id },
        });
        if (bm && bm.status !== MediaStatus.AVAILABLE) {
          bm.status = MediaStatus.UNKNOWN;
          await manager.save(bm);
        }
      }
      if (entity.audiobookMedia) {
        const { AudiobookMedia } =
          await import('@server/entity/AudiobookMedia');
        const am = await manager.findOne(AudiobookMedia, {
          where: { id: entity.audiobookMedia.id },
        });
        if (am && am.status !== MediaStatus.AVAILABLE) {
          am.status = MediaStatus.UNKNOWN;
          await manager.save(am);
        }
      }
      if (entity.mangaMedia) {
        const { MangaMedia } = await import('@server/entity/MangaMedia');
        const mm = await manager.findOne(MangaMedia, {
          where: { id: entity.mangaMedia.id },
        });
        if (mm && mm.status !== MediaStatus.AVAILABLE) {
          mm.status = MediaStatus.UNKNOWN;
          await manager.save(mm);
        }
      }
      if (entity.comicMedia) {
        const { ComicMedia } = await import('@server/entity/ComicMedia');
        const cm = await manager.findOne(ComicMedia, {
          where: { id: entity.comicMedia.id },
        });
        if (cm && cm.status !== MediaStatus.AVAILABLE) {
          cm.status = MediaStatus.UNKNOWN;
          await manager.save(cm);
        }
      }
      return;
    }

    const fullMedia = await manager.findOneOrFail(Media, {
      where: { id: entity.media.id },
      relations: { requests: true },
    });

    const needsStatusUpdate =
      !fullMedia.requests.some((request) => !request.is4k) &&
      fullMedia.status !== MediaStatus.AVAILABLE;

    const needs4kStatusUpdate =
      !fullMedia.requests.some((request) => request.is4k) &&
      fullMedia.status4k !== MediaStatus.AVAILABLE;

    if (needsStatusUpdate || needs4kStatusUpdate) {
      // Re-fetch WITHOUT requests to avoid cascade issues on save
      const cleanMedia = await manager.findOneOrFail(Media, {
        where: { id: entity.media.id },
      });

      if (needsStatusUpdate) {
        cleanMedia.status = MediaStatus.UNKNOWN;
      }
      if (needs4kStatusUpdate) {
        cleanMedia.status4k = MediaStatus.UNKNOWN;
      }

      await manager.save(cleanMedia);
    }
  }

  /**
   * Dispatches book/audiobook requests to Bindery on approval. Runs after
   * `sendToRadarr`/`sendToSonarr` to keep the servarr path unchanged for
   * movies/TV. Non-book requests are no-op here.
   */
  public async sendToBindery(entity: MediaRequest): Promise<void> {
    if (entity.status !== MediaRequestStatus.APPROVED) {
      return;
    }
    if (entity.type !== MediaType.BOOK && entity.type !== MediaType.AUDIOBOOK) {
      return;
    }

    // Subscriber events don't eager-load book/audiobook relations; refetch.
    const requestRepo = getRepository(MediaRequest);
    const fullRequest = await requestRepo.findOne({
      where: { id: entity.id },
      relations: ['bookMedia', 'audiobookMedia'],
    });
    const media = fullRequest?.bookMedia ?? fullRequest?.audiobookMedia;
    if (!media) {
      return;
    }

    const result = await submitToBindery(media, entity.type);
    const persist = async () => {
      if (entity.type === MediaType.BOOK) {
        await getRepository(BookMedia).save(media as BookMedia);
      } else {
        await getRepository(AudiobookMedia).save(media as AudiobookMedia);
      }
    };
    if (result.success) {
      media.statusReason = null;
      await persist();
    } else if (result.noInstance) {
      // Don't write a reason yet — sendToBookshelf runs right after
      // and will either succeed (clearing) or write its own
      // "no DM configured" reason if it also has no instance.
    } else {
      media.statusReason = result.message
        ? `Dispatch to Bindery failed: ${result.message}`
        : 'Dispatch to Bindery failed.';
      await persist();
      logger.warn('Bindery dispatch did not succeed', {
        label: 'Media Request',
        requestId: entity.id,
        message: result.message,
      });
    }
  }

  /**
   * Dispatches book/audiobook requests to Bookshelf (Readarr fork) on
   * approval. Only runs when Bindery isn't configured to avoid double-
   * dispatching if the user configured both for the same mediaType.
   */
  public async sendToBookshelf(entity: MediaRequest): Promise<void> {
    if (entity.status !== MediaRequestStatus.APPROVED) {
      return;
    }
    if (entity.type !== MediaType.BOOK && entity.type !== MediaType.AUDIOBOOK) {
      return;
    }

    const requestRepo = getRepository(MediaRequest);
    const fullRequest = await requestRepo.findOne({
      where: { id: entity.id },
      relations: ['bookMedia', 'audiobookMedia'],
    });
    const media = fullRequest?.bookMedia ?? fullRequest?.audiobookMedia;
    if (!media) {
      return;
    }
    // Skip if a Bindery instance is currently default for this media type
    // AND the media already has an externalId — Bindery already handled
    // it in this subscriber pass (or in a prior run). When Bindery isn't
    // active anymore, treat any stale externalId as orphaned and let
    // Bookshelf take over (the user switched download managers).
    if (media.downloadManagerExternalId) {
      const settings = getSettings();
      const targetType =
        entity.type === MediaType.AUDIOBOOK ? 'audiobook' : 'book';
      const binderyActive = settings.bindery.some(
        (b) => b.mediaType === targetType && b.isDefault
      );
      if (binderyActive) {
        return;
      }
      logger.info(
        `BookMedia ${media.id} has stale downloadManagerExternalId from a removed DM; re-dispatching to Bookshelf`,
        { label: 'Media Request', requestId: entity.id }
      );
    }

    const result = await submitToBookshelf(media, entity.type);
    const persist = async () => {
      if (entity.type === MediaType.BOOK) {
        await getRepository(BookMedia).save(media as BookMedia);
      } else {
        await getRepository(AudiobookMedia).save(media as AudiobookMedia);
      }
    };
    const typeLabel =
      entity.type === MediaType.AUDIOBOOK ? 'audiobook' : 'book';
    if (result.success) {
      media.statusReason = null;
      await persist();
    } else if (result.noInstance) {
      // Bookshelf is the second of the two book/audiobook
      // dispatchers. If it also has no instance AND Bindery didn't
      // already write a different reason, this means truly nothing
      // is configured for this type — surface the manual workflow.
      if (!media.statusReason) {
        media.statusReason = `No ${typeLabel} download manager is configured. Bindery or Bookshelf can be enabled in Settings → Services → ${typeLabel === 'audiobook' ? 'Audiobooks' : 'Books'}, or this request can be fulfilled manually.`;
        await persist();
      }
    } else {
      media.statusReason = result.message
        ? `Dispatch to Bookshelf failed: ${result.message}`
        : 'Dispatch to Bookshelf failed.';
      await persist();
      logger.warn('Bookshelf dispatch did not succeed', {
        label: 'Media Request',
        requestId: entity.id,
        message: result.message,
      });
    }
  }

  /**
   * Dispatches book/audiobook requests to a configured Livrarr
   * instance on approval. Livrarr is mutually exclusive with
   * Bindery + Bookshelf for the same mediaType — the settings
   * route clears the others' isDefault when Livrarr is made
   * default, so the per-dispatcher ``find(isDefault && mediaType)``
   * gate naturally short-circuits anything not currently active.
   */
  public async sendToLivrarr(entity: MediaRequest): Promise<void> {
    if (entity.status !== MediaRequestStatus.APPROVED) {
      return;
    }
    if (entity.type !== MediaType.BOOK && entity.type !== MediaType.AUDIOBOOK) {
      return;
    }

    const requestRepo = getRepository(MediaRequest);
    const fullRequest = await requestRepo.findOne({
      where: { id: entity.id },
      relations: ['bookMedia', 'audiobookMedia'],
    });
    const media = fullRequest?.bookMedia ?? fullRequest?.audiobookMedia;
    if (!media) {
      return;
    }
    // Skip when another download manager already accepted this
    // request in the current cascade (or a prior run). Same
    // logic the Bookshelf dispatcher uses against Bindery: a
    // stale externalId from a now-removed DM is treated as
    // orphaned and Livrarr takes over.
    if (media.downloadManagerExternalId) {
      const settings = getSettings();
      const targetType =
        entity.type === MediaType.AUDIOBOOK ? 'audiobook' : 'book';
      const otherActive =
        settings.bindery.some(
          (b) => b.mediaType === targetType && b.isDefault
        ) ||
        settings.bookshelf.some(
          (b) => b.mediaType === targetType && b.isDefault
        );
      if (otherActive) {
        return;
      }
      logger.info(
        `BookMedia ${media.id} has stale downloadManagerExternalId from a removed DM; re-dispatching to Livrarr`,
        { label: 'Media Request', requestId: entity.id }
      );
    }

    const result = await submitToLivrarr(media, entity.type);
    const persist = async () => {
      if (entity.type === MediaType.BOOK) {
        await getRepository(BookMedia).save(media as BookMedia);
      } else {
        await getRepository(AudiobookMedia).save(media as AudiobookMedia);
      }
    };
    if (result.success) {
      media.statusReason = null;
      await persist();
    } else if (result.noInstance) {
      // Don't write a reason — Bindery / Bookshelf may have
      // already written their own "no DM configured" message
      // earlier in the cascade. Leaving statusReason as-is
      // preserves whichever earlier dispatcher had something
      // useful to say.
    } else {
      media.statusReason = result.message
        ? `Dispatch to Livrarr failed: ${result.message}`
        : 'Dispatch to Livrarr failed.';
      await persist();
      logger.warn('Livrarr dispatch did not succeed', {
        label: 'Media Request',
        requestId: entity.id,
        message: result.message,
      });
    }
  }

  /**
   * Dispatches comic requests to a configured Mylar3 instance on
   * approval. Skips silently when Mylar isn't enabled — manual
   * workflow (parallel to Suwayomi-for-manga / ROMM-for-games).
   */
  public async sendToMylar(entity: MediaRequest): Promise<void> {
    if (entity.status !== MediaRequestStatus.APPROVED) {
      return;
    }
    if (entity.type !== MediaType.COMIC) {
      return;
    }

    const requestRepo = getRepository(MediaRequest);
    const fullRequest = await requestRepo.findOne({
      where: { id: entity.id },
      relations: ['comicMedia'],
    });
    const media = fullRequest?.comicMedia;
    if (!media) {
      return;
    }

    if (media.downloadManagerExternalId) {
      return;
    }

    const result = await submitToMylar(media);
    const { ComicMedia } = await import('@server/entity/ComicMedia');
    if (result.success) {
      media.statusReason = null;
      await getRepository(ComicMedia).save(media);
    } else if (result.noInstance) {
      media.statusReason =
        'No comic download manager is configured. Mylar3 can be enabled in Settings → Services → Comics, or this request can be fulfilled manually.';
      await getRepository(ComicMedia).save(media);
    } else {
      media.statusReason = result.message
        ? `Dispatch to Mylar3 failed: ${result.message}`
        : 'Dispatch to Mylar3 failed.';
      await getRepository(ComicMedia).save(media);
      logger.warn('Mylar dispatch did not succeed', {
        label: 'Media Request',
        requestId: entity.id,
        message: result.message,
      });
    }
  }

  /**
   * Dispatches manga requests to a configured Suwayomi (Tachidesk)
   * instance on approval. Skips silently when Suwayomi is not enabled
   * — that's the manual-workflow case (parallel to ROMM for games).
   */
  public async sendToSuwayomi(entity: MediaRequest): Promise<void> {
    if (entity.status !== MediaRequestStatus.APPROVED) {
      return;
    }
    if (entity.type !== MediaType.MANGA) {
      return;
    }

    const requestRepo = getRepository(MediaRequest);
    const fullRequest = await requestRepo.findOne({
      where: { id: entity.id },
      relations: ['mangaMedia'],
    });
    const media = fullRequest?.mangaMedia;
    if (!media) {
      return;
    }

    // Already dispatched — no point re-submitting on every approval
    // toggle.
    if (media.downloadManagerExternalId) {
      return;
    }

    const result = await submitToSuwayomi(media);
    const { MangaMedia } = await import('@server/entity/MangaMedia');
    if (result.success) {
      media.statusReason = null;
      await getRepository(MangaMedia).save(media);
    } else if (result.noInstance) {
      media.statusReason =
        'No manga download manager is configured. Suwayomi (Tachidesk) can be enabled in Settings → Services → Manga, or this request can be fulfilled manually.';
      await getRepository(MangaMedia).save(media);
    } else {
      media.statusReason = result.message
        ? `Dispatch to Suwayomi failed: ${result.message}`
        : 'Dispatch to Suwayomi failed.';
      await getRepository(MangaMedia).save(media);
      logger.warn('Suwayomi dispatch did not succeed', {
        label: 'Media Request',
        requestId: entity.id,
        message: result.message,
      });
    }
  }

  /**
   * Dispatches game requests to a configured Romarr instance on
   * approval. Skips silently when Romarr isn't enabled — that's the
   * manual workflow. Romarr is the *acquisition* service (the Radarr
   * role for ROMs); ROMM stays the library ("Play") side and the two
   * coexist.
   */
  public async sendToRomarr(entity: MediaRequest): Promise<void> {
    if (entity.status !== MediaRequestStatus.APPROVED) {
      return;
    }
    if (entity.type !== MediaType.GAME) {
      return;
    }

    const requestRepo = getRepository(MediaRequest);
    const fullRequest = await requestRepo.findOne({
      where: { id: entity.id },
      relations: ['gameMedia'],
    });
    const media = fullRequest?.gameMedia;
    if (!media) {
      return;
    }

    // Already dispatched — skip re-submitting on every approval
    // toggle. But `romarrId` can be stale: if the game was deleted
    // in Romarr and the request re-created here, the GameMedia row
    // survives with its old id. Verify the game is genuinely still
    // in Romarr before skipping; if it's gone, fall through and
    // re-dispatch.
    if (media.romarrId && (await romarrStillHasGame(media))) {
      return;
    }

    const result = await submitToRomarr(media);
    const { GameMedia } = await import('@server/entity/GameMedia');
    if (result.success) {
      media.statusReason = null;
      await getRepository(GameMedia).save(media as GameMediaType);
    } else if (result.noInstance) {
      media.statusReason =
        'No game acquisition service is configured. Romarr can be enabled in Settings → Services → Games, or this request can be fulfilled manually.';
      await getRepository(GameMedia).save(media as GameMediaType);
    } else {
      media.statusReason = result.message
        ? `Dispatch to Romarr failed: ${result.message}`
        : 'Dispatch to Romarr failed.';
      await getRepository(GameMedia).save(media as GameMediaType);
      logger.warn('Romarr dispatch did not succeed', {
        label: 'Media Request',
        requestId: entity.id,
        message: result.message,
      });
    }
  }

  public async afterUpdate(event: UpdateEvent<MediaRequest>): Promise<void> {
    if (!event.entity) {
      return;
    }

    try {
      await this.sendToRadarr(event.entity as MediaRequest);
      await this.sendToSonarr(event.entity as MediaRequest);
      await this.sendToBindery(event.entity as MediaRequest);
      await this.sendToBookshelf(event.entity as MediaRequest);
      await this.sendToLivrarr(event.entity as MediaRequest);
      await this.sendToSuwayomi(event.entity as MediaRequest);
      await this.sendToMylar(event.entity as MediaRequest);
      await this.sendToRomarr(event.entity as MediaRequest);
    } catch (e) {
      logger.error('Error while sending to *arr in afterUpdate subscriber', {
        label: 'Media Request',
        requestId: (event.entity as MediaRequest).id,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }

    try {
      await this.updateParentStatus(event.entity as MediaRequest);

      if (event.entity.status === MediaRequestStatus.COMPLETED) {
        if (event.entity.media.mediaType === MediaType.MOVIE) {
          await this.notifyAvailableMovie(event.entity as MediaRequest, event);
        }
        if (event.entity.media.mediaType === MediaType.TV) {
          await this.notifyAvailableSeries(event.entity as MediaRequest, event);
        }
      }
    } catch (e) {
      logger.error(
        'Error while updating parent status in afterUpdate subscriber',
        {
          label: 'Media Request',
          requestId: (event.entity as MediaRequest).id,
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      );
    }
  }

  public async afterInsert(event: InsertEvent<MediaRequest>): Promise<void> {
    if (!event.entity) {
      return;
    }

    try {
      await this.sendToRadarr(event.entity as MediaRequest);
      await this.sendToSonarr(event.entity as MediaRequest);
      await this.sendToBindery(event.entity as MediaRequest);
      await this.sendToBookshelf(event.entity as MediaRequest);
      await this.sendToLivrarr(event.entity as MediaRequest);
      await this.sendToSuwayomi(event.entity as MediaRequest);
      await this.sendToMylar(event.entity as MediaRequest);
      await this.sendToRomarr(event.entity as MediaRequest);
    } catch (e) {
      logger.error('Error while sending to *arr in afterInsert subscriber', {
        label: 'Media Request',
        requestId: (event.entity as MediaRequest).id,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }

    try {
      await this.updateParentStatus(event.entity as MediaRequest);
    } catch (e) {
      logger.error(
        'Error while updating parent status in afterInsert subscriber',
        {
          label: 'Media Request',
          requestId: (event.entity as MediaRequest).id,
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      );
    }
  }

  public async afterRemove(event: RemoveEvent<MediaRequest>): Promise<void> {
    if (!event.entity) {
      return;
    }

    await this.handleRemoveParentUpdate(
      event.manager as EntityManager,
      event.entity as MediaRequest
    );
  }

  public listenTo(): typeof MediaRequest {
    return MediaRequest;
  }
}

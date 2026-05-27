import type { AudibleRegion } from '@server/api/audible';
import PlexTvAPI from '@server/api/plextv';
import type { SortOptions } from '@server/api/themoviedb';
import TheMovieDb from '@server/api/themoviedb';
import type { TmdbKeyword } from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import type {
  GenreSliderItem,
  WatchlistResponse,
} from '@server/interfaces/api/discoverInterfaces';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { mapProductionCompany } from '@server/models/Movie';
import {
  mapCollectionResult,
  mapMovieResult,
  mapPersonResult,
  mapTvResult,
} from '@server/models/Search';
import { mapNetwork } from '@server/models/Tv';
import { isCollection, isMovie, isPerson } from '@server/utils/typeHelpers';
import { Router } from 'express';
import { sortBy } from 'lodash';
import { z } from 'zod';

export const createTmdbWithRegionLanguage = (user?: User): TheMovieDb => {
  const settings = getSettings();

  const discoverRegion =
    user?.settings?.streamingRegion === 'all'
      ? ''
      : user?.settings?.streamingRegion
        ? user?.settings?.streamingRegion
        : settings.main.discoverRegion;

  const originalLanguage =
    user?.settings?.originalLanguage === 'all'
      ? ''
      : user?.settings?.originalLanguage
        ? user?.settings?.originalLanguage
        : settings.main.originalLanguage;

  return new TheMovieDb({
    discoverRegion,
    originalLanguage,
  });
};

export const createTmdbWithBlocklistSettings = (): TheMovieDb => {
  const settings = getSettings();

  return new TheMovieDb({
    discoverRegion: settings.main.blocklistRegion,
    originalLanguage: settings.main.blocklistLanguage,
  });
};

const discoverRoutes = Router();

const QueryFilterOptions = z.object({
  page: z.coerce.string().optional(),
  sortBy: z.coerce.string().optional(),
  primaryReleaseDateGte: z.coerce.string().optional(),
  primaryReleaseDateLte: z.coerce.string().optional(),
  firstAirDateGte: z.coerce.string().optional(),
  firstAirDateLte: z.coerce.string().optional(),
  studio: z.coerce.string().optional(),
  genre: z.coerce.string().optional(),
  keywords: z.coerce.string().optional(),
  excludeKeywords: z.coerce.string().optional(),
  language: z.coerce.string().optional(),
  withRuntimeGte: z.coerce.string().optional(),
  withRuntimeLte: z.coerce.string().optional(),
  voteAverageGte: z.coerce.string().optional(),
  voteAverageLte: z.coerce.string().optional(),
  voteCountGte: z.coerce.string().optional(),
  voteCountLte: z.coerce.string().optional(),
  network: z.coerce.string().optional(),
  watchProviders: z.coerce.string().optional(),
  watchRegion: z.coerce.string().optional(),
  status: z.coerce.string().optional(),
  certification: z.coerce.string().optional(),
  certificationGte: z.coerce.string().optional(),
  certificationLte: z.coerce.string().optional(),
  certificationCountry: z.coerce.string().optional(),
  certificationMode: z.enum(['exact', 'range']).optional(),
});

export type FilterOptions = z.infer<typeof QueryFilterOptions>;
const ApiQuerySchema = QueryFilterOptions.omit({
  certificationMode: true,
});

discoverRoutes.get('/movies', async (req, res, next) => {
  const tmdb = createTmdbWithRegionLanguage(req.user);

  try {
    const query = ApiQuerySchema.parse(req.query);
    const keywords = query.keywords;
    const excludeKeywords = query.excludeKeywords;

    const data = await tmdb.getDiscoverMovies({
      page: Number(query.page),
      sortBy: query.sortBy as SortOptions,
      language: req.locale ?? query.language,
      originalLanguage: query.language,
      genre: query.genre,
      studio: query.studio,
      primaryReleaseDateLte: query.primaryReleaseDateLte
        ? new Date(query.primaryReleaseDateLte).toISOString().split('T')[0]
        : undefined,
      primaryReleaseDateGte: query.primaryReleaseDateGte
        ? new Date(query.primaryReleaseDateGte).toISOString().split('T')[0]
        : undefined,
      keywords,
      excludeKeywords,
      withRuntimeGte: query.withRuntimeGte,
      withRuntimeLte: query.withRuntimeLte,
      voteAverageGte: query.voteAverageGte,
      voteAverageLte: query.voteAverageLte,
      voteCountGte: query.voteCountGte,
      voteCountLte: query.voteCountLte,
      watchProviders: query.watchProviders,
      watchRegion: query.watchRegion,
      certification: query.certification,
      certificationGte: query.certificationGte,
      certificationLte: query.certificationLte,
      certificationCountry: query.certificationCountry,
    });

    const media = await Media.getRelatedMedia(
      req.user,
      data.results.map((result) => ({
        tmdbId: result.id,
        mediaType: MediaType.MOVIE,
      }))
    );

    let keywordData: TmdbKeyword[] = [];
    if (keywords) {
      const splitKeywords = keywords.split(',');

      const keywordResults = await Promise.all(
        splitKeywords.map(async (keywordId) => {
          return await tmdb.getKeywordDetails({ keywordId: Number(keywordId) });
        })
      );

      keywordData = keywordResults.filter(
        (keyword): keyword is TmdbKeyword => keyword !== null
      );
    }

    return res.status(200).json({
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      keywords: keywordData,
      results: data.results.map((result) =>
        mapMovieResult(
          result,
          media.find(
            (req) =>
              req.tmdbId === result.id && req.mediaType === MediaType.MOVIE
          )
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving popular movies', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve popular movies.',
    });
  }
});

discoverRoutes.get<{ language: string }>(
  '/movies/language/:language',
  async (req, res, next) => {
    const tmdb = createTmdbWithRegionLanguage(req.user);

    try {
      const languages = await tmdb.getLanguages();

      const language = languages.find(
        (lang) => lang.iso_639_1 === req.params.language
      );

      if (!language) {
        return next({ status: 404, message: 'Language not found.' });
      }

      const data = await tmdb.getDiscoverMovies({
        page: Number(req.query.page),
        language: (req.query.language as string) ?? req.locale,
        originalLanguage: req.params.language,
      });

      const media = await Media.getRelatedMedia(
        req.user,
        data.results.map((result) => ({
          tmdbId: result.id,
          mediaType: MediaType.MOVIE,
        }))
      );

      return res.status(200).json({
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        language,
        results: data.results.map((result) =>
          mapMovieResult(
            result,
            media.find(
              (req) =>
                req.tmdbId === result.id && req.mediaType === MediaType.MOVIE
            )
          )
        ),
      });
    } catch (e) {
      logger.debug('Something went wrong retrieving movies by language', {
        label: 'API',
        errorMessage: e.message,
        language: req.params.language,
      });
      return next({
        status: 500,
        message: 'Unable to retrieve movies by language.',
      });
    }
  }
);

discoverRoutes.get<{ genreId: string }>(
  '/movies/genre/:genreId',
  async (req, res, next) => {
    const tmdb = createTmdbWithRegionLanguage(req.user);

    try {
      const genres = await tmdb.getMovieGenres({
        language: (req.query.language as string) ?? req.locale,
      });

      const genre = genres.find(
        (genre) => genre.id === Number(req.params.genreId)
      );

      if (!genre) {
        return next({ status: 404, message: 'Genre not found.' });
      }

      const data = await tmdb.getDiscoverMovies({
        page: Number(req.query.page),
        language: (req.query.language as string) ?? req.locale,
        genre: req.params.genreId as string,
      });

      const media = await Media.getRelatedMedia(
        req.user,
        data.results.map((result) => ({
          tmdbId: result.id,
          mediaType: MediaType.MOVIE,
        }))
      );

      return res.status(200).json({
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        genre,
        results: data.results.map((result) =>
          mapMovieResult(
            result,
            media.find(
              (req) =>
                req.tmdbId === result.id && req.mediaType === MediaType.MOVIE
            )
          )
        ),
      });
    } catch (e) {
      logger.debug('Something went wrong retrieving movies by genre', {
        label: 'API',
        errorMessage: e.message,
        genreId: req.params.genreId,
      });
      return next({
        status: 500,
        message: 'Unable to retrieve movies by genre.',
      });
    }
  }
);

discoverRoutes.get<{ studioId: string }>(
  '/movies/studio/:studioId',
  async (req, res, next) => {
    const tmdb = new TheMovieDb();

    try {
      const studio = await tmdb.getStudio(Number(req.params.studioId));

      const data = await tmdb.getDiscoverMovies({
        page: Number(req.query.page),
        language: (req.query.language as string) ?? req.locale,
        studio: req.params.studioId as string,
      });

      const media = await Media.getRelatedMedia(
        req.user,
        data.results.map((result) => ({
          tmdbId: result.id,
          mediaType: MediaType.MOVIE,
        }))
      );

      return res.status(200).json({
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        studio: mapProductionCompany(studio),
        results: data.results.map((result) =>
          mapMovieResult(
            result,
            media.find(
              (med) =>
                med.tmdbId === result.id && med.mediaType === MediaType.MOVIE
            )
          )
        ),
      });
    } catch (e) {
      logger.debug('Something went wrong retrieving movies by studio', {
        label: 'API',
        errorMessage: e.message,
        studioId: req.params.studioId,
      });
      return next({
        status: 500,
        message: 'Unable to retrieve movies by studio.',
      });
    }
  }
);

discoverRoutes.get('/movies/upcoming', async (req, res, next) => {
  const tmdb = createTmdbWithRegionLanguage(req.user);

  const now = new Date();
  const offset = now.getTimezoneOffset();
  const date = new Date(now.getTime() - offset * 60 * 1000)
    .toISOString()
    .split('T')[0];

  try {
    const data = await tmdb.getDiscoverMovies({
      page: Number(req.query.page),
      language: (req.query.language as string) ?? req.locale,
      primaryReleaseDateGte: date,
    });

    const media = await Media.getRelatedMedia(
      req.user,
      data.results.map((result) => ({
        tmdbId: result.id,
        mediaType: MediaType.MOVIE,
      }))
    );

    return res.status(200).json({
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      results: data.results.map((result) =>
        mapMovieResult(
          result,
          media.find(
            (med) =>
              med.tmdbId === result.id && med.mediaType === MediaType.MOVIE
          )
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving upcoming movies', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve upcoming movies.',
    });
  }
});

discoverRoutes.get('/tv', async (req, res, next) => {
  const tmdb = createTmdbWithRegionLanguage(req.user);

  try {
    const query = ApiQuerySchema.parse(req.query);
    const keywords = query.keywords;
    const excludeKeywords = query.excludeKeywords;
    const data = await tmdb.getDiscoverTv({
      page: Number(query.page),
      sortBy: query.sortBy as SortOptions,
      language: req.locale ?? query.language,
      genre: query.genre,
      network: query.network ? Number(query.network) : undefined,
      firstAirDateLte: query.firstAirDateLte
        ? new Date(query.firstAirDateLte).toISOString().split('T')[0]
        : undefined,
      firstAirDateGte: query.firstAirDateGte
        ? new Date(query.firstAirDateGte).toISOString().split('T')[0]
        : undefined,
      originalLanguage: query.language,
      keywords,
      excludeKeywords,
      withRuntimeGte: query.withRuntimeGte,
      withRuntimeLte: query.withRuntimeLte,
      voteAverageGte: query.voteAverageGte,
      voteAverageLte: query.voteAverageLte,
      voteCountGte: query.voteCountGte,
      voteCountLte: query.voteCountLte,
      watchProviders: query.watchProviders,
      watchRegion: query.watchRegion,
      withStatus: query.status,
      certification: query.certification,
      certificationGte: query.certificationGte,
      certificationLte: query.certificationLte,
      certificationCountry: query.certificationCountry,
    });

    const media = await Media.getRelatedMedia(
      req.user,
      data.results.map((result) => ({
        tmdbId: result.id,
        mediaType: MediaType.TV,
      }))
    );

    let keywordData: TmdbKeyword[] = [];
    if (keywords) {
      const splitKeywords = keywords.split(',');

      const keywordResults = await Promise.all(
        splitKeywords.map(async (keywordId) => {
          return await tmdb.getKeywordDetails({ keywordId: Number(keywordId) });
        })
      );

      keywordData = keywordResults.filter(
        (keyword): keyword is TmdbKeyword => keyword !== null
      );
    }

    return res.status(200).json({
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      keywords: keywordData,
      results: data.results.map((result) =>
        mapTvResult(
          result,
          media.find(
            (med) => med.tmdbId === result.id && med.mediaType === MediaType.TV
          )
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving popular series', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve popular series.',
    });
  }
});

discoverRoutes.get<{ language: string }>(
  '/tv/language/:language',
  async (req, res, next) => {
    const tmdb = createTmdbWithRegionLanguage(req.user);

    try {
      const languages = await tmdb.getLanguages();

      const language = languages.find(
        (lang) => lang.iso_639_1 === req.params.language
      );

      if (!language) {
        return next({ status: 404, message: 'Language not found.' });
      }

      const data = await tmdb.getDiscoverTv({
        page: Number(req.query.page),
        language: (req.query.language as string) ?? req.locale,
        originalLanguage: req.params.language,
      });

      const media = await Media.getRelatedMedia(
        req.user,
        data.results.map((result) => ({
          tmdbId: result.id,
          mediaType: MediaType.TV,
        }))
      );

      return res.status(200).json({
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        language,
        results: data.results.map((result) =>
          mapTvResult(
            result,
            media.find(
              (med) =>
                med.tmdbId === result.id && med.mediaType === MediaType.TV
            )
          )
        ),
      });
    } catch (e) {
      logger.debug('Something went wrong retrieving series by language', {
        label: 'API',
        errorMessage: e.message,
        language: req.params.language,
      });
      return next({
        status: 500,
        message: 'Unable to retrieve series by language.',
      });
    }
  }
);

discoverRoutes.get<{ genreId: string }>(
  '/tv/genre/:genreId',
  async (req, res, next) => {
    const tmdb = createTmdbWithRegionLanguage(req.user);

    try {
      const genres = await tmdb.getTvGenres({
        language: (req.query.language as string) ?? req.locale,
      });

      const genre = genres.find(
        (genre) => genre.id === Number(req.params.genreId)
      );

      if (!genre) {
        return next({ status: 404, message: 'Genre not found.' });
      }

      const data = await tmdb.getDiscoverTv({
        page: Number(req.query.page),
        language: (req.query.language as string) ?? req.locale,
        genre: req.params.genreId,
      });

      const media = await Media.getRelatedMedia(
        req.user,
        data.results.map((result) => ({
          tmdbId: result.id,
          mediaType: MediaType.TV,
        }))
      );

      return res.status(200).json({
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        genre,
        results: data.results.map((result) =>
          mapTvResult(
            result,
            media.find(
              (med) =>
                med.tmdbId === result.id && med.mediaType === MediaType.TV
            )
          )
        ),
      });
    } catch (e) {
      logger.debug('Something went wrong retrieving series by genre', {
        label: 'API',
        errorMessage: e.message,
        genreId: req.params.genreId,
      });
      return next({
        status: 500,
        message: 'Unable to retrieve series by genre.',
      });
    }
  }
);

discoverRoutes.get<{ networkId: string }>(
  '/tv/network/:networkId',
  async (req, res, next) => {
    const tmdb = new TheMovieDb();

    try {
      const network = await tmdb.getNetwork(Number(req.params.networkId));

      const data = await tmdb.getDiscoverTv({
        page: Number(req.query.page),
        language: (req.query.language as string) ?? req.locale,
        network: Number(req.params.networkId),
      });

      const media = await Media.getRelatedMedia(
        req.user,
        data.results.map((result) => ({
          tmdbId: result.id,
          mediaType: MediaType.TV,
        }))
      );

      return res.status(200).json({
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        network: mapNetwork(network),
        results: data.results.map((result) =>
          mapTvResult(
            result,
            media.find(
              (med) =>
                med.tmdbId === result.id && med.mediaType === MediaType.TV
            )
          )
        ),
      });
    } catch (e) {
      logger.debug('Something went wrong retrieving series by network', {
        label: 'API',
        errorMessage: e.message,
        networkId: req.params.networkId,
      });
      return next({
        status: 500,
        message: 'Unable to retrieve series by network.',
      });
    }
  }
);

discoverRoutes.get('/tv/upcoming', async (req, res, next) => {
  const tmdb = createTmdbWithRegionLanguage(req.user);

  const now = new Date();
  const offset = now.getTimezoneOffset();
  const date = new Date(now.getTime() - offset * 60 * 1000)
    .toISOString()
    .split('T')[0];

  try {
    const data = await tmdb.getDiscoverTv({
      page: Number(req.query.page),
      language: (req.query.language as string) ?? req.locale,
      firstAirDateGte: date,
    });

    const media = await Media.getRelatedMedia(
      req.user,
      data.results.map((result) => ({
        tmdbId: result.id,
        mediaType: MediaType.TV,
      }))
    );

    return res.status(200).json({
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      results: data.results.map((result) =>
        mapTvResult(
          result,
          media.find(
            (med) => med.tmdbId === result.id && med.mediaType === MediaType.TV
          )
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving upcoming series', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve upcoming series.',
    });
  }
});

discoverRoutes.get('/trending', async (req, res, next) => {
  const tmdb = createTmdbWithRegionLanguage(req.user);

  try {
    const mediaType = (req.query.mediaType as 'all' | 'movie' | 'tv') ?? 'all';
    const timeWindow =
      (req.query.timeWindow as 'day' | 'week') === 'week' ? 'week' : 'day';
    const language = (req.query.language as string) ?? req.locale;
    const page = Number(req.query.page);

    const trendingFetchers = {
      movie: async () => ({
        data: await tmdb.getMovieTrending({ page, language, timeWindow }),
        mapper: mapMovieResult,
        type: MediaType.MOVIE,
      }),
      tv: async () => ({
        data: await tmdb.getTvTrending({ page, language, timeWindow }),
        mapper: mapTvResult,
        type: MediaType.TV,
      }),
      all: async () => ({
        data: await tmdb.getAllTrending({ page, language, timeWindow }),
        mapper: (result: any, media?: Media) => {
          if (isMovie(result)) {
            return mapMovieResult(result, media);
          } else if (isPerson(result)) {
            return mapPersonResult(result);
          } else if (isCollection(result)) {
            return mapCollectionResult(result);
          } else {
            return mapTvResult(result, media);
          }
        },
        type: null,
      }),
    } as const;

    const { data, mapper, type } = await trendingFetchers[mediaType]();

    const media = await Media.getRelatedMedia(
      req.user,
      data.results.map((result) => ({
        tmdbId: result.id,
        mediaType: isMovie(result) ? MediaType.MOVIE : MediaType.TV,
      }))
    );

    return res.status(200).json({
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      results: data.results.map((result) => {
        // - If "type" is set (case: "movie" or "tv"), the mediaType must also match.
        // - If "type" is not set (case: "all"), only filter by tmdbId.
        const selectedMedia = media.find(
          (med) =>
            med.tmdbId === result.id && (type ? med.mediaType === type : true)
        );

        return mapper(result, selectedMedia);
      }),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving trending items', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve trending items.',
    });
  }
});

discoverRoutes.get<{ keywordId: string }>(
  '/keyword/:keywordId/movies',
  async (req, res, next) => {
    const tmdb = new TheMovieDb();

    try {
      const data = await tmdb.getMoviesByKeyword({
        keywordId: Number(req.params.keywordId),
        page: Number(req.query.page),
        language: (req.query.language as string) ?? req.locale,
      });

      const media = await Media.getRelatedMedia(
        req.user,
        data.results.map((result) => ({
          tmdbId: result.id,
          mediaType: MediaType.MOVIE,
        }))
      );

      return res.status(200).json({
        page: data.page,
        totalPages: data.total_pages,
        totalResults: data.total_results,
        results: data.results.map((result) =>
          mapMovieResult(
            result,
            media.find(
              (med) =>
                med.tmdbId === result.id && med.mediaType === MediaType.MOVIE
            )
          )
        ),
      });
    } catch (e) {
      logger.debug('Something went wrong retrieving movies by keyword', {
        label: 'API',
        errorMessage: e.message,
        keywordId: req.params.keywordId,
      });
      return next({
        status: 500,
        message: 'Unable to retrieve movies by keyword.',
      });
    }
  }
);

discoverRoutes.get<{ language: string }, GenreSliderItem[]>(
  '/genreslider/movie',
  async (req, res, next) => {
    const tmdb = new TheMovieDb();

    try {
      const mappedGenres: GenreSliderItem[] = [];

      const genres = await tmdb.getMovieGenres({
        language: (req.query.language as string) ?? req.locale,
      });

      await Promise.all(
        genres.map(async (genre) => {
          const genreData = await tmdb.getDiscoverMovies({
            genre: genre.id.toString(),
          });

          mappedGenres.push({
            id: genre.id,
            name: genre.name,
            backdrops: genreData.results
              .filter((title) => !!title.backdrop_path)
              .map((title) => title.backdrop_path) as string[],
          });
        })
      );

      const sortedData = sortBy(mappedGenres, 'name');

      return res.status(200).json(sortedData);
    } catch (e) {
      logger.debug('Something went wrong retrieving the movie genre slider', {
        label: 'API',
        errorMessage: e.message,
      });
      return next({
        status: 500,
        message: 'Unable to retrieve movie genre slider.',
      });
    }
  }
);

discoverRoutes.get<{ language: string }, GenreSliderItem[]>(
  '/genreslider/tv',
  async (req, res, next) => {
    const tmdb = new TheMovieDb();

    try {
      const mappedGenres: GenreSliderItem[] = [];

      const genres = await tmdb.getTvGenres({
        language: (req.query.language as string) ?? req.locale,
      });

      await Promise.all(
        genres.map(async (genre) => {
          const genreData = await tmdb.getDiscoverTv({
            genre: genre.id.toString(),
          });

          mappedGenres.push({
            id: genre.id,
            name: genre.name,
            backdrops: genreData.results
              .filter((title) => !!title.backdrop_path)
              .map((title) => title.backdrop_path) as string[],
          });
        })
      );

      const sortedData = sortBy(mappedGenres, 'name');

      return res.status(200).json(sortedData);
    } catch (e) {
      logger.debug('Something went wrong retrieving the series genre slider', {
        label: 'API',
        errorMessage: e.message,
      });
      return next({
        status: 500,
        message: 'Unable to retrieve series genre slider.',
      });
    }
  }
);

discoverRoutes.get<Record<string, unknown>, WatchlistResponse>(
  '/watchlist',
  async (req, res) => {
    const userRepository = getRepository(User);
    const itemsPerPage = 20;
    const page = req.query.page ? Number(req.query.page) : 1;
    const offset = (page - 1) * itemsPerPage;

    const activeUser = await userRepository.findOne({
      where: { id: req.user?.id },
      select: ['id', 'plexToken'],
    });

    if (activeUser && !activeUser?.plexToken) {
      // Non-Plex users can only see their own watchlist
      const [result, total] = await getRepository(Watchlist).findAndCount({
        where: { requestedBy: { id: activeUser?.id } },
        relations: {
          /*requestedBy: true,media:true*/
        },
        // loadRelationIds: true,
        take: itemsPerPage,
        skip: offset,
      });
      if (total) {
        return res.json({
          page: page,
          totalPages: Math.ceil(total / itemsPerPage),
          totalResults: total,
          results: result,
        });
      }
    }
    if (!activeUser?.plexToken) {
      // We will just return an empty array if the user has no Plex token
      return res.json({
        page: 1,
        totalPages: 1,
        totalResults: 0,
        results: [],
      });
    }

    // List watchlist from Plex
    const plexTV = new PlexTvAPI(activeUser.plexToken);

    const watchlist = await plexTV.getWatchlist({ offset });

    return res.json({
      page,
      totalPages: Math.ceil(watchlist.totalSize / itemsPerPage),
      totalResults: watchlist.totalSize,
      results: watchlist.items.map((item) => ({
        id: item.tmdbId,
        ratingKey: item.ratingKey,
        title: item.title,
        mediaType: item.type === 'show' ? 'tv' : 'movie',
        tmdbId: item.tmdbId,
      })),
    });
  }
);

// ---------------------------------------------------------------------------
// Extended-media discover endpoints (games / manga / comics / books /
// audiobooks). Each surfaces a paginated "popular" feed shaped like
// the movies/tv envelope (``{ page, totalPages, totalResults, results }``)
// so the same ``useDiscover`` hook on the client renders them.
//
// Capability per provider varies — where the upstream has a real
// trending/popular endpoint we use it; where it doesn't, we fall back
// to a stable proxy (most-rated, recently-added, by-popularity-sort).
// All five gate on the corresponding ``mediaTypes.{type}`` setting via
// the ``requireMediaType`` middleware so a disabled type 503s cleanly.
// ---------------------------------------------------------------------------

import { requireMediaType } from '@server/middleware/mediaTypeGuard';

const PageQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
});

discoverRoutes.get('/games', requireMediaType('game'), async (req, res) => {
  try {
    const { page } = PageQuery.parse(req.query);
    // IGDB needs a Twitch client-id/secret pair — pull them from
    // the persisted game settings the way the game routes do.
    // When the operator hasn't set them up yet, short-circuit
    // with a clean empty envelope so the browse page renders its
    // search hint instead of throwing.
    const igdbSettings = getSettings().game?.igdb;
    if (!igdbSettings?.clientId || !igdbSettings?.clientSecret) {
      return res.status(200).json({
        page,
        totalPages: 1,
        totalResults: 0,
        results: [],
      });
    }
    const { default: IgdbAPI } = await import('@server/api/igdb');
    const igdb = new IgdbAPI({
      clientId: igdbSettings.clientId,
      clientSecret: igdbSettings.clientSecret,
    });
    const limit = 20;
    const games = await igdb.getPopularGames(page, limit);

    return res.status(200).json({
      page,
      // IGDB doesn't expose a total — set a generous upper bound so
      // the infinite-scroll hook keeps requesting pages until the
      // catalogue runs out (a short response naturally stops it).
      totalPages: games.length < limit ? page : page + 1,
      totalResults: games.length,
      results: games.map((g) => ({
        id: g.id,
        igdbId: g.id,
        title: g.name,
        coverUrl: g.cover?.url
          ? `https:${g.cover.url.replace('t_thumb', 't_cover_big')}`
          : undefined,
        releaseYear: g.first_release_date
          ? new Date(g.first_release_date * 1000).getFullYear()
          : undefined,
        summary: g.summary,
        // IGDB's ``total_rating`` is already 0-100 — the prior
        // ``/10`` divisor turned 94% (GTA V tier) into 9.4 →
        // rendered as "9%" by the shared RatingBadge. Hand the
        // 0-100 value through directly; the badge does its own
        // rounding.
        rating: g.total_rating ?? undefined,
        mediaType: 'game',
      })),
    });
  } catch (e) {
    logger.error('discover.games failed', {
      label: 'discover',
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(200).json({
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    });
  }
});

discoverRoutes.get('/manga', requireMediaType('manga'), async (req, res) => {
  try {
    const { page } = PageQuery.parse(req.query);
    const { default: AniListAPI } = await import('@server/api/anilist');
    const anilist = new AniListAPI();
    const perPage = 20;
    // AniList trending is page-aware via its GraphQL ``Page`` arg,
    // but ``getTrendingManga`` was wired for the dashboard's single
    // first-page slider. Re-issue the underlying GraphQL with offset
    // pagination so the browse view paginates cleanly.
    // (Fallback to the cached first page when ``page === 1`` so the
    // dashboard slider and the browse first page share data.)
    const list =
      page === 1
        ? await anilist.getTrendingManga(perPage)
        : await anilist.getTrendingManga(perPage * page);

    // For pages > 1 we paginate locally — AniList's GraphQL gateway
    // doesn't accept an offset in the trending sort cleanly, so we
    // request a wider window and slice. Cheap because the gateway
    // caches by perPage.
    const sliced =
      page === 1 ? list : list.slice(perPage * (page - 1), perPage * page);

    return res.status(200).json({
      page,
      totalPages: sliced.length < perPage ? page : page + 1,
      totalResults: sliced.length,
      results: sliced.map((m) => ({
        id: m.id,
        anilistId: m.id,
        title:
          m.title?.english ||
          m.title?.romaji ||
          m.title?.native ||
          'Untitled',
        coverUrl: m.coverImage?.large ?? m.coverImage?.medium ?? undefined,
        bannerUrl: m.bannerImage ?? undefined,
        year: m.startDate?.year ?? undefined,
        status: m.status ?? undefined,
        format: m.format ?? undefined,
        averageScore: m.averageScore ?? undefined,
        mediaType: 'manga',
      })),
    });
  } catch (e) {
    logger.error('discover.manga failed', {
      label: 'discover',
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(200).json({
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    });
  }
});

discoverRoutes.get(
  '/comics',
  requireMediaType('comic'),
  async (req, res) => {
    try {
      const { page } = PageQuery.parse(req.query);
      // ComicVine needs an API key — pull it from the persisted
      // comic settings the way the comic routes do. Same
      // ``metadataProviders.comicvine + apiKey`` shape as
      // ``server/routes/comic.ts``. When the key isn't
      // configured yet, return an empty envelope so the browse
      // page renders its search hint cleanly.
      const cfg = getSettings().comic?.metadataProviders;
      const apiKey = cfg?.comicvine ? cfg.apiKey : null;
      if (!apiKey) {
        return res.status(200).json({
          page,
          totalPages: 1,
          totalResults: 0,
          results: [],
        });
      }
      const { default: ComicVineAPI } = await import(
        '@server/api/comicvine'
      );
      const client = new ComicVineAPI({ apiKey });
      const limit = 20;
      const volumes = await client.getRecentVolumes(page, limit);
      return res.status(200).json({
        page,
        totalPages: volumes.length < limit ? page : page + 1,
        totalResults: volumes.length,
        results: volumes.map((v) => ({
          id: v.id,
          comicVineId: v.id,
          title: v.name,
          coverUrl: v.image?.medium_url ?? v.image?.small_url,
          year: v.start_year ? Number(v.start_year) || undefined : undefined,
          issueCount: v.count_of_issues,
          publisher: v.publisher?.name,
          deck: v.deck ?? undefined,
        })),
      });
    } catch (e) {
      logger.error('discover.comics failed', {
        label: 'discover',
        error: e instanceof Error ? e.message : String(e),
      });
      return res.status(200).json({
        page: 1,
        totalPages: 1,
        totalResults: 0,
        results: [],
      });
    }
  }
);

discoverRoutes.get(
  '/books',
  requireMediaType('book'),
  async (req, res) => {
    try {
      const { page } = PageQuery.parse(req.query);
      const limit = 20;
      const bookCfg = getSettings().book?.metadataProviders;
      // Same predicate the /book/search route uses to pick the
      // primary identity source. When Hardcover is the operator's
      // chosen primary AND it's enabled AND the API key is set,
      // browse popular pulls from Hardcover's
      // ``users_count``-sorted feed — the same number the book
      // detail page surfaces. Otherwise fall back to
      // OpenLibrary's free ``/trending/{period}.json`` so a
      // fresh install with no Hardcover account still gets a
      // useful browse experience.
      const useHardcover =
        bookCfg?.primarySource === 'hardcover' &&
        bookCfg.hardcover &&
        !!bookCfg.hardcoverApiKey;

      if (useHardcover) {
        const { default: HardcoverAPI, hardcoverPrimaryAuthor } =
          await import('@server/api/hardcover');
        const hc = new HardcoverAPI(bookCfg.hardcoverApiKey);
        const hits = await hc.getPopularBooks(page, limit);
        return res.status(200).json({
          page,
          totalPages: hits.length < limit ? page : page + 1,
          totalResults: hits.length,
          results: hits.map((h) => {
            const topEdition = h.editions?.[0];
            return {
              // Same ``hardcover:<id>`` prefix the search route
              // uses so the detail page dispatcher routes back
              // to Hardcover on click.
              id: `hardcover:${h.id}`,
              openLibraryId: `hardcover:${h.id}`,
              title: h.title,
              authorName:
                hardcoverPrimaryAuthor(h.contributions) ?? 'Unknown Author',
              coverUrl: h.image?.url?.startsWith('http')
                ? h.image.url
                : undefined,
              year: h.release_date
                ? Number(h.release_date.slice(0, 4)) || undefined
                : undefined,
              publisher: topEdition?.publisher?.name ?? undefined,
            };
          }),
        });
      }

      const { default: OpenLibraryAPI } = await import(
        '@server/api/openlibrary'
      );
      const client = new OpenLibraryAPI();
      // ``daily`` is the most volatile (truly reflects "popular
      // right now"); for paginated browsing past page 1 we ask
      // for ``weekly`` so the operator gets a wider catalogue.
      const period = page === 1 ? 'daily' : 'weekly';
      const { results, totalResults } = await client.getTrending(
        period,
        page,
        limit
      );
      return res.status(200).json({
        page,
        totalPages:
          results.length < limit
            ? page
            : Math.max(page + 1, Math.ceil(totalResults / limit)),
        totalResults,
        results: results.map((b) => ({
          id: b.openLibraryId,
          openLibraryId: b.openLibraryId,
          title: b.title,
          authorName: b.authorName,
          coverUrl: b.coverUrl,
          year: b.year,
          publisher: b.publisher,
        })),
      });
    } catch (e) {
      logger.error('discover.books failed', {
        label: 'discover',
        error: e instanceof Error ? e.message : String(e),
      });
      return res.status(200).json({
        page: 1,
        totalPages: 1,
        totalResults: 0,
        results: [],
      });
    }
  }
);

discoverRoutes.get(
  '/audiobooks',
  requireMediaType('audiobook'),
  async (req, res) => {
    try {
      const { page } = PageQuery.parse(req.query);
      const limit = 20;
      const audioCfg = getSettings().audiobook?.metadataProviders;
      // Hardcover stores its API key on the BOOK settings (single
      // account is shared between book + audiobook surfaces); the
      // audiobook tab only gates "is Hardcover allowed" via its
      // own ``hardcover`` boolean. Mirror that here so the
      // same precondition the search routes use also drives the
      // browse-popular surface.
      const bookCfg = getSettings().book?.metadataProviders;
      const sharedHcKey = bookCfg?.hardcoverApiKey;
      const useHardcover =
        audioCfg?.primarySource === 'hardcover' &&
        audioCfg.hardcover &&
        !!sharedHcKey;

      if (useHardcover) {
        const { default: HardcoverAPI, hardcoverPrimaryAuthor } =
          await import('@server/api/hardcover');
        const hc = new HardcoverAPI(sharedHcKey);
        const hits = await hc.getPopularAudiobooks(page, limit);
        return res.status(200).json({
          page,
          totalPages: hits.length < limit ? page : page + 1,
          totalResults: hits.length,
          results: hits.map((h) => {
            // ``editions`` is pre-filtered to audiobook editions
            // server-side via bookFields({ editionFormat:
            // 'audiobook' }), so the first one is the canonical
            // audiobook edition for this title.
            const audio = h.editions?.[0];
            return {
              // Audiobook detail page uses the ``hcab:`` prefix to
              // route to the audiobook-specific Hardcover lookup
              // (server/routes/book.ts line ~1303). Match that so
              // a click on a popular audiobook card lands on the
              // right detail page.
              id: `hcab:${h.id}`,
              openLibraryId: `hcab:${h.id}`,
              title: h.title,
              authorName:
                hardcoverPrimaryAuthor(h.contributions) ?? 'Unknown Author',
              // Hardcover's edition record doesn't expose a
              // narrator field directly — the existing audiobook
              // search route also omits it for Hardcover hits;
              // narrator only surfaces once the operator opens
              // the detail page (which fetches the richer
              // edition+contributions graph).
              narratorName: undefined,
              durationSeconds: audio?.audio_seconds ?? undefined,
              coverUrl: h.image?.url?.startsWith('http')
                ? h.image.url
                : undefined,
              year: h.release_date
                ? Number(h.release_date.slice(0, 4)) || undefined
                : undefined,
              publisher: audio?.publisher?.name ?? undefined,
            };
          }),
        });
      }

      // No Hardcover available — fall back to Audible's
      // ``/catalog/products`` sorted by ``ReleaseDate`` (newest
      // first). Audible's catalog is free and doesn't require
      // auth; this is the genuine "new audiobook releases" feed,
      // which is much more useful than the OpenLibrary trending
      // books we used to surface here (which were mostly
      // print-only titles that had no audio edition at all, so
      // the cards rendered with no narrator / duration).
      const audibleRegion =
        (audioCfg?.audibleRegion ??
          getSettings().metadataSettings?.audibleRegion ??
          'us') as AudibleRegion;
      const { default: AudibleAPI } = await import('@server/api/audible');
      const audible = new AudibleAPI(audibleRegion);
      // Audible uses 0-indexed paging.
      const audibleResults = await audible.getNewReleases(limit, page - 1);

      if (audibleResults.results.length > 0) {
        return res.status(200).json({
          page,
          totalPages:
            audibleResults.results.length < limit
              ? page
              : Math.max(
                  page + 1,
                  Math.ceil(audibleResults.totalResults / limit)
                ),
          totalResults: audibleResults.totalResults,
          results: audibleResults.results.map((a) => ({
            // Audiobook detail page routes by ASIN (the
            // openLibraryId field carries that for Audible-sourced
            // items — see ``/api/v1/audiobook/search``).
            id: a.asin,
            openLibraryId: a.asin,
            title: a.title,
            authorName: a.authorName,
            narratorName: a.narratorName,
            durationSeconds: a.durationSeconds,
            coverUrl: a.coverUrl,
            year: a.year,
            publisher: a.publisher,
          })),
        });
      }

      // Audible came back empty (regional storefront / network
      // hiccup) — last-resort fallback to OpenLibrary trending
      // books. The audiobook edition of these popular titles is
      // reachable via the detail page's edition picker. Better
      // than a permanent empty state.
      const { default: OpenLibraryAPI } = await import(
        '@server/api/openlibrary'
      );
      const client = new OpenLibraryAPI();
      const period = page === 1 ? 'daily' : 'weekly';
      const { results, totalResults } = await client.getTrending(
        period,
        page,
        limit
      );
      return res.status(200).json({
        page,
        totalPages:
          results.length < limit
            ? page
            : Math.max(page + 1, Math.ceil(totalResults / limit)),
        totalResults,
        results: results.map((b) => ({
          id: b.openLibraryId,
          openLibraryId: b.openLibraryId,
          title: b.title,
          authorName: b.authorName,
          coverUrl: b.coverUrl,
          year: b.year,
          publisher: b.publisher,
        })),
      });
    } catch (e) {
      logger.error('discover.audiobooks failed', {
        label: 'discover',
        error: e instanceof Error ? e.message : String(e),
      });
      return res.status(200).json({
        page: 1,
        totalPages: 1,
        totalResults: 0,
        results: [],
      });
    }
  }
);

export default discoverRoutes;

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

// Sort selector for the books / audiobooks browse pages.
//   * ``popular`` — what's hot on the chosen primary provider
//     (Hardcover users_count, Audible BestSellers, OpenLibrary
//     trending). The default.
//   * ``recent`` — what was released most recently (Hardcover
//     release_date desc, Audible ReleaseDate desc, OpenLibrary
//     trending again as the last-resort fallback).
// The same shape is reused on the audiobook endpoint so the UI
// sort selector can target both pages from one component.
const PagedSortQuery = PageQuery.extend({
  sort: z.enum(['popular', 'recent']).optional().default('popular'),
  // Optional genre filter. For books/audiobooks the value is a
  // Hardcover Genre-tag name (e.g. ``Fantasy``) — the genre
  // tile on the dashboard sends ``?genre=NAME`` after the user
  // clicks. Only honored when Hardcover is the active provider
  // (the OpenLibrary / Audible fall-throughs don't expose
  // comparable genre taxonomies, so we ignore the filter there
  // rather than serve a misleading empty grid).
  genre: z.string().optional(),
});

// Canonical book/audiobook genre list backing the dashboard
// genre slider. Hardcover stores per-book genres in
// ``cached_tags.Genre[].tag`` as free-form strings — these are
// the ~14 highest-signal genres that consistently bucket popular
// titles. Keeping this curated (rather than auto-derived from
// the popular feed) means the dashboard rows stay stable across
// Hardcover catalog churn.
const BOOK_GENRES_CANONICAL = [
  'Fantasy',
  'Science Fiction',
  'Romance',
  'Mystery',
  'Thriller',
  'Horror',
  'Historical Fiction',
  'Contemporary',
  'Young Adult',
  'Nonfiction',
  'Biography',
  'Memoir',
  'Self Help',
  'Childrens',
];

// ---------------------------------------------------------------------------
// Status-enrichment helpers
//
// The TMDB /discover endpoints overlay local availability via
// ``Media.getRelatedMedia()`` so the dashboard cards can show
// the "downloaded" / "requested" / "processing" badges. The
// extended-media types use their own per-type entities
// (BookMedia / GameMedia / MangaMedia / ComicMedia /
// AudiobookMedia) keyed by their respective provider id, so we
// need a parallel batch lookup per type. Each helper takes the
// raw provider hits, batches a single ``WHERE id IN (…)``
// against the per-type repo, and returns a Map keyed by the
// provider id so the route handler can attach the status to
// every result with O(N) lookups instead of N round trips.
// ---------------------------------------------------------------------------

// Batch-load all GameMedia rows for the given IGDB ids so the
// discover envelope can ship per-platform availability instead of
// a single aggregated status. The dashboard cards apply the same
// partial-aggregation logic the search page uses (game owned on
// SOME of IGDB's platforms but not all → PARTIALLY_AVAILABLE),
// which only works if we know the full per-platform breakdown.
async function loadGameMediaByIgdbId(
  igdbIds: number[]
): Promise<
  Map<
    number,
    {
      platformIgdbId?: number | null;
      platformName?: string | null;
      status: number;
      id: number;
    }[]
  >
> {
  if (igdbIds.length === 0) return new Map();
  const { In } = await import('typeorm');
  const { GameMedia } = await import('@server/entity/GameMedia');
  const rows = await getRepository(GameMedia).find({
    where: { igdbId: In(igdbIds) },
    select: ['id', 'igdbId', 'status', 'platformIgdbId', 'platformName'],
  });
  const map = new Map<
    number,
    {
      platformIgdbId?: number | null;
      platformName?: string | null;
      status: number;
      id: number;
    }[]
  >();
  for (const r of rows) {
    const list = map.get(r.igdbId) ?? [];
    list.push({
      id: r.id,
      status: r.status,
      platformIgdbId: r.platformIgdbId,
      platformName: r.platformName,
    });
    map.set(r.igdbId, list);
  }
  return map;
}

interface MangaAvailability {
  status: number;
  availableChapters?: number | null;
  availableVolumes?: number | null;
}

async function loadMangaStatusMap(
  anilistIds: number[]
): Promise<Map<number, MangaAvailability>> {
  if (anilistIds.length === 0) return new Map();
  const { In } = await import('typeorm');
  const { MangaMedia } = await import('@server/entity/MangaMedia');
  const rows = await getRepository(MangaMedia).find({
    where: { anilistId: In(anilistIds) },
    select: ['anilistId', 'status', 'availableChapters', 'availableVolumes'],
  });
  return new Map(
    rows.map((r) => [
      r.anilistId,
      {
        status: r.status,
        availableChapters: r.availableChapters,
        availableVolumes: r.availableVolumes,
      },
    ])
  );
}

interface ComicAvailability {
  status: number;
  availableIssues?: number | null;
}

async function loadComicStatusMap(
  comicVineIds: number[]
): Promise<Map<number, ComicAvailability>> {
  if (comicVineIds.length === 0) return new Map();
  const { In } = await import('typeorm');
  const { ComicMedia } = await import('@server/entity/ComicMedia');
  const rows = await getRepository(ComicMedia).find({
    where: { comicVineId: In(comicVineIds) },
    select: ['comicVineId', 'status', 'availableIssues'],
  });
  return new Map(
    rows.map((r) => [
      r.comicVineId,
      { status: r.status, availableIssues: r.availableIssues },
    ])
  );
}

async function loadBookStatusMap(
  openLibraryIds: string[]
): Promise<Map<string, number>> {
  if (openLibraryIds.length === 0) return new Map();
  const { In } = await import('typeorm');
  const BookMediaMod = await import('@server/entity/BookMedia');
  const rows = await getRepository(BookMediaMod.default).find({
    where: { openLibraryId: In(openLibraryIds) },
    select: ['openLibraryId', 'status'],
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.openLibraryId) map.set(r.openLibraryId, r.status);
  }
  return map;
}

async function loadAudiobookStatusMap(
  asins: string[]
): Promise<Map<string, number>> {
  if (asins.length === 0) return new Map();
  const { In } = await import('typeorm');
  const AudiobookMediaMod = await import('@server/entity/AudiobookMedia');
  const rows = await getRepository(AudiobookMediaMod.default).find({
    where: { asin: In(asins) },
    select: ['asin', 'status'],
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.asin) map.set(r.asin, r.status);
  }
  return map;
}

// Games discover accepts an optional ``?genre=N`` (IGDB integer
// id) to narrow the popular feed to a single genre — drives the
// "click a genre tile" UX on the dashboard.
const GamesQuery = PageQuery.extend({
  genre: z.coerce.number().int().optional(),
  // Optional platform filter — IGDB integer platform id. Drives
  // the "click a platform tile on the dashboard" UX the same way
  // ``genre`` does.
  platform: z.coerce.number().int().optional(),
});

discoverRoutes.get('/games', requireMediaType('game'), async (req, res) => {
  try {
    const { page, genre, platform } = GamesQuery.parse(req.query);
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
    const games = await igdb.getPopularGames(page, limit, genre, platform);

    // Per-platform availability map so each result can ship the
    // FULL set of IGDB platforms with their individual statuses.
    // The card then runs the same aggregation as the search page
    // (some IGDB platforms owned + others not → PARTIALLY) — only
    // shipping the aggregate would collapse "GBA owned, Wii/3DS
    // missing" down to AVAILABLE and lose the partial signal.
    const mediaByIgdbId = await loadGameMediaByIgdbId(
      games.map((g) => g.id)
    );

    return res.status(200).json({
      page,
      // IGDB doesn't expose a total — set a generous upper bound so
      // the infinite-scroll hook keeps requesting pages until the
      // catalogue runs out (a short response naturally stops it).
      totalPages: games.length < limit ? page : page + 1,
      totalResults: games.length,
      results: games.map((g) => {
        const rows = mediaByIgdbId.get(g.id) ?? [];
        const igdbPlatforms = g.platforms ?? [];
        // For each IGDB platform, look up whether we have a
        // GameMedia row keyed on platformIgdbId. Falls back to a
        // name match if id wasn't recorded (legacy rows before
        // platformIgdbId was added always populated platformName).
        const platforms = igdbPlatforms.map((p) => {
          const matched =
            rows.find((r) => r.platformIgdbId === p.id) ??
            rows.find(
              (r) =>
                r.platformName?.toLowerCase() === p.name.toLowerCase()
            );
          return {
            id: p.id,
            name: p.name,
            abbreviation: p.abbreviation,
            mediaStatus: matched?.status ?? null,
            gameMediaId: matched?.id ?? null,
          };
        });
        return {
          id: g.id,
          igdbId: g.id,
          title: g.name,
          platforms,
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
        };
      }),
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

// Manga discover accepts an optional ``?genre=NAME`` (AniList
// genre string, e.g. ``Action``, ``Romance``) to narrow the
// trending feed to a single genre.
const MangaQuery = PageQuery.extend({
  genre: z.string().optional(),
});

discoverRoutes.get('/manga', requireMediaType('manga'), async (req, res) => {
  try {
    const { page, genre } = MangaQuery.parse(req.query);
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
        ? await anilist.getTrendingManga(perPage, genre)
        : await anilist.getTrendingManga(perPage * page, genre);

    // For pages > 1 we paginate locally — AniList's GraphQL gateway
    // doesn't accept an offset in the trending sort cleanly, so we
    // request a wider window and slice. Cheap because the gateway
    // caches by perPage.
    const sliced =
      page === 1 ? list : list.slice(perPage * (page - 1), perPage * page);

    const statusMap = await loadMangaStatusMap(sliced.map((m) => m.id));

    return res.status(200).json({
      page,
      totalPages: sliced.length < perPage ? page : page + 1,
      totalResults: sliced.length,
      results: sliced.map((m) => {
        const avail = statusMap.get(m.id);
        return {
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
          // Carry both the raw DB status and the scanner-tracked
          // counts so the card can derive PARTIALLY_AVAILABLE
          // without a per-render API call.
          mediaStatus: avail?.status ?? null,
          availableChapters: avail?.availableChapters ?? null,
          availableVolumes: avail?.availableVolumes ?? null,
          chapters: m.chapters ?? null,
          volumes: m.volumes ?? null,
          mediaType: 'manga',
        };
      }),
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

discoverRoutes.get('/comics', requireMediaType('comic'), async (req, res) => {
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
    const { default: ComicVineAPI } = await import('@server/api/comicvine');
    const client = new ComicVineAPI({ apiKey });
    const limit = 20;
    const volumes = await client.getRecentVolumes(page, limit);
    const statusMap = await loadComicStatusMap(volumes.map((v) => v.id));
    return res.status(200).json({
      page,
      totalPages: volumes.length < limit ? page : page + 1,
      totalResults: volumes.length,
      results: volumes.map((v) => {
        const avail = statusMap.get(v.id);
        return {
          id: v.id,
          comicVineId: v.id,
          title: v.name,
          coverUrl: v.image?.medium_url ?? v.image?.small_url,
          year: v.start_year ? Number(v.start_year) || undefined : undefined,
          issueCount: v.count_of_issues,
          publisher: v.publisher?.name,
          deck: v.deck ?? undefined,
          mediaStatus: avail?.status ?? null,
          availableIssues: avail?.availableIssues ?? null,
        };
      }),
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
});

discoverRoutes.get('/books', requireMediaType('book'), async (req, res) => {
  try {
    const { page, sort, genre } = PagedSortQuery.parse(req.query);
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
      // Genre filter routes through Hardcover's JSONB
      // ``_contains`` operator on ``cached_tags`` — the gateway
      // can index this so we get the filtered ``limit`` books
      // in a single cheap query, no in-memory bucketing. Falls
      // back to the generic popular/recent fetch when no genre
      // is requested.
      const hits = genre
        ? await hc.getBooksByGenre(genre, page, limit, sort)
        : await (sort === 'recent'
            ? hc.getRecentBooks(page, limit)
            : hc.getPopularBooks(page, limit));
      // Cascade-through when Hardcover returned nothing — fall
      // through to the OpenLibrary block below so the operator
      // doesn't get a blank grid for transient gateway issues.
      // For a genre filter that yields no matches we still
      // return the empty Hardcover envelope (the OpenLibrary
      // fall-through wouldn't know what to do with the genre
      // either).
      if (genre) {
        const ids = hits.map((h) => `hardcover:${h.id}`);
        const statusMap = await loadBookStatusMap(ids);
        return res.status(200).json({
          page,
          // Genre-filtered totals are unknown without a count
          // query — optimistically bump totalPages so infinite
          // scroll continues fetching until the upstream
          // returns a short page.
          totalPages: hits.length < limit ? page : page + 1,
          totalResults: hits.length,
          results: hits.map((h) => {
            const topEdition = h.editions?.[0];
            const olId = `hardcover:${h.id}`;
            return {
              id: olId,
              openLibraryId: olId,
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
              mediaStatus: statusMap.get(olId) ?? null,
            };
          }),
        });
      }
      if (hits.length > 0) {
        // Batch the BookMedia lookup against the ``hardcover:<id>``
        // shape the detail-page dispatcher persists into
        // ``openLibraryId``.
        const ids = hits.map((h) => `hardcover:${h.id}`);
        const statusMap = await loadBookStatusMap(ids);
        return res.status(200).json({
          page,
          totalPages: hits.length < limit ? page : page + 1,
          totalResults: hits.length,
          results: hits.map((h) => {
            const topEdition = h.editions?.[0];
            const olId = `hardcover:${h.id}`;
            return {
              id: olId,
              openLibraryId: olId,
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
              mediaStatus: statusMap.get(olId) ?? null,
            };
          }),
        });
      }
    }

    const { default: OpenLibraryAPI } = await import('@server/api/openlibrary');
    const client = new OpenLibraryAPI();
    // OpenLibrary doesn't expose a "recent" feed — fall back
    // to ``daily`` for popular AND ``weekly`` for recent
    // (wider window so non-trending recent releases surface).
    // It's not a perfect match but better than refusing to
    // honor the sort param.
    const period =
      sort === 'recent' ? 'weekly' : page === 1 ? 'daily' : 'weekly';
    const { results, totalResults } = await client.getTrending(
      period,
      page,
      limit
    );
    const statusMap = await loadBookStatusMap(
      results.map((b) => b.openLibraryId)
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
        mediaStatus: statusMap.get(b.openLibraryId) ?? null,
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
});

discoverRoutes.get(
  '/audiobooks',
  requireMediaType('audiobook'),
  async (req, res) => {
    try {
      const { page, sort, genre } = PagedSortQuery.parse(req.query);
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

      // Genre filter dispatches by the active audiobook provider
      // so the filtered grid stays consistent with the rest of
      // the audiobook UX:
      //   * primary=audible → genre is an Audible category_id,
      //     served via /catalog/products?category_id=<id>
      //   * primary=hardcover → genre is a Hardcover Genre-tag
      //     name, served via the cached_tags _contains filter
      // Routing the OTHER provider for a genre click would
      // surface foreign-source titles right next to the
      // operator's Audible/Hardcover-tiered Popular row.
      if (genre && audioCfg?.primarySource === 'audible' && audioCfg.audible) {
        const audibleRegion = (audioCfg.audibleRegion ??
          getSettings().metadataSettings?.audibleRegion ??
          'us') as AudibleRegion;
        const { default: AudibleAPI } = await import('@server/api/audible');
        const audible = new AudibleAPI(audibleRegion);
        const out = await audible.getByCategoryId(genre, sort, limit, page - 1);
        const statusMap = await loadAudiobookStatusMap(
          out.results.map((a) => a.asin)
        );
        return res.status(200).json({
          page,
          totalPages: out.results.length < limit ? page : page + 1,
          totalResults: out.totalResults,
          results: out.results.map((a) => ({
            id: a.asin,
            openLibraryId: a.asin,
            title: a.title,
            authorName: a.authorName,
            narratorName: a.narratorName,
            durationSeconds: a.durationSeconds,
            coverUrl: a.coverUrl,
            year: a.year,
            publisher: a.publisher,
            mediaStatus: statusMap.get(a.asin) ?? null,
          })),
        });
      }
      if (genre && sharedHcKey && audioCfg?.primarySource === 'hardcover') {
        try {
          const { default: HardcoverAPI, hardcoverPrimaryAuthor } =
            await import('@server/api/hardcover');
          const hc = new HardcoverAPI(sharedHcKey);
          const hits = await hc.getAudiobooksByGenre(genre, page, limit, sort);
          const ids = hits.map((h) => `hcab:${h.id}`);
          const statusMap = await loadBookStatusMap(ids);
          return res.status(200).json({
            page,
            totalPages: hits.length < limit ? page : page + 1,
            totalResults: hits.length,
            results: hits.map((h) => {
              const audio = h.editions?.[0];
              const olId = `hcab:${h.id}`;
              return {
                id: olId,
                openLibraryId: olId,
                title: h.title,
                authorName:
                  hardcoverPrimaryAuthor(h.contributions) ?? 'Unknown Author',
                narratorName: undefined,
                durationSeconds: audio?.audio_seconds ?? undefined,
                coverUrl: h.image?.url?.startsWith('http')
                  ? h.image.url
                  : undefined,
                year: h.release_date
                  ? Number(h.release_date.slice(0, 4)) || undefined
                  : undefined,
                publisher: audio?.publisher?.name ?? undefined,
                mediaStatus: statusMap.get(olId) ?? null,
              };
            }),
          });
        } catch (e) {
          logger.error('discover.audiobooks hardcover genre query failed', {
            label: 'discover',
            genre,
            error: e instanceof Error ? e.message : String(e),
          });
          return res.status(200).json({
            page,
            totalPages: 1,
            totalResults: 0,
            results: [],
          });
        }
      }

      if (useHardcover) {
        const { default: HardcoverAPI, hardcoverPrimaryAuthor } =
          await import('@server/api/hardcover');
        const hc = new HardcoverAPI(sharedHcKey);
        const hits =
          sort === 'recent'
            ? await hc.getRecentAudiobooks(page, limit)
            : await hc.getPopularAudiobooks(page, limit);
        // Cascade-through guard: when Hardcover returns ZERO hits
        // (rare but happens — Hasura gateway hiccup, sparse
        // results past page 1, account without API quota) we
        // must NOT early-return with an empty envelope. The
        // operator expects the page to keep showing audiobooks,
        // so fall through to Audible / OpenLibrary instead of
        // serving them a blank grid.
        if (hits.length > 0) {
          // BookMedia rows for Hardcover-sourced audiobooks land
          // with ``openLibraryId = 'hcab:<id>'`` (the detail-page
          // dispatcher's audiobook prefix). Batch the lookup on
          // that.
          const ids = hits.map((h) => `hcab:${h.id}`);
          const statusMap = await loadBookStatusMap(ids);
          return res.status(200).json({
            page,
            totalPages: hits.length < limit ? page : page + 1,
            totalResults: hits.length,
            results: hits.map((h) => {
              const audio = h.editions?.[0];
              const olId = `hcab:${h.id}`;
              return {
                id: olId,
                openLibraryId: olId,
                title: h.title,
                authorName:
                  hardcoverPrimaryAuthor(h.contributions) ?? 'Unknown Author',
                narratorName: undefined,
                durationSeconds: audio?.audio_seconds ?? undefined,
                coverUrl: h.image?.url?.startsWith('http')
                  ? h.image.url
                  : undefined,
                year: h.release_date
                  ? Number(h.release_date.slice(0, 4)) || undefined
                  : undefined,
                publisher: audio?.publisher?.name ?? undefined,
                mediaStatus: statusMap.get(olId) ?? null,
              };
            }),
          });
        }
      }

      // No Hardcover available — fall back to Audible's
      // ``/catalog/products`` with the sort that best matches
      // the operator's intent:
      //   * ``sort=popular`` → ``Popularity`` (catalog-wide
      //     popularity ranking — ``BestSellers`` requires a
      //     category_id to return data so ``Popularity`` is the
      //     right call for a generic browse surface).
      //   * ``sort=recent`` → ``ReleaseDate`` (newest first,
      //     pre-orders filtered out).
      // Audible's catalog is free + no auth; same regional
      // storefront the existing audiobook search already
      // targets.
      const audibleRegion = (audioCfg?.audibleRegion ??
        getSettings().metadataSettings?.audibleRegion ??
        'us') as AudibleRegion;
      const { default: AudibleAPI } = await import('@server/api/audible');
      const audible = new AudibleAPI(audibleRegion);
      // Audible uses 0-indexed paging.
      const audibleResults =
        sort === 'recent'
          ? await audible.getNewReleases(limit, page - 1)
          : await audible.getPopular(limit, page - 1);

      if (audibleResults.results.length > 0) {
        // Audible-sourced rows live in AudiobookMedia keyed by
        // ``asin``; batch the lookup so the dashboard cards
        // show "downloaded" / "requested" badges for titles
        // already on the operator's library.
        const statusMap = await loadAudiobookStatusMap(
          audibleResults.results.map((a) => a.asin)
        );
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
            mediaStatus: statusMap.get(a.asin) ?? null,
          })),
        });
      }

      // Audible came back empty (regional storefront / network
      // hiccup) — last-resort fallback to OpenLibrary trending
      // books. The audiobook edition of these popular titles is
      // reachable via the detail page's edition picker. Better
      // than a permanent empty state.
      const { default: OpenLibraryAPI } =
        await import('@server/api/openlibrary');
      const client = new OpenLibraryAPI();
      // No "recent" feed on OpenLibrary either; we widen the
      // trending window to ``weekly`` for the recent intent so
      // less-trending newer releases have a chance to surface.
      const period =
        sort === 'recent' ? 'weekly' : page === 1 ? 'daily' : 'weekly';
      const { results, totalResults } = await client.getTrending(
        period,
        page,
        limit
      );
      // Last-resort OpenLibrary fallback for audiobooks reuses
      // the BOOK-keyed BookMedia table (these are print-trending
      // titles that we surface here as audiobook candidates;
      // the audiobook edition lives behind the detail page's
      // edition picker).
      const statusMap = await loadBookStatusMap(
        results.map((b) => b.openLibraryId)
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
          mediaStatus: statusMap.get(b.openLibraryId) ?? null,
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

// ---------------------------------------------------------------------------
// Genre-slider endpoints — drive the dashboard "Game Genres" /
// "Manga Genres" rows the same way TMDB's
// ``/api/v1/discover/genreslider/{movie,tv}`` drive the existing
// Movie / TV genre rows. Returns ``[{ id, name }]`` so the
// frontend GenreCard can render a coloured tile per genre with a
// link back to the corresponding filtered discover page.
// ---------------------------------------------------------------------------

// Bucket-by-genre helper: take a list of items (each carrying
// the genres it's tagged with) and return ``{ genreKey →
// backdrop URLs }``. The slider passes the resulting array of
// backdrops to the tile, which rotates through them.
//
// Keeping this here (not in a util) because both providers
// shape genres differently — IGDB uses integer ids, AniList
// uses string names — and the keyer abstracts that out so the
// caller picks the right key per provider.
function bucketByGenre<T>(
  items: T[],
  keysFor: (item: T) => (string | number)[],
  backdrop: (item: T) => string | undefined,
  perGenre = 6
): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  for (const item of items) {
    const url = backdrop(item);
    if (!url) continue;
    for (const key of keysFor(item)) {
      const k = String(key);
      const list = buckets.get(k) ?? [];
      if (list.length < perGenre) {
        list.push(url);
        buckets.set(k, list);
      }
    }
  }
  return buckets;
}

discoverRoutes.get(
  '/genreslider/games',
  requireMediaType('game'),
  async (_req, res) => {
    try {
      const igdbSettings = getSettings().game?.igdb;
      if (!igdbSettings?.clientId || !igdbSettings?.clientSecret) {
        return res.status(200).json([]);
      }
      const { default: IgdbAPI } = await import('@server/api/igdb');
      const igdb = new IgdbAPI({
        clientId: igdbSettings.clientId,
        clientSecret: igdbSettings.clientSecret,
      });
      // One wide popular query covers ~6 covers per genre for
      // most of IGDB's 23 genres — cheaper than N queries (one
      // per genre) and the cover-URL set is what feeds the
      // rotating backdrops on each genre tile.
      const [genres, popular] = await Promise.all([
        igdb.getGenres(),
        igdb.getPopularGames(1, 200),
      ]);
      const coverFor = (g: { cover?: { url?: string } }) =>
        g.cover?.url
          ? `https:${g.cover.url.replace('t_thumb', 't_cover_big')}`
          : undefined;
      const backdrops = bucketByGenre(
        popular,
        (g) => (g.genres ?? []).map((x) => x.id ?? -1).filter((id) => id >= 0),
        coverFor
      );
      return res.status(200).json(
        genres.map((g) => ({
          id: g.id,
          name: g.name,
          backdrops: backdrops.get(String(g.id)) ?? [],
        }))
      );
    } catch (e) {
      logger.error('discover.genreslider.games failed', {
        label: 'discover',
        error: e instanceof Error ? e.message : String(e),
      });
      return res.status(200).json([]);
    }
  }
);

discoverRoutes.get(
  '/genreslider/manga',
  requireMediaType('manga'),
  async (_req, res) => {
    try {
      const { default: AniListAPI } = await import('@server/api/anilist');
      const anilist = new AniListAPI();
      // Same one-shot enrich for the manga slider: fetch top
      // trending with genres + cover URL in a single GraphQL
      // call, then bucket per genre. The genre list itself is
      // a separate cheap query.
      const [genres, popular] = await Promise.all([
        anilist.getGenres(),
        anilist.getTrendingMangaWithGenres(100),
      ]);
      const backdrops = bucketByGenre(
        popular,
        (m) => m.genres ?? [],
        (m) =>
          m.coverImage?.extraLarge ??
          m.coverImage?.large ??
          m.coverImage?.medium ??
          undefined
      );
      return res.status(200).json(
        genres.map((name) => ({
          id: name,
          name,
          backdrops: backdrops.get(name) ?? [],
        }))
      );
    } catch (e) {
      logger.error('discover.genreslider.manga failed', {
        label: 'discover',
        error: e instanceof Error ? e.message : String(e),
      });
      return res.status(200).json([]);
    }
  }
);

// Books / Audiobooks genre slider — only useful when Hardcover
// is the active provider (the OpenLibrary / Audible fallbacks
// don't expose comparable genre taxonomies). When Hardcover
// isn't configured we return [] and the slider self-hides on
// the dashboard.
//
// We curate the genre list (see ``BOOK_GENRES_CANONICAL``) rather
// than auto-deriving it from popular books so the dashboard rows
// stay stable. Backdrops are bucketed from the top 100 popular
// books that carry the matching ``cached_tags.Genre`` tag.
async function buildBookGenreSlider(
  apiKey: string,
  audiobook: boolean
): Promise<{ id: string; name: string; backdrops: string[] }[]> {
  const { default: HardcoverAPI } = await import('@server/api/hardcover');
  const hc = new HardcoverAPI(apiKey);
  const popular = audiobook
    ? await hc.getPopularAudiobooks(1, 100)
    : await hc.getPopularBooks(1, 100);
  const buckets = bucketByGenre(
    popular,
    (b) =>
      (b.cached_tags?.Genre ?? [])
        .map((t) => t.tag ?? '')
        .filter((t) => t.length > 0),
    (b) => (b.image?.url?.startsWith('http') ? b.image.url : undefined)
  );
  // Match against canonical list case-insensitively so Hardcover
  // capitalisation drift (``Sci-Fi`` vs ``Science Fiction`` vs
  // ``science fiction``) doesn't drop an otherwise-valid genre.
  const lower = new Map<string, string[]>();
  for (const [k, v] of buckets) lower.set(k.toLowerCase(), v);
  return BOOK_GENRES_CANONICAL.map((g) => ({
    id: g,
    name: g,
    backdrops: lower.get(g.toLowerCase()) ?? [],
  }));
}

discoverRoutes.get(
  '/genreslider/books',
  requireMediaType('book'),
  async (_req, res) => {
    try {
      const bookCfg = getSettings().book?.metadataProviders;
      const useHardcover =
        bookCfg?.primarySource === 'hardcover' &&
        bookCfg.hardcover &&
        !!bookCfg.hardcoverApiKey;
      if (!useHardcover || !bookCfg.hardcoverApiKey) {
        return res.status(200).json([]);
      }
      const data = await buildBookGenreSlider(bookCfg.hardcoverApiKey, false);
      return res.status(200).json(data);
    } catch (e) {
      logger.error('discover.genreslider.books failed', {
        label: 'discover',
        error: e instanceof Error ? e.message : String(e),
      });
      return res.status(200).json([]);
    }
  }
);

// Audible-driven audiobook genre slider — uses the storefront's
// ~24 top-level categories as "genres" and seeds each tile's
// backdrop pool from the BestSellers in that category (one
// product call per category, parallelised + cached 1h). Picks
// 6 covers per tile, same shape the Hardcover slider returns.
async function buildAudibleGenreSlider(
  region: AudibleRegion
): Promise<{ id: string; name: string; backdrops: string[] }[]> {
  const { default: AudibleAPI } = await import('@server/api/audible');
  const audible = new AudibleAPI(region);
  const categories = await audible.getCategories();
  if (categories.length === 0) return [];
  // Parallel fetch: ~24 small requests. Audible's CDN handles
  // these fine; staying within the per-region cache window.
  const enriched = await Promise.all(
    categories.map(async (c) => {
      const { results } = await audible.getByCategoryId(c.id, 'popular', 6, 0);
      return {
        id: c.id,
        name: c.name,
        backdrops: results
          .map((r) => r.coverUrl)
          .filter((u): u is string => !!u),
      };
    })
  );
  return enriched;
}

discoverRoutes.get(
  '/genreslider/audiobooks',
  requireMediaType('audiobook'),
  async (_req, res) => {
    try {
      const audioCfg = getSettings().audiobook?.metadataProviders;
      const bookCfg = getSettings().book?.metadataProviders;
      // Source the slider from the same provider that backs the
      // operator's actual audiobook browse: Audible categories
      // when Audible is primary, Hardcover Genre tags when
      // Hardcover is primary. Without this branching, clicking
      // a tile would surface content from the OTHER provider
      // and feel inconsistent with the rest of the audiobook
      // UX.
      if (audioCfg?.primarySource === 'audible' && audioCfg.audible) {
        const region = (audioCfg.audibleRegion ??
          getSettings().metadataSettings?.audibleRegion ??
          'us') as AudibleRegion;
        const data = await buildAudibleGenreSlider(region);
        return res.status(200).json(data);
      }
      const sharedHcKey = bookCfg?.hardcoverApiKey;
      if (
        audioCfg?.primarySource === 'hardcover' &&
        audioCfg.hardcover &&
        sharedHcKey
      ) {
        const data = await buildBookGenreSlider(sharedHcKey, true);
        return res.status(200).json(data);
      }
      // No usable provider — return [] so the slider self-hides.
      return res.status(200).json([]);
    } catch (e) {
      logger.error('discover.genreslider.audiobooks failed', {
        label: 'discover',
        error: e instanceof Error ? e.message : String(e),
      });
      return res.status(200).json([]);
    }
  }
);

// ---------------------------------------------------------------------------
// Platform slider — IGDB platform tiles for the games dashboard.
// Derives the list of platforms from the top popular games so the
// dashboard surfaces consoles operators actually have content for
// (no hard-coded NES / GameCube / PS5 list to maintain). Each tile
// also carries a small ``backdrops`` pool of game covers tagged
// with that platform — GradientGenreCard rotates one in per
// mount, same UX as the genre tiles.
// ---------------------------------------------------------------------------

discoverRoutes.get(
  '/platformslider/games',
  requireMediaType('game'),
  async (_req, res) => {
    try {
      const igdbSettings = getSettings().game?.igdb;
      if (!igdbSettings?.clientId || !igdbSettings?.clientSecret) {
        return res.status(200).json([]);
      }
      const { default: IgdbAPI } = await import('@server/api/igdb');
      const { getRomarrSupportedPlatformIds } =
        await import('@server/lib/services/romarrDispatcher');
      const igdb = new IgdbAPI({
        clientId: igdbSettings.clientId,
        clientSecret: igdbSettings.clientSecret,
      });
      // Match the request-button logic: when the operator has set
      // ``restrictToRomarrPlatforms`` AND a Romarr instance is
      // configured, narrow the dashboard tiles to platforms
      // Romarr can actually acquire (so clicking a tile doesn't
      // land on a list of unrequestable titles). Fails open when
      // Romarr isn't reachable — same defensive default used by
      // /api/v1/game/romarr/platforms.
      const restrictSetting =
        getSettings().game.restrictToRomarrPlatforms ?? true;
      const supportedIds = restrictSetting
        ? await getRomarrSupportedPlatformIds()
        : null;
      const allowSet =
        restrictSetting && supportedIds && supportedIds.length > 0
          ? new Set(supportedIds)
          : null;
      // Wide popular query → bucket games by their tagged
      // platforms. The cover-URL set is what feeds the rotating
      // backdrops on each platform tile.
      const popular = await igdb.getPopularGames(1, 200);
      const coverFor = (g: { cover?: { url?: string } }) =>
        g.cover?.url
          ? `https:${g.cover.url.replace('t_thumb', 't_cover_big')}`
          : undefined;
      const buckets = bucketByGenre(
        popular,
        (g) =>
          (g.platforms ?? [])
            .map((p) => p.id ?? -1)
            .filter((id) => id >= 0 && (!allowSet || allowSet.has(id))),
        coverFor
      );
      // Build a {id → name} map from the same popular response —
      // avoids a second IGDB round-trip just for platform names.
      const nameById = new Map<number, string>();
      for (const g of popular) {
        for (const p of g.platforms ?? []) {
          if (p.id != null && !nameById.has(p.id)) {
            nameById.set(p.id, p.name);
          }
        }
      }
      // For platforms in the allowlist that didn't show up in
      // the top-200 popular (rare retro consoles), we still want
      // a tile — fetch their names from IGDB so the operator
      // sees the full set Romarr can acquire even if no popular
      // title carries the platform tag. Tiles with empty
      // ``backdrops`` fall back to the deterministic gradient.
      const missingFromPopular = allowSet
        ? [...allowSet].filter((id) => !nameById.has(id))
        : [];
      if (missingFromPopular.length > 0) {
        const extraPlatforms = await igdb.getPlatforms();
        for (const p of extraPlatforms) {
          if (missingFromPopular.includes(p.id) && !nameById.has(p.id)) {
            nameById.set(p.id, p.name);
          }
        }
      }
      const seedIds = allowSet
        ? // Restricted mode: ALWAYS include every allowed id,
          // even those with empty backdrops, so the dashboard
          // mirrors "what Romarr can acquire" exactly.
          [...allowSet]
        : [...buckets.keys()].map(Number);
      const tiles = seedIds
        .map((id) => ({
          id,
          name: nameById.get(id) ?? `Platform ${id}`,
          backdrops: buckets.get(String(id)) ?? [],
          count: (buckets.get(String(id)) ?? []).length,
        }))
        // Sort by how many popular games came from each platform
        // — keeps the dashboard row weighted toward the consoles
        // operators actually browse (current-gen, Switch, etc.).
        // Empty-bucket allowed platforms sort to the end.
        .sort((a, b) => b.count - a.count)
        .slice(0, allowSet ? 100 : 24)
        .map(({ id, name, backdrops }) => ({ id, name, backdrops }));
      return res.status(200).json(tiles);
    } catch (e) {
      logger.error('discover.platformslider.games failed', {
        label: 'discover',
        error: e instanceof Error ? e.message : String(e),
      });
      return res.status(200).json([]);
    }
  }
);

export default discoverRoutes;

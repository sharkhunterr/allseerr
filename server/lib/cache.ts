import NodeCache from 'node-cache';

export type AvailableCacheIds =
  | 'tmdb'
  | 'radarr'
  | 'sonarr'
  | 'rt'
  | 'imdb'
  | 'github'
  | 'plexguid'
  | 'plextv'
  | 'plexwatchlist'
  | 'tvdb'
  | 'romm'
  | 'audiobookshelf'
  | 'komga'
  | 'grimmory'
  | 'bindery'
  | 'bookshelf'
  | 'livrarr'
  | 'pressarr'
  | 'openlibrary'
  | 'googlebooks'
  | 'hardcover'
  | 'audible'
  | 'anilist'
  | 'comicvine';

const DEFAULT_TTL = 300;
const DEFAULT_CHECK_PERIOD = 120;

class Cache {
  public id: AvailableCacheIds;
  public data: NodeCache;
  public name: string;

  constructor(
    id: AvailableCacheIds,
    name: string,
    options: { stdTtl?: number; checkPeriod?: number } = {}
  ) {
    this.id = id;
    this.name = name;
    this.data = new NodeCache({
      stdTTL: options.stdTtl ?? DEFAULT_TTL,
      checkperiod: options.checkPeriod ?? DEFAULT_CHECK_PERIOD,
    });
  }

  public getStats() {
    return this.data.getStats();
  }

  public flush(): void {
    this.data.flushAll();
  }
}

class CacheManager {
  private availableCaches: Record<AvailableCacheIds, Cache> = {
    tmdb: new Cache('tmdb', 'The Movie Database API', {
      stdTtl: 21600,
      checkPeriod: 60 * 30,
    }),
    radarr: new Cache('radarr', 'Radarr API'),
    sonarr: new Cache('sonarr', 'Sonarr API'),
    bindery: new Cache('bindery', 'Bindery API'),
    bookshelf: new Cache('bookshelf', 'Bookshelf API'),
    livrarr: new Cache('livrarr', 'Livrarr API'),
    pressarr: new Cache('pressarr', 'Pressarr API'),
    openlibrary: new Cache('openlibrary', 'OpenLibrary API', {
      // Work/author/editions records change rarely; 24h keeps things
      // fresh without hammering OL on every book page refresh.
      stdTtl: 86400,
      checkPeriod: 60 * 60,
    }),
    googlebooks: new Cache('googlebooks', 'Google Books API', {
      // Search results are less stable; 1h is enough to absorb
      // repeated page loads without burning through the 429 quota.
      stdTtl: 3600,
      checkPeriod: 60 * 10,
    }),
    hardcover: new Cache('hardcover', 'Hardcover API', {
      // Book/series by id is stable (12h); free-text search can shift
      // so we cache it shorter — see class implementation.
      stdTtl: 12 * 3600,
      checkPeriod: 60 * 30,
    }),
    audible: new Cache('audible', 'Audible API', {
      stdTtl: 86400,
      checkPeriod: 60 * 60,
    }),
    anilist: new Cache('anilist', 'AniList API', {
      // Manga records are extremely stable (covers, status, chapter
      // count change at a slow drip); 12h is plenty. Free-text search
      // is rate-limited (90 req/min) so caching is mostly to absorb
      // the same query landing again from search-as-you-type.
      stdTtl: 12 * 3600,
      checkPeriod: 60 * 30,
    }),
    comicvine: new Cache('comicvine', 'ComicVine API', {
      // ComicVine throttles per-resource at 200/h. Volume / publisher
      // / person data is very stable so a 12h TTL keeps repeat detail-
      // page hits off the wire entirely.
      stdTtl: 12 * 3600,
      checkPeriod: 60 * 30,
    }),
    rt: new Cache('rt', 'Rotten Tomatoes API', {
      stdTtl: 43200,
      checkPeriod: 60 * 30,
    }),
    imdb: new Cache('imdb', 'IMDB Radarr Proxy', {
      stdTtl: 43200,
      checkPeriod: 60 * 30,
    }),
    github: new Cache('github', 'GitHub API', {
      stdTtl: 21600,
      checkPeriod: 60 * 30,
    }),
    plexguid: new Cache('plexguid', 'Plex GUID', {
      stdTtl: 86400 * 7, // 1 week cache
      checkPeriod: 60 * 30,
    }),
    plextv: new Cache('plextv', 'Plex TV', {
      stdTtl: 86400 * 7, // 1 week cache
      checkPeriod: 60,
    }),
    plexwatchlist: new Cache('plexwatchlist', 'Plex Watchlist'),
    tvdb: new Cache('tvdb', 'The TVDB API', {
      stdTtl: 21600,
      checkPeriod: 60 * 30,
    }),
    romm: new Cache('romm', 'ROMM Games', {
      stdTtl: 86400,
      checkPeriod: 60 * 30,
    }),
    audiobookshelf: new Cache('audiobookshelf', 'Audiobookshelf Library', {
      stdTtl: 86400,
      checkPeriod: 60 * 30,
    }),
    komga: new Cache('komga', 'Komga Library', {
      stdTtl: 86400,
      checkPeriod: 60 * 30,
    }),
    grimmory: new Cache('grimmory', 'Grimmory Library', {
      stdTtl: 86400,
      checkPeriod: 60 * 30,
    }),
  };

  public getCache(id: AvailableCacheIds): Cache {
    return this.availableCaches[id];
  }

  public getAllCaches(): Record<string, Cache> {
    return this.availableCaches;
  }
}

const cacheManager = new CacheManager();

export default cacheManager;

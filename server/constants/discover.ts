import type DiscoverSlider from '@server/entity/DiscoverSlider';

export enum DiscoverSliderType {
  RECENTLY_ADDED = 1,
  RECENT_REQUESTS,
  PLEX_WATCHLIST,
  TRENDING,
  POPULAR_MOVIES,
  MOVIE_GENRES,
  UPCOMING_MOVIES,
  STUDIOS,
  POPULAR_TV,
  TV_GENRES,
  UPCOMING_TV,
  NETWORKS,
  TMDB_MOVIE_KEYWORD,
  TMDB_MOVIE_GENRE,
  TMDB_TV_KEYWORD,
  TMDB_TV_GENRE,
  TMDB_SEARCH,
  TMDB_STUDIO,
  TMDB_NETWORK,
  TMDB_MOVIE_STREAMING_SERVICES,
  TMDB_TV_STREAMING_SERVICES,
  // Non-TMDB extended-media sliders — each wraps the
  // ``/api/v1/discover/{type}`` endpoint and is gated client-side
  // on the corresponding ``{type}Enabled`` setting AND the
  // slider's own ``totalResults > 0`` (so unmet upstreams don't
  // leave dead rows on the dashboard). Enum gaps left after the
  // legacy TMDB row to avoid renumbering existing operator data.
  POPULAR_GAMES,
  POPULAR_MANGA,
  POPULAR_COMICS,
  POPULAR_BOOKS,
  POPULAR_AUDIOBOOKS,
  GAME_GENRES,
  MANGA_GENRES,
  // COMIC_GENRES intentionally absent: ComicVine has no clean
  // genre taxonomy per volume and curating one would mislead
  // operators. Revisit if a provider with usable genre data
  // ships (e.g. Marvel/DC catalogues).
  BOOK_GENRES,
  AUDIOBOOK_GENRES,
  GAME_PLATFORMS,
}

export const defaultSliders: Partial<DiscoverSlider>[] = [
  {
    type: DiscoverSliderType.RECENTLY_ADDED,
    enabled: true,
    isBuiltIn: true,
    order: 0,
  },
  {
    type: DiscoverSliderType.RECENT_REQUESTS,
    enabled: true,
    isBuiltIn: true,
    order: 1,
  },
  {
    type: DiscoverSliderType.PLEX_WATCHLIST,
    enabled: true,
    isBuiltIn: true,
    order: 2,
  },
  {
    type: DiscoverSliderType.TRENDING,
    enabled: true,
    isBuiltIn: true,
    order: 3,
  },
  {
    type: DiscoverSliderType.POPULAR_MOVIES,
    enabled: true,
    isBuiltIn: true,
    order: 4,
  },
  {
    type: DiscoverSliderType.MOVIE_GENRES,
    enabled: true,
    isBuiltIn: true,
    order: 5,
  },
  {
    type: DiscoverSliderType.UPCOMING_MOVIES,
    enabled: true,
    isBuiltIn: true,
    order: 6,
  },
  {
    type: DiscoverSliderType.STUDIOS,
    enabled: true,
    isBuiltIn: true,
    order: 7,
  },
  {
    type: DiscoverSliderType.POPULAR_TV,
    enabled: true,
    isBuiltIn: true,
    order: 8,
  },
  {
    type: DiscoverSliderType.TV_GENRES,
    enabled: true,
    isBuiltIn: true,
    order: 9,
  },
  {
    type: DiscoverSliderType.UPCOMING_TV,
    enabled: true,
    isBuiltIn: true,
    order: 10,
  },
  {
    type: DiscoverSliderType.NETWORKS,
    enabled: true,
    isBuiltIn: true,
    order: 11,
  },
  // Extended-media defaults — enabled by default so they appear
  // on a fresh install IF the operator has the corresponding
  // ``{type}Enabled`` setting turned on. The client-side gate on
  // the dashboard skips rendering when the setting is off, so
  // operators with only Plex/Sonarr/Radarr configured don't see
  // them; turning a type on in Settings → Services reveals its
  // row without a UI restart.
  {
    type: DiscoverSliderType.POPULAR_GAMES,
    enabled: true,
    isBuiltIn: true,
    order: 12,
  },
  {
    type: DiscoverSliderType.GAME_GENRES,
    enabled: true,
    isBuiltIn: true,
    order: 13,
  },
  {
    type: DiscoverSliderType.GAME_PLATFORMS,
    enabled: true,
    isBuiltIn: true,
    order: 14,
  },
  {
    type: DiscoverSliderType.POPULAR_MANGA,
    enabled: true,
    isBuiltIn: true,
    order: 15,
  },
  {
    type: DiscoverSliderType.MANGA_GENRES,
    enabled: true,
    isBuiltIn: true,
    order: 16,
  },
  {
    type: DiscoverSliderType.POPULAR_COMICS,
    enabled: true,
    isBuiltIn: true,
    order: 17,
  },
  {
    type: DiscoverSliderType.POPULAR_BOOKS,
    enabled: true,
    isBuiltIn: true,
    order: 18,
  },
  {
    type: DiscoverSliderType.BOOK_GENRES,
    enabled: true,
    isBuiltIn: true,
    order: 19,
  },
  {
    type: DiscoverSliderType.POPULAR_AUDIOBOOKS,
    enabled: true,
    isBuiltIn: true,
    order: 20,
  },
  {
    type: DiscoverSliderType.AUDIOBOOK_GENRES,
    enabled: true,
    isBuiltIn: true,
    order: 21,
  },
];

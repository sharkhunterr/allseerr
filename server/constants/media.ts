export enum MediaRequestStatus {
  PENDING = 1,
  APPROVED,
  DECLINED,
  FAILED,
  COMPLETED,
}

export enum MediaType {
  MOVIE = 'movie',
  TV = 'tv',
  BOOK = 'book',
  AUDIOBOOK = 'audiobook',
  GAME = 'game',
  MANGA = 'manga',
  COMIC = 'comic',
  MUSIC = 'music',
  // Magazines / press / journals. Dispatched to Pressarr
  // (kkodecs/pressarr — *arr-style periodical manager) when an
  // operator has a default Pressarr instance configured.
  // Metadata discovery via Google Books printType=magazines,
  // with manual fallback when no API key is set.
  MAGAZINE = 'magazine',
}

export enum MediaStatus {
  UNKNOWN = 1,
  PENDING,
  PROCESSING,
  PARTIALLY_AVAILABLE,
  AVAILABLE,
  BLOCKLISTED,
  DELETED,
}

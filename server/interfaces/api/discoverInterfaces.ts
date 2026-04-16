export interface GenreSliderItem {
  id: number;
  name: string;
  backdrops: string[];
}

export interface WatchlistItem {
  id: number;
  ratingKey: string;
  tmdbId: number;
  mediaType: string;
  title: string;
}

export interface WatchlistResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: WatchlistItem[];
}

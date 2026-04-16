import type { MediaStatus, MediaType } from '@server/constants/media';

export interface BookSearchResult {
  openLibraryId: string;
  title: string;
  authorName: string;
  isbn13?: string;
  isbn10?: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  pageCount?: number;
  seriesName?: string;
  seriesPosition?: number;
  subjects?: string[];
  mediaType: MediaType;
  mediaStatus?: MediaStatus | null;
  bookMediaId?: number | null;
}

export interface BookDetailResult {
  key: string;
  title: string;
  description?: string;
  covers?: number[];
  subjects?: string[];
  authors?: Array<{ author: { key: string }; type?: { key: string } }>;
  mediaStatus?: MediaStatus | null;
  bookMediaId?: number | null;
  libraryServerUrl?: string | null;
}

export interface AudiobookSearchResult extends BookSearchResult {
  narratorName?: string;
  durationSeconds?: number;
  asin?: string;
  isAbridged?: boolean;
}

export interface BookRequestBody {
  mediaType: MediaType;
  openLibraryId: string;
  title: string;
  authorName: string;
  foreignBookId: string;
  foreignAuthorId?: string;
  isbn13?: string;
  isbn10?: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  narratorName?: string;
  note?: string;
  preferredFormat?: string;
}

export interface BookAvailabilityResult {
  available: boolean;
  servers: Array<{
    serverId: number;
    serverName: string;
    serverType: string;
    libraryUrl: string;
  }>;
}

export interface LibraryBookResult {
  foreignBookId: string;
  title: string;
  authorName: string;
  isbn13?: string;
  isbn10?: string;
  asin?: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  narratorName?: string;
  durationSeconds?: number;
  serverUrl?: string;
}

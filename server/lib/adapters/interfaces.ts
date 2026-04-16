import type { MediaType } from '@server/constants/media';

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

export interface AvailabilityResult {
  available: boolean;
  libraryUrl?: string;
}

export interface SubmissionResult {
  success: boolean;
  externalId?: string;
  message?: string;
}

export interface RequestStatus {
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'unknown';
  message?: string;
}

export interface QualityProfile {
  id: number;
  name: string;
}

export interface RootFolder {
  id: number;
  path: string;
  freeSpace?: number;
}

/**
 * Base interface for all library server adapters.
 * Constitution Principle II: all external service integrations
 * MUST implement this interface.
 */
export interface MediaLibraryAdapter {
  readonly mediaTypes: MediaType[];
  readonly name: string;
  checkAvailability(
    externalId: string,
    type: MediaType
  ): Promise<AvailabilityResult>;
  triggerLibraryScan(externalId?: string): Promise<void>;
  testConnection(): Promise<ConnectionTestResult>;
}

/**
 * Base interface for all download manager adapters.
 * Constitution Principle II.
 */
export interface DownloadManagerAdapter {
  readonly mediaTypes: MediaType[];
  readonly name: string;
  submitRequest(request: MediaRequest): Promise<SubmissionResult>;
  checkStatus(externalId: string): Promise<RequestStatus>;
  testConnection(): Promise<ConnectionTestResult>;
  getQualityProfiles?(): Promise<QualityProfile[]>;
  getRootFolders?(): Promise<RootFolder[]>;
}

/**
 * Extended interface for book library adapters.
 * Adds book-specific search methods.
 */
export interface BookLibraryAdapter extends MediaLibraryAdapter {
  searchByISBN(isbn: string): Promise<BookSearchResult | null>;
  searchByTitleAuthor(
    title: string,
    author: string
  ): Promise<BookSearchResult[]>;
}

/**
 * Extended interface for audiobook library adapters.
 */
export interface AudiobookLibraryAdapter extends MediaLibraryAdapter {
  searchByASIN(asin: string): Promise<AudiobookSearchResult | null>;
  searchByTitleAuthor(
    title: string,
    author: string
  ): Promise<AudiobookSearchResult[]>;
}

export interface BookSearchResult {
  foreignBookId: string;
  title: string;
  authorName: string;
  isbn13?: string;
  isbn10?: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  seriesName?: string;
  seriesPosition?: number;
}

export interface AudiobookSearchResult {
  foreignBookId: string;
  title: string;
  authorName: string;
  narratorName?: string;
  durationSeconds?: number;
  asin?: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
}

/**
 * Minimal request shape passed to download manager adapters.
 */
export interface MediaRequest {
  externalId: string;
  title: string;
  mediaType: MediaType;
  qualityProfileId?: number;
  rootFolderPath?: string;
}

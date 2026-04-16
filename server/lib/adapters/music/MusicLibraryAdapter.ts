import type { MediaType } from '@server/constants/media';
import type { MusicRequest } from '@server/entity/MusicRequest';

export interface ArtistSearchResult {
  id: string;
  name: string;
  musicbrainzId?: string;
}

export interface AlbumSearchResult {
  id: string;
  title: string;
  artistName: string;
  musicbrainzId?: string;
  year?: number;
  coverUrl?: string;
}

export interface AlbumAvailabilityResult {
  available: boolean;
  libraryUrl?: string;
}

/**
 * Music library adapter interface — STUB (Phase 3).
 * Extends the conceptual MediaLibraryAdapter pattern with
 * music-specific search methods.
 *
 * Future implementations: Navidrome/Subsonic.
 */
export interface MusicLibraryAdapter {
  readonly mediaTypes: MediaType[];
  readonly name: string;

  /** Search for an artist by name. */
  searchArtist(query: string): Promise<ArtistSearchResult[]>;

  /** Search for an album by artist and title. */
  searchAlbum(
    artist: string,
    title: string
  ): Promise<AlbumSearchResult[]>;

  /** Check if a specific album is available by MusicBrainz ID. */
  checkAlbumAvailability(
    musicBrainzId: string
  ): Promise<AlbumAvailabilityResult>;

  /** Test the connection to the music library server. */
  testConnection(): Promise<{ success: boolean; message: string }>;
}

/**
 * Music download adapter interface — STUB (Phase 3).
 * Extends the conceptual DownloadManagerAdapter pattern with
 * music-specific request methods.
 *
 * Future implementations: Lidarr.
 */
export interface MusicDownloadAdapter {
  readonly mediaTypes: MediaType[];
  readonly name: string;

  /** Submit an album download request. */
  submitAlbumRequest(
    request: MusicRequest
  ): Promise<{ success: boolean; externalId?: string; message?: string }>;

  /** Submit a single track download request. */
  submitTrackRequest(
    request: MusicRequest
  ): Promise<{ success: boolean; externalId?: string; message?: string }>;

  /** Test the connection to the download manager. */
  testConnection(): Promise<{ success: boolean; message: string }>;
}

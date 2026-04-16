import { MediaType } from '@server/constants/media';
import type {
  AlbumAvailabilityResult,
  AlbumSearchResult,
  ArtistSearchResult,
  MusicLibraryAdapter,
} from './MusicLibraryAdapter';

/**
 * Subsonic/Navidrome adapter — STUB (Phase 3).
 * All methods throw NotImplementedError.
 * See specs/004-music-stubs/spec.md for context.
 */
export class SubsonicAdapter implements MusicLibraryAdapter {
  readonly mediaTypes = [MediaType.MUSIC];
  readonly name = 'Subsonic';

  /**
   * Search for an artist by name.
   * Future: GET /rest/search3 with Subsonic API token auth.
   */
  async searchArtist(_query: string): Promise<ArtistSearchResult[]> {
    throw new Error(
      'Music support is not yet implemented. See Phase 3 spec.'
    );
  }

  /**
   * Search for an album by artist and title.
   * Future: GET /rest/search3 with artist+album query.
   */
  async searchAlbum(
    _artist: string,
    _title: string
  ): Promise<AlbumSearchResult[]> {
    throw new Error(
      'Music support is not yet implemented. See Phase 3 spec.'
    );
  }

  /**
   * Check if a specific album is available by MusicBrainz ID.
   * Future: Search by musicBrainzId in Navidrome/Subsonic.
   */
  async checkAlbumAvailability(
    _musicBrainzId: string
  ): Promise<AlbumAvailabilityResult> {
    throw new Error(
      'Music support is not yet implemented. See Phase 3 spec.'
    );
  }

  /**
   * Test connection to a Subsonic/Navidrome instance.
   * Future: GET /rest/ping with token auth.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    throw new Error(
      'Music support is not yet implemented. See Phase 3 spec.'
    );
  }
}

export default SubsonicAdapter;

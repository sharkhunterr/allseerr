import { MediaType } from '@server/constants/media';
import type { MusicRequest } from '@server/entity/MusicRequest';
import type { MusicDownloadAdapter } from './MusicLibraryAdapter';

/**
 * Lidarr adapter — STUB (Phase 3).
 * All methods throw NotImplementedError.
 * See specs/004-music-stubs/spec.md for context.
 */
export class LidarrAdapter implements MusicDownloadAdapter {
  readonly mediaTypes = [MediaType.MUSIC];
  readonly name = 'Lidarr';

  /**
   * Submit an album download request to Lidarr.
   * Future: POST to Lidarr /api/v1/album with MusicBrainz ID.
   */
  async submitAlbumRequest(
    _request: MusicRequest
  ): Promise<{ success: boolean; externalId?: string; message?: string }> {
    throw new Error(
      'Music support is not yet implemented. See Phase 3 spec.'
    );
  }

  /**
   * Submit a single track download request to Lidarr.
   * Future: May need track-level Lidarr API if supported.
   */
  async submitTrackRequest(
    _request: MusicRequest
  ): Promise<{ success: boolean; externalId?: string; message?: string }> {
    throw new Error(
      'Music support is not yet implemented. See Phase 3 spec.'
    );
  }

  /**
   * Test connection to a Lidarr instance.
   * Future: GET /api/v1/system/status with API key auth.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    throw new Error(
      'Music support is not yet implemented. See Phase 3 spec.'
    );
  }
}

export default LidarrAdapter;

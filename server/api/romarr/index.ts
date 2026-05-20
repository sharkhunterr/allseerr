import type { ConnectionTestResult } from '@server/lib/adapters/interfaces';
import logger from '@server/logger';
import axios, { type AxiosInstance } from 'axios';

interface RomarrConfig {
  url: string;
  apiKey: string;
}

export interface RomarrGame {
  id: number;
  title: string;
  slug?: string;
  platform_id: number;
  igdb_id: number | null;
  monitored: boolean;
}

export interface RomarrRequestResult {
  // 'added' — a new Game row was created.
  // 'already_present' — the IGDB game already lived in the library.
  status: 'added' | 'already_present';
  game: RomarrGame;
}

export interface RomarrStatusResult {
  present: boolean;
  games: RomarrGame[];
}

/**
 * Romarr client — the game *acquisition* service (the Radarr role
 * for ROMs).
 *
 * Romarr exposes an IGDB-native integration surface so allseerr can
 * drive it knowing only IGDB ids (Romarr resolves its own internal
 * platform + library):
 *
 *   POST /api/v3/game/integrations/request  — acquire an IGDB game
 *   GET  /api/v3/game/integrations/status   — is it already present
 *
 * Both are admin-only; ``apiKey`` must be a Romarr admin API key,
 * sent in the ``X-Api-Key`` header.
 */
class RomarrAPI {
  private http: AxiosInstance;

  constructor(config: RomarrConfig) {
    if (!config.url) {
      throw new Error('Romarr URL is required.');
    }
    if (!config.apiKey) {
      throw new Error('Romarr API key is required.');
    }
    this.http = axios.create({
      baseURL: config.url.replace(/\/$/, ''),
      timeout: 20000,
      headers: {
        'X-Api-Key': config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Probe Romarr by hitting an admin-only endpoint — this validates
   * BOTH reachability and the API key in one round-trip. The status
   * endpoint (``/api/v3/system/status``) is public, so it can't
   * confirm the key; the integration status check can.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.http.get('/api/v3/game/integrations/status', {
        params: { igdbId: 1 },
      });
      return { success: true, message: 'Connected to Romarr.' };
    } catch (e) {
      if (axios.isAxiosError(e) && e.response) {
        if (e.response.status === 401 || e.response.status === 403) {
          return {
            success: false,
            message: 'Invalid Romarr API key (admin scope required).',
          };
        }
        return {
          success: false,
          message: `Romarr returned HTTP ${e.response.status}.`,
        };
      }
      return {
        success: false,
        message: e instanceof Error ? e.message : 'Could not reach Romarr.',
      };
    }
  }

  /**
   * Ask Romarr to acquire an IGDB game. Idempotent on Romarr's side
   * — a repeat call returns the existing row with
   * ``status='already_present'``.
   */
  async requestGame(params: {
    igdbId: number;
    igdbPlatformId: number;
    title: string;
    monitored?: boolean;
  }): Promise<RomarrRequestResult> {
    const res = await this.http.post<RomarrRequestResult>(
      '/api/v3/game/integrations/request',
      {
        igdbId: params.igdbId,
        igdbPlatformId: params.igdbPlatformId,
        title: params.title,
        monitored: params.monitored ?? true,
      }
    );
    return res.data;
  }

  /** Whether an IGDB game is already in the Romarr library. */
  async getGameStatus(igdbId: number): Promise<RomarrStatusResult> {
    try {
      const res = await this.http.get<RomarrStatusResult>(
        '/api/v3/game/integrations/status',
        { params: { igdbId } }
      );
      return res.data;
    } catch (e) {
      logger.warn('Romarr status check failed', {
        label: 'romarr',
        igdbId,
        error: e instanceof Error ? e.message : String(e),
      });
      return { present: false, games: [] };
    }
  }
}

export default RomarrAPI;

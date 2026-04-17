import ExternalAPI from '@server/api/externalapi';
import { MediaType } from '@server/constants/media';
import type {
  AvailabilityResult,
  ConnectionTestResult,
  MediaLibraryAdapter,
} from '@server/lib/adapters/interfaces';
import logger from '@server/logger';

interface RommConfig {
  hostname: string;
  port: number;
  apiKey?: string;
  username?: string;
  password?: string;
  useSsl: boolean;
  baseUrl?: string;
}

interface RommGame {
  id: number;
  igdb_id?: number;
  name: string;
  platform_name?: string;
  platform_igdb_id?: number;
  file_name?: string;
}

/**
 * ROMM adapter for game library management.
 * Polls ROMM for new game entries to update availability.
 */
export class RommAdapter extends ExternalAPI implements MediaLibraryAdapter {
  readonly mediaTypes = [MediaType.GAME];
  readonly name = 'ROMM';

  constructor(config: RommConfig) {
    const protocol = config.useSsl ? 'https' : 'http';
    const baseUrl = `${protocol}://${config.hostname}:${config.port}${config.baseUrl || ''}/api`;

    const headers: Record<string, unknown> = {};
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    } else if (config.username && config.password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
    }

    super(baseUrl, {}, { headers });
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.axios.get('/heartbeat');
      return {
        success: response.status === 200,
        message: 'Connected to ROMM',
      };
    } catch (e) {
      return {
        success: false,
        message: `ROMM connection failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async checkAvailability(
    externalId: string,
    _type: MediaType
  ): Promise<AvailabilityResult> {
    try {
      const [igdbId, platformId] = externalId.split(':').map(Number);
      const games = await this.getGames();
      const match = games.find(
        (g) => g.igdb_id === igdbId && g.platform_igdb_id === platformId
      );
      if (match) {
        return {
          available: true,
          libraryUrl: `${this.axios.defaults.baseURL?.replace('/api', '')}/rom/${match.id}`,
        };
      }
      return { available: false };
    } catch {
      return { available: false };
    }
  }

  async triggerLibraryScan(): Promise<void> {
    try {
      await this.axios.put('/tasks/scan');
    } catch (e) {
      logger.warn('ROMM scan trigger failed', {
        label: 'romm',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * Get a page of games from ROMM.
   */
  async getGamesPage(
    page = 1,
    pageSize = 100
  ): Promise<{ games: RommGame[]; hasMore: boolean }> {
    try {
      const response = await this.axios.get('/roms', {
        params: { limit: pageSize, offset: (page - 1) * pageSize },
      });
      const games: RommGame[] = response.data ?? [];
      return { games, hasMore: games.length === pageSize };
    } catch (e) {
      logger.error('ROMM get games page failed', {
        label: 'romm',
        page,
        error: e instanceof Error ? e.message : String(e),
      });
      return { games: [], hasMore: false };
    }
  }

  /**
   * Get platforms from ROMM.
   */
  async getPlatforms(): Promise<
    Array<{ id: number; name: string; igdb_id?: number }>
  > {
    try {
      const response = await this.axios.get('/platforms');
      return response.data ?? [];
    } catch {
      return [];
    }
  }
}

export default RommAdapter;

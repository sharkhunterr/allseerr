import logger from '@server/logger';
import axios from 'axios';

interface IgdbConfig {
  clientId: string;
  clientSecret: string;
}

interface TwitchToken {
  accessToken: string;
  expiresAt: number;
}

export interface IgdbGameResult {
  id: number;
  name: string;
  platforms?: Array<{ id: number; name: string; abbreviation?: string }>;
  first_release_date?: number;
  involved_companies?: Array<{
    company: { name: string };
    developer: boolean;
    publisher: boolean;
  }>;
  genres?: Array<{ name: string }>;
  total_rating?: number;
  cover?: { url: string };
  summary?: string;
}

/**
 * IGDB API client. Requires Twitch Developer API credentials.
 * Uses client_credentials OAuth2 grant for authentication.
 */
class IgdbAPI {
  private config: IgdbConfig;
  private token?: TwitchToken;

  constructor(config: IgdbConfig) {
    this.config = config;
  }

  private async authenticate(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60000) {
      return this.token.accessToken;
    }

    try {
      const response = await axios.post(
        'https://id.twitch.tv/oauth2/token',
        null,
        {
          params: {
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            grant_type: 'client_credentials',
          },
        }
      );

      this.token = {
        accessToken: response.data.access_token,
        expiresAt: Date.now() + response.data.expires_in * 1000,
      };

      return this.token.accessToken;
    } catch (e) {
      logger.error('IGDB/Twitch authentication failed', {
        label: 'igdb',
        error: e instanceof Error ? e.message : String(e),
      });
      throw new Error('IGDB authentication failed. Check Twitch API credentials.');
    }
  }

  private async query(
    endpoint: string,
    body: string
  ): Promise<IgdbGameResult[]> {
    const token = await this.authenticate();

    const response = await axios.post(
      `https://api.igdb.com/v4/${endpoint}`,
      body,
      {
        headers: {
          'Client-ID': this.config.clientId,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
        },
        timeout: 10000,
      }
    );

    return response.data;
  }

  async searchGames(
    title: string,
    platformId?: number,
    limit = 20
  ): Promise<IgdbGameResult[]> {
    let body = `search "${title.replace(/"/g, '\\"')}";
fields name,platforms.name,platforms.abbreviation,first_release_date,
  involved_companies.company.name,involved_companies.developer,
  involved_companies.publisher,genres.name,total_rating,cover.url,summary;
limit ${limit};`;

    if (platformId) {
      body += `\nwhere platforms = (${platformId});`;
    }

    try {
      return await this.query('games', body);
    } catch (e) {
      logger.error('IGDB search failed', {
        label: 'igdb',
        title,
        error: e instanceof Error ? e.message : String(e),
      });
      throw new Error('Game search failed. Please try again.');
    }
  }

  async getGame(igdbId: number): Promise<IgdbGameResult | null> {
    try {
      const results = await this.query(
        'games',
        `fields name,platforms.name,platforms.abbreviation,first_release_date,
  involved_companies.company.name,involved_companies.developer,
  involved_companies.publisher,genres.name,total_rating,cover.url,summary;
where id = ${igdbId};`
      );
      return results[0] ?? null;
    } catch {
      return null;
    }
  }

  async getPlatforms(): Promise<Array<{ id: number; name: string; abbreviation?: string }>> {
    try {
      const results = await this.query(
        'platforms',
        'fields name,abbreviation; limit 500; sort name asc;'
      );
      return results as unknown as Array<{ id: number; name: string; abbreviation?: string }>;
    } catch {
      return [];
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate();
      const platforms = await this.getPlatforms();
      return {
        success: true,
        message: `Connected to IGDB. ${platforms.length} platforms available.`,
      };
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : 'IGDB connection failed.',
      };
    }
  }
}

export default IgdbAPI;

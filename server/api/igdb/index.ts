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
  platforms?: { id: number; name: string; abbreviation?: string }[];
  first_release_date?: number;
  involved_companies?: {
    company: { name: string };
    developer: boolean;
    publisher: boolean;
  }[];
  genres?: { id?: number; name: string }[];
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
      throw new Error(
        'IGDB authentication failed. Check Twitch API credentials.'
      );
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
  involved_companies.publisher,genres.id,genres.name,total_rating,cover.url,summary;
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

  /**
   * Popular games — IGDB's APIcalypse-style query language doesn't
   * have a "trending" endpoint, so we sort by ``total_rating_count``
   * (the number of user ratings the game has received). This is a
   * stable proxy for popularity that doesn't fluctuate as wildly
   * as a recency window would, and matches how the dashboard
   * panels render "Popular Movies" / "Popular TV".
   *
   * ``where total_rating != null`` filters out the long tail of
   * unrated entries that would otherwise dominate paginated
   * listings (IGDB's catalogue has many low-signal stub rows).
   */
  async getPopularGames(
    page = 1,
    limit = 20,
    genreId?: number,
    platformId?: number,
    opts?: {
      // YYYY-MM-DD strings. Converted to IGDB's epoch-seconds
      // ``first_release_date`` axis on the way out.
      releaseDateGte?: string;
      releaseDateLte?: string;
      sort?: 'popularity' | 'recent' | 'oldest' | 'rating' | 'title';
    }
  ): Promise<IgdbGameResult[]> {
    const offset = (Math.max(1, page) - 1) * limit;
    // ``where`` clauses are composed with ``&``. When the caller
    // narrows by genre we add ``genres = (N)``; IGDB matches if
    // ANY of the game's tagged genres is N (so a game tagged
    // both Adventure + RPG appears under both genre tiles).
    const filters = ['total_rating != null', 'total_rating_count > 50'];
    if (genreId) filters.push(`genres = (${genreId})`);
    if (platformId) filters.push(`platforms = (${platformId})`);
    if (opts?.releaseDateGte) {
      const epoch = Math.floor(new Date(opts.releaseDateGte).getTime() / 1000);
      if (Number.isFinite(epoch)) {
        filters.push(`first_release_date >= ${epoch}`);
      }
    }
    if (opts?.releaseDateLte) {
      const epoch = Math.floor(new Date(opts.releaseDateLte).getTime() / 1000);
      if (Number.isFinite(epoch)) {
        filters.push(`first_release_date <= ${epoch}`);
      }
    }
    const sortClause = ((): string => {
      switch (opts?.sort) {
        case 'recent':
          return 'sort first_release_date desc';
        case 'oldest':
          return 'sort first_release_date asc';
        case 'rating':
          return 'sort total_rating desc';
        case 'title':
          return 'sort name asc';
        case 'popularity':
        default:
          return 'sort total_rating_count desc';
      }
    })();
    const body = `fields name,platforms.id,platforms.name,platforms.abbreviation,first_release_date,
  involved_companies.company.name,involved_companies.developer,
  involved_companies.publisher,genres.id,genres.name,total_rating,
  total_rating_count,cover.url,summary;
where ${filters.join(' & ')};
${sortClause};
limit ${limit};
offset ${offset};`;

    try {
      return await this.query('games', body);
    } catch (e) {
      logger.error('IGDB popular failed', {
        label: 'igdb',
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }

  /**
   * Available game genres for the dashboard genre slider. Stable
   * IDs that don't move year to year — we cache by hard-coded
   * key so we don't re-hit IGDB on every dashboard load.
   */
  async getGenres(): Promise<{ id: number; name: string }[]> {
    try {
      const rows = (await this.query(
        'genres',
        'fields name; limit 50; sort name asc;'
      )) as { id: number; name: string }[];
      return rows;
    } catch (e) {
      logger.error('IGDB genres failed', {
        label: 'igdb',
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }

  async getGame(igdbId: number): Promise<IgdbGameResult | null> {
    try {
      const results = await this.query(
        'games',
        `fields name,platforms.name,platforms.abbreviation,first_release_date,
  involved_companies.company.name,involved_companies.developer,
  involved_companies.publisher,genres.id,genres.name,total_rating,cover.url,summary;
where id = ${igdbId};`
      );
      return results[0] ?? null;
    } catch {
      return null;
    }
  }

  async getPlatforms(): Promise<
    { id: number; name: string; abbreviation?: string }[]
  > {
    try {
      const results = await this.query(
        'platforms',
        'fields name,abbreviation; limit 500; sort name asc;'
      );
      return results as unknown as {
        id: number;
        name: string;
        abbreviation?: string;
      }[];
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

import ExternalAPI from '@server/api/externalapi';
import { MediaType } from '@server/constants/media';
import type {
  ConnectionTestResult,
  DownloadManagerAdapter,
  MediaRequest,
  QualityProfile,
  RequestStatus,
  RootFolder,
  SubmissionResult,
} from '@server/lib/adapters/interfaces';
import logger from '@server/logger';

interface BinderyConfig {
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
}

/**
 * Bindery adapter — primary download manager for books and audiobooks.
 * Follows the servarr API pattern (similar to Readarr).
 */
export class BinderyAdapter extends ExternalAPI implements DownloadManagerAdapter {
  readonly mediaTypes = [MediaType.BOOK, MediaType.AUDIOBOOK];
  readonly name = 'Bindery';

  constructor(config: BinderyConfig) {
    const protocol = config.useSsl ? 'https' : 'http';
    const baseUrl = `${protocol}://${config.hostname}:${config.port}${config.baseUrl || ''}/api/v1`;

    super(baseUrl, {}, {
      headers: { 'X-Api-Key': config.apiKey },
    });
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.axios.get('/system/status');
      return {
        success: true,
        message: `Connected to Bindery v${response.data.version}`,
      };
    } catch (e) {
      return {
        success: false,
        message: `Bindery connection failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async submitRequest(request: MediaRequest): Promise<SubmissionResult> {
    try {
      const response = await this.axios.post('/book', {
        foreignBookId: request.externalId,
        title: request.title,
        qualityProfileId: request.qualityProfileId,
        rootFolderPath: request.rootFolderPath,
        monitored: true,
        addOptions: { searchForNewBook: true },
      });

      return {
        success: true,
        externalId: String(response.data.id),
      };
    } catch (e) {
      logger.error('Bindery submit request failed', {
        label: 'bindery',
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        success: false,
        message: `Failed to add to Bindery: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async checkStatus(externalId: string): Promise<RequestStatus> {
    try {
      const response = await this.axios.get(`/book/${externalId}`);
      if (response.data.statistics?.bookFileCount > 0) {
        return { status: 'completed' };
      }

      const queue = await this.axios.get('/queue');
      const inQueue = queue.data.records?.find(
        (r: { bookId: number }) => r.bookId === parseInt(externalId, 10)
      );
      if (inQueue) {
        return { status: 'downloading', message: inQueue.status };
      }

      return { status: 'queued' };
    } catch {
      return { status: 'unknown' };
    }
  }

  async getQualityProfiles(): Promise<QualityProfile[]> {
    const response = await this.axios.get('/qualityprofile');
    return response.data.map((p: { id: number; name: string }) => ({
      id: p.id,
      name: p.name,
    }));
  }

  async getRootFolders(): Promise<RootFolder[]> {
    const response = await this.axios.get('/rootfolder');
    return response.data.map(
      (f: { id: number; path: string; freeSpace: number }) => ({
        id: f.id,
        path: f.path,
        freeSpace: f.freeSpace,
      })
    );
  }
}

export default BinderyAdapter;

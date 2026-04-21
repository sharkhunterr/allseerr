import GoogleBooksAPI from '@server/api/googlebooks';
import HardcoverAPI from '@server/api/hardcover';
import { getRepository } from '@server/datasource';
import {
  DownloadManagerInstance,
  DownloadManagerType,
} from '@server/entity/DownloadManagerInstance';
import {
  LibraryServerInstance,
  LibraryServerType,
} from '@server/entity/LibraryServerInstance';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const bookSettingsRoutes = Router();

// ===== Metadata Providers =====

bookSettingsRoutes.get('/metadata-providers', (_req, res) => {
  const settings = getSettings();
  return res.status(200).json(settings.book.metadataProviders);
});

bookSettingsRoutes.put('/metadata-providers', async (req, res) => {
  const settings = getSettings();
  const body = req.body as Partial<typeof settings.book.metadataProviders>;

  settings.book = {
    ...settings.book,
    metadataProviders: {
      ...settings.book.metadataProviders,
      ...(typeof body.bindery === 'boolean' ? { bindery: body.bindery } : {}),
      ...(typeof body.bookshelf === 'boolean'
        ? { bookshelf: body.bookshelf }
        : {}),
      ...(typeof body.googleBooks === 'boolean'
        ? { googleBooks: body.googleBooks }
        : {}),
      ...(typeof body.googleBooksApiKey === 'string'
        ? { googleBooksApiKey: body.googleBooksApiKey }
        : {}),
      ...(typeof body.hardcover === 'boolean'
        ? { hardcover: body.hardcover }
        : {}),
      ...(typeof body.hardcoverApiKey === 'string'
        ? { hardcoverApiKey: body.hardcoverApiKey }
        : {}),
      ...(typeof body.preferredLanguage === 'string'
        ? { preferredLanguage: body.preferredLanguage.trim().toLowerCase() }
        : {}),
      ...(body.languagePolicy === 'prefer' ||
      body.languagePolicy === 'strict'
        ? { languagePolicy: body.languagePolicy }
        : {}),
      ...(body.primarySource === 'openlibrary' ||
      body.primarySource === 'hardcover'
        ? { primarySource: body.primarySource }
        : {}),
    },
  };
  await settings.save();
  return res.status(200).json(settings.book.metadataProviders);
});

/**
 * Test a metadata provider's credentials without saving. Called from the
 * settings UI "Test" button. Body: { provider: 'hardcover' | 'googleBooks',
 * apiKey?: string }. For hardcover the key is required; for googleBooks
 * the key is optional (unauthenticated calls also work, just rate-limited).
 */
bookSettingsRoutes.post('/metadata-providers/test', async (req, res) => {
  const body = req.body as {
    provider?: 'hardcover' | 'googleBooks';
    apiKey?: string;
  };

  if (!body.provider) {
    return res
      .status(400)
      .json({ success: false, message: 'provider is required' });
  }

  try {
    if (body.provider === 'hardcover') {
      if (!body.apiKey) {
        return res.status(400).json({
          success: false,
          message: 'Hardcover requires an API token',
        });
      }
      const hc = new HardcoverAPI(body.apiKey);
      const result = await hc.testConnection();
      return res.status(200).json(result);
    }

    if (body.provider === 'googleBooks') {
      const gb = new GoogleBooksAPI(body.apiKey);
      const { results, totalResults } = await gb.search('test', 1, 1);
      return res.status(200).json({
        success: true,
        message: `Google Books reachable (${totalResults} results for "test"${
          results[0] ? `, first: "${results[0].title}"` : ''
        })`,
      });
    }

    return res
      .status(400)
      .json({ success: false, message: `Unknown provider: ${body.provider}` });
  } catch (e) {
    logger.error('Metadata provider test failed', {
      label: 'book-settings',
      provider: body.provider,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(200).json({
      success: false,
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

// ===== Download Manager Instance Routes =====

bookSettingsRoutes.get('/download-managers', async (_req, res) => {
  const repo = getRepository(DownloadManagerInstance);
  const instances = await repo.find();
  return res.status(200).json(instances);
});

bookSettingsRoutes.post('/download-managers', async (req, res) => {
  const repo = getRepository(DownloadManagerInstance);
  const body = req.body as Partial<DownloadManagerInstance>;

  if (!body.name || !body.hostname || !body.apiKey || !body.serviceType) {
    return res.status(400).json({
      status: 400,
      message: 'Name, hostname, API key, and service type are required.',
    });
  }

  if (
    !Object.values(DownloadManagerType).includes(
      body.serviceType as DownloadManagerType
    )
  ) {
    return res.status(400).json({
      status: 400,
      message: `Invalid service type. Must be one of: ${Object.values(DownloadManagerType).join(', ')}`,
    });
  }

  const instance = repo.create(body);
  await repo.save(instance);

  logger.info(`Download manager instance created: ${instance.name}`, {
    label: 'book-settings',
  });

  return res.status(201).json(instance);
});

bookSettingsRoutes.put('/download-managers/:id', async (req, res) => {
  const repo = getRepository(DownloadManagerInstance);
  const instance = await repo.findOne({
    where: { id: parseInt(req.params.id, 10) },
  });

  if (!instance) {
    return res.status(404).json({ status: 404, message: 'Instance not found.' });
  }

  Object.assign(instance, req.body);
  await repo.save(instance);

  return res.status(200).json(instance);
});

bookSettingsRoutes.delete('/download-managers/:id', async (req, res) => {
  const repo = getRepository(DownloadManagerInstance);
  const instance = await repo.findOne({
    where: { id: parseInt(req.params.id, 10) },
  });

  if (!instance) {
    return res.status(404).json({ status: 404, message: 'Instance not found.' });
  }

  await repo.remove(instance);

  logger.info(`Download manager instance removed: ${instance.name}`, {
    label: 'book-settings',
  });

  return res.status(204).send();
});

bookSettingsRoutes.post('/download-managers/test', async (req, res) => {
  const body = req.body as {
    serviceType: string;
    hostname: string;
    port: number;
    apiKey: string;
    useSsl: boolean;
    baseUrl?: string;
  };

  if (!body.hostname || !body.apiKey || !body.serviceType) {
    return res.status(400).json({
      status: 400,
      message: 'Hostname, API key, and service type are required for testing.',
    });
  }

  // TODO: Instantiate adapter by type and call testConnection()
  // For now, return a placeholder success
  return res.status(200).json({
    success: true,
    message: `Connection test for ${body.serviceType} at ${body.hostname}:${body.port} — adapter not yet implemented.`,
  });
});

// ===== Library Server Instance Routes =====

bookSettingsRoutes.get('/library-servers', async (_req, res) => {
  const repo = getRepository(LibraryServerInstance);
  const instances = await repo.find();
  return res.status(200).json(instances);
});

bookSettingsRoutes.post('/library-servers', async (req, res) => {
  const repo = getRepository(LibraryServerInstance);
  const body = req.body as Partial<LibraryServerInstance>;

  if (!body.name || !body.hostname || !body.serviceType) {
    return res.status(400).json({
      status: 400,
      message: 'Name, hostname, and service type are required.',
    });
  }

  if (
    !Object.values(LibraryServerType).includes(
      body.serviceType as LibraryServerType
    )
  ) {
    return res.status(400).json({
      status: 400,
      message: `Invalid service type. Must be one of: ${Object.values(LibraryServerType).join(', ')}`,
    });
  }

  if (body.scanIntervalSeconds && body.scanIntervalSeconds < 30) {
    return res.status(400).json({
      status: 400,
      message: 'Scan interval must be at least 30 seconds.',
    });
  }

  const instance = repo.create(body);
  await repo.save(instance);

  logger.info(`Library server instance created: ${instance.name}`, {
    label: 'book-settings',
  });

  return res.status(201).json(instance);
});

bookSettingsRoutes.put('/library-servers/:id', async (req, res) => {
  const repo = getRepository(LibraryServerInstance);
  const instance = await repo.findOne({
    where: { id: parseInt(req.params.id, 10) },
  });

  if (!instance) {
    return res.status(404).json({ status: 404, message: 'Instance not found.' });
  }

  const body = req.body as Partial<LibraryServerInstance>;

  if (body.scanIntervalSeconds && body.scanIntervalSeconds < 30) {
    return res.status(400).json({
      status: 400,
      message: 'Scan interval must be at least 30 seconds.',
    });
  }

  Object.assign(instance, body);
  await repo.save(instance);

  return res.status(200).json(instance);
});

bookSettingsRoutes.delete('/library-servers/:id', async (req, res) => {
  const repo = getRepository(LibraryServerInstance);
  const instance = await repo.findOne({
    where: { id: parseInt(req.params.id, 10) },
  });

  if (!instance) {
    return res.status(404).json({ status: 404, message: 'Instance not found.' });
  }

  await repo.remove(instance);

  logger.info(`Library server instance removed: ${instance.name}`, {
    label: 'book-settings',
  });

  return res.status(204).send();
});

bookSettingsRoutes.post('/library-servers/test', async (req, res) => {
  const body = req.body as {
    serviceType: string;
    hostname: string;
    port: number;
    apiKey?: string;
    useSsl: boolean;
    baseUrl?: string;
  };

  if (!body.hostname || !body.serviceType) {
    return res.status(400).json({
      status: 400,
      message: 'Hostname and service type are required for testing.',
    });
  }

  // TODO: Instantiate adapter by type and call testConnection()
  return res.status(200).json({
    success: true,
    message: `Connection test for ${body.serviceType} at ${body.hostname}:${body.port} — adapter not yet implemented.`,
  });
});

bookSettingsRoutes.post('/library-servers/:id/scan', async (req, res) => {
  const repo = getRepository(LibraryServerInstance);
  const instance = await repo.findOne({
    where: { id: parseInt(req.params.id, 10) },
  });

  if (!instance) {
    return res.status(404).json({ status: 404, message: 'Instance not found.' });
  }

  // TODO: Trigger BookAvailabilityScanner for this specific instance
  logger.info(`Manual scan triggered for library server: ${instance.name}`, {
    label: 'book-settings',
  });

  return res.status(202).json({
    message: `Scan triggered for ${instance.name}.`,
  });
});

export default bookSettingsRoutes;

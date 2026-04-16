import { getRepository } from '@server/datasource';
import {
  DownloadManagerInstance,
  DownloadManagerType,
} from '@server/entity/DownloadManagerInstance';
import {
  LibraryServerInstance,
  LibraryServerType,
} from '@server/entity/LibraryServerInstance';
import logger from '@server/logger';
import { Router } from 'express';

const bookSettingsRoutes = Router();

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

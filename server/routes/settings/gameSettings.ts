import IgdbAPI from '@server/api/igdb';
import { RommAdapter } from '@server/lib/adapters/game/RommAdapter';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const gameSettingsRoutes = Router();

gameSettingsRoutes.get('/', (_req, res) => {
  const settings = getSettings();

  return res.status(200).json({
    igdb: {
      clientId: settings.game.igdb.clientId,
      clientSecret: '',
      clientSecretSet: !!settings.game.igdb.clientSecret,
    },
    romm: {
      url: settings.game.romm.url,
      publicUrl: settings.game.romm.publicUrl,
      apiKey: settings.game.romm.apiKey,
      username: settings.game.romm.username,
      password: '',
      pollIntervalMinutes: settings.game.romm.pollIntervalMinutes,
      enabled: settings.game.romm.enabled,
    },
  });
});

gameSettingsRoutes.put('/', async (req, res) => {
  const settings = getSettings();

  const { igdb, romm } = req.body;

  if (igdb) {
    settings.game = {
      ...settings.game,
      igdb: {
        clientId: igdb.clientId ?? settings.game.igdb.clientId,
        clientSecret: igdb.clientSecret || settings.game.igdb.clientSecret,
      },
    };
  }

  if (romm) {
    settings.game = {
      ...settings.game,
      romm: {
        url: romm.url ?? settings.game.romm.url,
        publicUrl: romm.publicUrl ?? settings.game.romm.publicUrl,
        apiKey: romm.apiKey ?? settings.game.romm.apiKey,
        username: romm.username ?? settings.game.romm.username,
        password: romm.password || settings.game.romm.password,
        pollIntervalMinutes:
          romm.pollIntervalMinutes ?? settings.game.romm.pollIntervalMinutes,
        enabled: romm.enabled ?? settings.game.romm.enabled,
      },
    };
  }

  await settings.save();

  return res.status(200).json({
    igdb: {
      clientId: settings.game.igdb.clientId,
      clientSecret: '',
      clientSecretSet: !!settings.game.igdb.clientSecret,
    },
    romm: {
      url: settings.game.romm.url,
      publicUrl: settings.game.romm.publicUrl,
      apiKey: settings.game.romm.apiKey,
      username: settings.game.romm.username,
      password: '',
      pollIntervalMinutes: settings.game.romm.pollIntervalMinutes,
      enabled: settings.game.romm.enabled,
    },
  });
});

gameSettingsRoutes.post('/igdb/test', async (req, res) => {
  const settings = getSettings();
  const { clientId, clientSecret } = req.body;

  const igdb = new IgdbAPI({
    clientId: clientId || settings.game.igdb.clientId,
    clientSecret: clientSecret || settings.game.igdb.clientSecret,
  });

  const result = await igdb.testConnection();

  return res.status(200).json(result);
});

gameSettingsRoutes.post('/romm/test', async (req, res) => {
  const settings = getSettings();
  const { url, apiKey } = req.body;

  try {
    const rommUrl = new URL(url || settings.game.romm.url);
    const adapter = new RommAdapter({
      hostname: rommUrl.hostname,
      port:
        parseInt(rommUrl.port) || (rommUrl.protocol === 'https:' ? 443 : 80),
      apiKey: apiKey || settings.game.romm.apiKey,
      useSsl: rommUrl.protocol === 'https:',
    });

    const result = await adapter.testConnection();
    return res.status(200).json(result);
  } catch (e) {
    logger.error('ROMM test connection failed', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return res.status(200).json({
      success: false,
      message: e instanceof Error ? e.message : 'Invalid ROMM URL',
    });
  }
});

gameSettingsRoutes.post('/romm/scan', async (_req, res) => {
  try {
    const { rommScanner } = await import('@server/lib/scanners/romm');
    rommScanner.run();
    return res.status(200).json({ success: true, message: 'Scan triggered.' });
  } catch (e) {
    logger.error('ROMM scan failed', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      success: false,
      message: e instanceof Error ? e.message : 'Scan failed',
    });
  }
});

export default gameSettingsRoutes;

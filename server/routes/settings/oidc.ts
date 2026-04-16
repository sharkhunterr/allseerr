import { OidcAdapter } from '@server/lib/adapters/oidc/OidcAdapter';
import { getSettings } from '@server/lib/settings';
import type { OidcSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const oidcRoutes = Router();

/**
 * GET /api/v1/settings/oidc
 * Returns the OIDC configuration with the client secret redacted.
 */
oidcRoutes.get('/', (_req, res) => {
  const settings = getSettings();
  const oidc = settings.oidc;

  return res.status(200).json({
    ...oidc,
    clientSecret: undefined,
    clientSecretSet: !!oidc.clientSecret,
  });
});

/**
 * PUT /api/v1/settings/oidc
 * Updates the OIDC configuration. Validates required fields when enabled.
 * Disabling OIDC does not delete or modify any user accounts.
 */
oidcRoutes.put('/', async (req, res) => {
  const settings = getSettings();
  const body = req.body as Partial<OidcSettings>;

  // Validate when enabling
  if (body.enabled) {
    if (!body.issuerUrl && !settings.oidc.issuerUrl) {
      return res.status(400).json({
        status: 400,
        message: 'Issuer URL is required when OIDC is enabled.',
      });
    }
    if (!body.clientId && !settings.oidc.clientId) {
      return res.status(400).json({
        status: 400,
        message: 'Client ID is required when OIDC is enabled.',
      });
    }

    const issuerUrl = body.issuerUrl ?? settings.oidc.issuerUrl;
    if (
      !issuerUrl.startsWith('http://') &&
      !issuerUrl.startsWith('https://')
    ) {
      return res.status(400).json({
        status: 400,
        message: 'Issuer URL must start with http:// or https://',
      });
    }
  }

  // Validate group mappings
  if (body.groupMappings) {
    for (const mapping of body.groupMappings) {
      if (!mapping.oidcGroup || mapping.oidcGroup.trim() === '') {
        return res.status(400).json({
          status: 400,
          message: 'Each group mapping must have a non-empty group name.',
        });
      }
      if (
        typeof mapping.permissions !== 'number' ||
        !Number.isInteger(mapping.permissions)
      ) {
        return res.status(400).json({
          status: 400,
          message: 'Each group mapping must have a valid integer permissions value.',
        });
      }
    }
  }

  // Preserve existing secret if not provided in the update
  if (!body.clientSecret) {
    body.clientSecret = settings.oidc.clientSecret;
  }

  settings.oidc = body as OidcSettings;
  await settings.save();

  logger.info('OIDC settings updated', {
    label: 'oidc',
    enabled: settings.oidc.enabled,
  });

  return res.status(200).json({
    ...settings.oidc,
    clientSecret: undefined,
    clientSecretSet: !!settings.oidc.clientSecret,
  });
});

/**
 * POST /api/v1/settings/oidc/test
 * Tests the OIDC configuration without saving it.
 */
oidcRoutes.post('/test', async (req, res) => {
  const settings = getSettings();
  const body = req.body as {
    issuerUrl: string;
    clientId: string;
    clientSecret?: string;
  };

  if (!body.issuerUrl || !body.clientId) {
    return res.status(400).json({
      status: 400,
      message: 'Issuer URL and Client ID are required for testing.',
    });
  }

  // Use existing secret if not provided (re-testing without changing secret)
  const clientSecret = body.clientSecret || settings.oidc.clientSecret;

  const result = await OidcAdapter.testConnection({
    issuerUrl: body.issuerUrl,
    clientId: body.clientId,
    clientSecret,
  });

  if (result.status === 'success') {
    return res.status(200).json(result);
  } else {
    return res.status(400).json(result);
  }
});

export default oidcRoutes;

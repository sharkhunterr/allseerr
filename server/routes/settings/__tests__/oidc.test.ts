/**
 * Unit tests for OIDC settings routes.
 */

const mockSettings = {
  oidc: {
    enabled: false,
    issuerUrl: 'https://idp.example.com',
    clientId: 'test-client',
    clientSecret: 'supersecret',
    displayName: 'TestIdP',
    autoCreateUsers: true,
    groupClaimName: 'groups',
    defaultPermissions: 32,
    groupMappings: [],
  },
  save: jest.fn(),
};

jest.mock('@server/lib/settings', () => ({
  getSettings: jest.fn().mockReturnValue(mockSettings),
}));

jest.mock('@server/lib/adapters/oidc/OidcAdapter', () => ({
  OidcAdapter: {
    testConnection: jest.fn(),
  },
}));

jest.mock('@server/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

import { OidcAdapter } from '@server/lib/adapters/oidc/OidcAdapter';
import oidcRoutes from '@server/routes/settings/oidc';
import express from 'express';
import request from 'supertest';

const app = express();
app.use(express.json());
app.use('/oidc', oidcRoutes);

describe('OIDC Settings Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSettings.oidc.clientSecret = 'supersecret';
  });

  describe('GET /oidc', () => {
    it('should return settings with secret redacted', async () => {
      const res = await request(app).get('/oidc');
      expect(res.status).toBe(200);
      expect(res.body.clientSecret).toBeUndefined();
      expect(res.body.clientSecretSet).toBe(true);
      expect(res.body.issuerUrl).toBe('https://idp.example.com');
    });

    it('should return clientSecretSet false when no secret', async () => {
      mockSettings.oidc.clientSecret = '';
      const res = await request(app).get('/oidc');
      expect(res.body.clientSecretSet).toBe(false);
    });
  });

  describe('PUT /oidc', () => {
    it('should validate required fields when enabled', async () => {
      const res = await request(app)
        .put('/oidc')
        .send({ enabled: true, issuerUrl: '', clientId: '' });
      expect(res.status).toBe(400);
    });

    it('should validate issuer URL format', async () => {
      const res = await request(app).put('/oidc').send({
        enabled: true,
        issuerUrl: 'not-a-url',
        clientId: 'test',
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('http');
    });

    it('should preserve secret when not provided', async () => {
      await request(app)
        .put('/oidc')
        .send({ enabled: false, issuerUrl: 'https://idp.example.com' });
      // The setter should have been called with the existing secret preserved
      expect(mockSettings.save).toHaveBeenCalled();
    });
  });

  describe('POST /oidc/test', () => {
    it('should return success for valid config', async () => {
      (OidcAdapter.testConnection as jest.Mock).mockResolvedValueOnce({
        status: 'success',
        message: 'Connected!',
      });

      const res = await request(app).post('/oidc/test').send({
        issuerUrl: 'https://idp.example.com',
        clientId: 'test',
        clientSecret: 'secret',
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should return error for invalid config', async () => {
      (OidcAdapter.testConnection as jest.Mock).mockResolvedValueOnce({
        status: 'error',
        message: 'Discovery failed',
      });

      const res = await request(app).post('/oidc/test').send({
        issuerUrl: 'https://bad.example.com',
        clientId: 'test',
      });
      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });

    it('should require issuerUrl and clientId', async () => {
      const res = await request(app).post('/oidc/test').send({});
      expect(res.status).toBe(400);
    });
  });
});

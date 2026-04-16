import { OidcAdapter } from '../OidcAdapter';

// Mock openid-client
jest.mock('openid-client', () => {
  const mockClient = {
    authorizationUrl: jest.fn().mockReturnValue('https://idp.example.com/authorize?state=abc'),
    callback: jest.fn(),
    userinfo: jest.fn(),
  };

  const mockIssuer = {
    metadata: {
      issuer: 'https://idp.example.com',
      authorization_endpoint: 'https://idp.example.com/authorize',
      token_endpoint: 'https://idp.example.com/token',
      jwks_uri: 'https://idp.example.com/jwks',
    },
    Client: jest.fn().mockImplementation(() => mockClient),
  };

  return {
    Issuer: {
      discover: jest.fn().mockResolvedValue(mockIssuer),
    },
    __mockClient: mockClient,
    __mockIssuer: mockIssuer,
  };
});

jest.mock('@server/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const { Issuer, __mockClient: mockClient } = jest.requireMock('openid-client');

const config = {
  issuerUrl: 'https://idp.example.com',
  clientId: 'test-client',
  clientSecret: 'test-secret',
};

describe('OidcAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('discover()', () => {
    it('should discover and cache the issuer', async () => {
      const adapter = new OidcAdapter(config);
      const issuer = await adapter.discover();
      expect(issuer.metadata.issuer).toBe('https://idp.example.com');
      expect(Issuer.discover).toHaveBeenCalledWith(config.issuerUrl);

      // Second call should use cache
      await adapter.discover();
      expect(Issuer.discover).toHaveBeenCalledTimes(1);
    });

    it('should throw on unreachable URL', async () => {
      Issuer.discover.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const adapter = new OidcAdapter(config);
      await expect(adapter.discover()).rejects.toThrow('OIDC discovery failed');
    });
  });

  describe('getAuthorizationUrl()', () => {
    it('should return a valid authorization URL', async () => {
      const adapter = new OidcAdapter(config);
      const url = await adapter.getAuthorizationUrl(
        'https://app.example.com/callback',
        'state123',
        'nonce456'
      );
      expect(url).toBe('https://idp.example.com/authorize?state=abc');
      expect(mockClient.authorizationUrl).toHaveBeenCalledWith({
        redirect_uri: 'https://app.example.com/callback',
        scope: 'openid email profile',
        state: 'state123',
        nonce: 'nonce456',
        response_type: 'code',
      });
    });
  });

  describe('handleCallback()', () => {
    it('should return correct OidcAuthResult with all claims', async () => {
      mockClient.callback.mockResolvedValueOnce({
        claims: () => ({
          sub: 'user-123',
          email: 'user@example.com',
          name: 'Test User',
          picture: 'https://example.com/avatar.jpg',
          groups: ['admin', 'users'],
          exp: 1700000000,
        }),
      });

      const adapter = new OidcAdapter(config);
      const result = await adapter.handleCallback(
        'https://app.example.com/callback',
        { code: 'auth-code', state: 'state123' },
        { state: 'state123', nonce: 'nonce456' },
        'groups'
      );

      expect(result.sub).toBe('user-123');
      expect(result.email).toBe('user@example.com');
      expect(result.name).toBe('Test User');
      expect(result.picture).toBe('https://example.com/avatar.jpg');
      expect(result.groups).toEqual(['admin', 'users']);
      expect(result.idTokenExpiry).toBe(1700000000);
    });

    it('should throw on missing email claim', async () => {
      mockClient.callback.mockResolvedValueOnce({
        claims: () => ({ sub: 'user-123' }),
      });

      const adapter = new OidcAdapter(config);
      await expect(
        adapter.handleCallback(
          'https://app.example.com/callback',
          { code: 'auth-code', state: 'state123' },
          { state: 'state123', nonce: 'nonce456' },
          'groups'
        )
      ).rejects.toThrow('email claim');
    });

    it('should extract groups from ID token', async () => {
      mockClient.callback.mockResolvedValueOnce({
        claims: () => ({
          sub: 'user-123',
          email: 'user@example.com',
          groups: ['editors'],
          exp: 1700000000,
        }),
      });

      const adapter = new OidcAdapter(config);
      const result = await adapter.handleCallback(
        'https://app.example.com/callback',
        { code: 'auth-code', state: 's' },
        { state: 's', nonce: 'n' },
        'groups'
      );
      expect(result.groups).toEqual(['editors']);
    });

    it('should fallback to userinfo for groups', async () => {
      mockClient.callback.mockResolvedValueOnce({
        claims: () => ({
          sub: 'user-123',
          email: 'user@example.com',
          exp: 1700000000,
        }),
      });
      mockClient.userinfo.mockResolvedValueOnce({
        groups: ['from-userinfo'],
      });

      const adapter = new OidcAdapter(config);
      const result = await adapter.handleCallback(
        'https://app.example.com/callback',
        { code: 'auth-code', state: 's' },
        { state: 's', nonce: 'n' },
        'groups'
      );
      expect(result.groups).toEqual(['from-userinfo']);
    });

    it('should wrap single string group in array', async () => {
      mockClient.callback.mockResolvedValueOnce({
        claims: () => ({
          sub: 'user-123',
          email: 'user@example.com',
          groups: 'single-group',
          exp: 1700000000,
        }),
      });

      const adapter = new OidcAdapter(config);
      const result = await adapter.handleCallback(
        'https://app.example.com/callback',
        { code: 'auth-code', state: 's' },
        { state: 's', nonce: 'n' },
        'groups'
      );
      expect(result.groups).toEqual(['single-group']);
    });
  });

  describe('testConnection()', () => {
    it('should return success for valid config', async () => {
      const result = await OidcAdapter.testConnection(config);
      expect(result.status).toBe('success');
      expect(result.message).toContain('Successfully connected');
    });

    it('should return error on discovery failure', async () => {
      Issuer.discover.mockRejectedValueOnce(new Error('DNS lookup failed'));
      const result = await OidcAdapter.testConnection(config);
      expect(result.status).toBe('error');
      expect(result.code).toBe('DISCOVERY_FAILED');
    });
  });
});

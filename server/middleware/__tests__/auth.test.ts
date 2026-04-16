/**
 * Unit tests for OIDC token expiry check in checkUser middleware.
 */

jest.mock('@server/datasource', () => ({
  getRepository: jest.fn().mockReturnValue({
    findOne: jest.fn(),
  }),
}));

jest.mock('@server/lib/settings', () => ({
  getSettings: jest.fn().mockReturnValue({
    main: { apiKey: 'test-api-key', locale: 'en' },
  }),
}));

import { checkUser } from '@server/middleware/auth';

describe('checkUser middleware - OIDC token expiry', () => {
  const mockNext = jest.fn();

  const createMockReq = (session: Record<string, unknown> = {}) =>
    ({
      header: jest.fn().mockReturnValue(undefined),
      session: {
        userId: 1,
        destroy: jest.fn((cb: () => void) => cb()),
        ...session,
      },
      user: undefined,
      locale: undefined,
    }) as unknown as Parameters<typeof checkUser>[0];

  const createMockRes = () =>
    ({}) as unknown as Parameters<typeof checkUser>[1];

  beforeEach(() => {
    jest.clearAllMocks();

    const { getRepository } = jest.requireMock('@server/datasource');
    getRepository.mockReturnValue({
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        settings: { locale: 'en' },
        hasPermission: jest.fn().mockReturnValue(true),
      }),
    });
  });

  it('should not affect non-OIDC sessions (no oidcTokenExpiry)', async () => {
    const req = createMockReq({ userId: 1 });
    await checkUser(req, createMockRes(), mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.session.destroy).not.toHaveBeenCalled();
  });

  it('should proceed normally for OIDC session with future expiry', async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const req = createMockReq({ userId: 1, oidcTokenExpiry: futureExpiry });
    await checkUser(req, createMockRes(), mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.session.destroy).not.toHaveBeenCalled();
  });

  it('should destroy session for OIDC session with past expiry', async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 60;
    const req = createMockReq({ userId: 1, oidcTokenExpiry: pastExpiry });
    await checkUser(req, createMockRes(), mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.session.destroy).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });
});

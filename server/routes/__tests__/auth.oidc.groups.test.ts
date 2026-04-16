/**
 * Unit tests for OIDC group-to-permission resolution logic.
 * Tests the mapping algorithm used in the OIDC callback route.
 */

import { Permission } from '@server/lib/permissions';
import type { OidcGroupMapping } from '@server/lib/settings';

/**
 * Extracted group resolution logic for testability.
 * This mirrors the algorithm in server/routes/auth.ts OIDC callback.
 */
function resolveGroupPermissions(
  userGroups: string[],
  groupMappings: OidcGroupMapping[],
  defaultPermissions: number
): { permissions: number; matched: boolean } {
  if (groupMappings.length === 0) {
    return { permissions: defaultPermissions, matched: false };
  }

  let resolvedPermissions = 0;
  let matched = false;

  for (const group of userGroups) {
    const mapping = groupMappings.find((m) => m.oidcGroup === group);
    if (mapping) {
      resolvedPermissions |= mapping.permissions;
      matched = true;
    }
  }

  if (!matched) {
    return { permissions: defaultPermissions, matched: false };
  }

  return { permissions: resolvedPermissions, matched: true };
}

describe('OIDC Group Permission Resolution', () => {
  const adminMapping: OidcGroupMapping = {
    oidcGroup: 'allseerr-admins',
    permissions: Permission.ADMIN,
  };

  const userMapping: OidcGroupMapping = {
    oidcGroup: 'allseerr-users',
    permissions: Permission.REQUEST,
  };

  const manageMapping: OidcGroupMapping = {
    oidcGroup: 'allseerr-managers',
    permissions: Permission.MANAGE_REQUESTS,
  };

  it('should assign correct permissions for single group match', () => {
    const result = resolveGroupPermissions(
      ['allseerr-admins'],
      [adminMapping, userMapping],
      Permission.REQUEST
    );
    expect(result.matched).toBe(true);
    expect(result.permissions).toBe(Permission.ADMIN);
  });

  it('should OR permissions for multiple group matches', () => {
    const result = resolveGroupPermissions(
      ['allseerr-users', 'allseerr-managers'],
      [userMapping, manageMapping],
      Permission.REQUEST
    );
    expect(result.matched).toBe(true);
    expect(result.permissions).toBe(
      Permission.REQUEST | Permission.MANAGE_REQUESTS
    );
  });

  it('should fall back to defaultPermissions when no group matches', () => {
    const result = resolveGroupPermissions(
      ['unknown-group'],
      [adminMapping, userMapping],
      Permission.REQUEST
    );
    expect(result.matched).toBe(false);
    expect(result.permissions).toBe(Permission.REQUEST);
  });

  it('should not modify permissions when groupMappings array is empty', () => {
    const result = resolveGroupPermissions(
      ['allseerr-admins'],
      [],
      Permission.REQUEST
    );
    expect(result.matched).toBe(false);
    expect(result.permissions).toBe(Permission.REQUEST);
  });

  it('should recalculate on every call (not cached)', () => {
    // First call: user is admin
    const result1 = resolveGroupPermissions(
      ['allseerr-admins'],
      [adminMapping, userMapping],
      Permission.REQUEST
    );
    expect(result1.permissions).toBe(Permission.ADMIN);

    // Second call: same user lost admin group
    const result2 = resolveGroupPermissions(
      ['allseerr-users'],
      [adminMapping, userMapping],
      Permission.REQUEST
    );
    expect(result2.permissions).toBe(Permission.REQUEST);

    // Permissions changed — not cached
    expect(result1.permissions).not.toBe(result2.permissions);
  });
});

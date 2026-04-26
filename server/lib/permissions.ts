export enum Permission {
  NONE = 0,
  ADMIN = 2,
  MANAGE_SETTINGS = 4,
  MANAGE_USERS = 8,
  MANAGE_REQUESTS = 16,
  REQUEST = 32,
  VOTE = 64,
  AUTO_APPROVE = 128,
  AUTO_APPROVE_MOVIE = 256,
  AUTO_APPROVE_TV = 512,
  REQUEST_4K = 1024,
  REQUEST_4K_MOVIE = 2048,
  REQUEST_4K_TV = 4096,
  REQUEST_ADVANCED = 8192,
  REQUEST_VIEW = 16384,
  AUTO_APPROVE_4K = 32768,
  AUTO_APPROVE_4K_MOVIE = 65536,
  AUTO_APPROVE_4K_TV = 131072,
  REQUEST_MOVIE = 262144,
  REQUEST_TV = 524288,
  MANAGE_ISSUES = 1048576,
  VIEW_ISSUES = 2097152,
  CREATE_ISSUES = 4194304,
  AUTO_REQUEST = 8388608,
  AUTO_REQUEST_MOVIE = 16777216,
  AUTO_REQUEST_TV = 33554432,
  RECENT_VIEW = 67108864,
  WATCHLIST_VIEW = 134217728,
  MANAGE_BLOCKLIST = 268435456,
  VIEW_BLOCKLIST = 1073741824,
  REQUEST_BOOK = 536870912,
  REQUEST_AUDIOBOOK = 2147483648,
  // Bits 32+ require BigInt-backed checks — `hasPermission` below
  // converts the operands internally so these values behave exactly
  // like the lower bits for the caller. Enum entries stay as number
  // since the values fit well within Number.MAX_SAFE_INTEGER (2^53).
  REQUEST_GAME = 4294967296,
  AUTO_APPROVE_BOOK = 8589934592,
  AUTO_APPROVE_AUDIOBOOK = 17179869184,
  AUTO_APPROVE_GAME = 34359738368,
  REQUEST_MANGA = 68719476736,
  AUTO_APPROVE_MANGA = 137438953472,
  REQUEST_COMIC = 274877906944,
  AUTO_APPROVE_COMIC = 549755813888,
}

export interface PermissionCheckOptions {
  type: 'and' | 'or';
}

/**
 * Takes a Permission and the users permission value and determines
 * if the user has access to the permission provided. If the user has
 * the admin permission, true will always be returned from this check!
 *
 * All arithmetic runs via BigInt so permissions past bit 31
 * (REQUEST_GAME, AUTO_APPROVE_* for books / audiobooks / games, and
 * REQUEST_MANGA / AUTO_APPROVE_MANGA / REQUEST_COMIC /
 * AUTO_APPROVE_COMIC) are honoured — JS's `&` / `|` operators cast
 * to int32 and silently drop bits 32+.
 *
 * @param permissions Single permission or array of permissions
 * @param value users current permission value
 * @param options Extra options to control permission check behavior (mainly for arrays)
 */
export const hasPermission = (
  permissions: Permission | Permission[],
  value: number,
  options: PermissionCheckOptions = { type: 'and' }
): boolean => {
  // If we are not checking any permissions, bail out and return true
  if (permissions === 0) {
    return true;
  }

  const v = BigInt(value);
  const admin = BigInt(Permission.ADMIN);
  const isAdmin = (v & admin) !== 0n;

  if (Array.isArray(permissions)) {
    if (isAdmin) {
      return true;
    }
    switch (options.type) {
      case 'and':
        return permissions.every(
          (permission) => (v & BigInt(permission)) !== 0n
        );
      case 'or':
        return permissions.some(
          (permission) => (v & BigInt(permission)) !== 0n
        );
    }
  }

  return isAdmin || (v & BigInt(permissions)) !== 0n;
};

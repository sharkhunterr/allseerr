# Data Model: OIDC Authentication

**Feature Branch**: `001-oidc-auth` | **Date**: 2026-04-16

## Overview

OIDC authentication introduces two data changes:

1. **OidcSettings** -- stored in `settings.json` (not a database entity)
2. **User entity extension** -- new `oidcSub` column on the existing `user` table
3. **UserType enum extension** -- new `OIDC = 5` value
4. **SessionData extension** -- new `oidcTokenExpiry` field

No new database entities (tables) are created. OIDC provider configuration lives in
the settings file, following the established pattern for Plex/Jellyfin/Radarr/Sonarr.

---

## 1. OidcSettings Interface (settings.json)

**Location**: `server/lib/settings/index.ts`

```typescript
export interface OidcGroupMapping {
  /** Group name as it appears in the OIDC token claim */
  oidcGroup: string;
  /** Allseerr permission bitfield to assign to members of this group */
  permissions: number;
}

export interface OidcSettings {
  /** Whether OIDC authentication is enabled */
  enabled: boolean;
  /** OIDC provider issuer URL (must serve .well-known/openid-configuration) */
  issuerUrl: string;
  /** OAuth2 client ID registered with the OIDC provider */
  clientId: string;
  /** OAuth2 client secret registered with the OIDC provider */
  clientSecret: string;
  /** Display name shown on the login button (e.g., "Authentik", "Keycloak") */
  displayName: string;
  /** Whether to automatically create new user accounts on first OIDC login */
  autoCreateUsers: boolean;
  /** Name of the OIDC claim containing group membership (e.g., "groups") */
  groupClaimName: string;
  /** Default permissions for OIDC users when group mapping yields no match */
  defaultPermissions: number;
  /** Mappings from OIDC group names to Allseerr permission levels */
  groupMappings: OidcGroupMapping[];
}
```

**Default values** (added to the `Settings` constructor):

```typescript
oidc: {
  enabled: false,
  issuerUrl: '',
  clientId: '',
  clientSecret: '',
  displayName: 'OIDC',
  autoCreateUsers: true,
  groupClaimName: 'groups',
  defaultPermissions: Permission.REQUEST,
  groupMappings: [],
}
```

**AllSettings extension**:

```typescript
export interface AllSettings {
  // ... existing fields ...
  oidc: OidcSettings;
}
```

**Settings class extension** (getter/setter pair):

```typescript
get oidc(): OidcSettings {
  return this.data.oidc;
}

set oidc(data: OidcSettings) {
  this.data.oidc = mergeSettings(this.data.oidc, data);
}
```

**FullPublicSettings extension** (exposed to frontend without secrets):

```typescript
interface FullPublicSettings extends PublicSettings {
  // ... existing fields ...
  oidcEnabled: boolean;        // Whether the OIDC button should appear
  oidcProviderName: string;    // Display name for the button text
}
```

Computed in `get fullPublicSettings()`:

```typescript
oidcEnabled: this.data.oidc.enabled && !!this.data.oidc.issuerUrl && !!this.data.oidc.clientId,
oidcProviderName: this.data.oidc.displayName || 'OIDC',
```

**Important**: `clientSecret` is NEVER included in `FullPublicSettings` or any
unauthenticated API response.

---

## 2. User Entity Extension

**Location**: `server/entity/User.ts`

### New Column: `oidcSub`

```typescript
@Column({ type: 'varchar', nullable: true, unique: true })
public oidcSub?: string | null;
```

**Column details**:

| Property | Value |
|----------|-------|
| Name | `oidcSub` |
| Type | `varchar` |
| Nullable | `true` |
| Unique | `true` (only one user per OIDC subject) |
| Select | `true` (needed for login matching) |
| Default | `null` |

**Rationale for `unique: true`**: The OIDC `sub` claim is unique per provider. Since
Allseerr supports only one OIDC provider at a time, the combination of `sub` is
globally unique across all users. This prevents two Allseerr accounts from claiming
the same OIDC identity.

**Filtered fields update**: Add `oidcSub` to `User.filteredFields` so it is not
exposed in public user listings (same treatment as `plexId`, `jellyfinUserId`):

```typescript
static readonly filteredFields: string[] = [
  'email',
  'plexId',
  'password',
  'resetPasswordGuid',
  'jellyfinDeviceId',
  'jellyfinAuthToken',
  'plexToken',
  'oidcSub',
  'settings',
];
```

### Migration

A TypeORM migration adds the column:

```sql
ALTER TABLE "user" ADD COLUMN "oidcSub" varchar UNIQUE;
```

For SQLite (default), this is a simple `ALTER TABLE ADD COLUMN`. The `UNIQUE`
constraint is added as a separate index since SQLite does not support adding
unique constraints via ALTER TABLE:

```sql
ALTER TABLE "user" ADD COLUMN "oidcSub" varchar;
CREATE UNIQUE INDEX "IDX_user_oidcSub" ON "user" ("oidcSub");
```

---

## 3. UserType Enum Extension

**Location**: `server/constants/user.ts`

```typescript
export enum UserType {
  PLEX = 1,
  LOCAL = 2,
  JELLYFIN = 3,
  EMBY = 4,
  OIDC = 5,
}
```

**Usage**: New users created via OIDC login (who do not have a pre-existing account)
are assigned `UserType.OIDC`. Existing users who link their account via email
matching retain their original `UserType`.

---

## 4. SessionData Extension

**Location**: `server/types/express-session.d.ts`

```typescript
declare module 'express-session' {
  interface SessionData {
    userId: number;
    oidcTokenExpiry?: number;  // Unix timestamp in seconds; set only for OIDC sessions
  }
}
```

**Behavior**:

- Set during OIDC callback: `req.session.oidcTokenExpiry = idToken.exp`
- Checked in `checkUser` middleware on every request
- When `Date.now() / 1000 > oidcTokenExpiry`, session is destroyed
- Non-OIDC sessions (Plex, Jellyfin, local) do not have this field and are unaffected

---

## 5. Entity Relationship Diagram

```
┌─────────────────────────────────────────────┐
│                settings.json                 │
├─────────────────────────────────────────────┤
│  oidc: OidcSettings                         │
│  ├── enabled: boolean                       │
│  ├── issuerUrl: string                      │
│  ├── clientId: string                       │
│  ├── clientSecret: string                   │
│  ├── displayName: string                    │
│  ├── autoCreateUsers: boolean               │
│  ├── groupClaimName: string                 │
│  ├── defaultPermissions: number             │
│  └── groupMappings: OidcGroupMapping[]      │
│       ├── oidcGroup: string                 │
│       └── permissions: number               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│              user (DB table)                 │
├─────────────────────────────────────────────┤
│  id: number (PK)                            │
│  email: string (unique)                     │
│  userType: UserType (1=Plex, 2=Local,       │
│            3=Jellyfin, 4=Emby, 5=OIDC)      │
│  plexId: number (nullable)                  │
│  jellyfinUserId: string (nullable)          │
│  oidcSub: string (nullable, unique) [NEW]   │
│  permissions: number (bitfield)             │
│  ... other existing fields ...              │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│        SessionData (express-session)         │
├─────────────────────────────────────────────┤
│  userId: number                             │
│  oidcTokenExpiry?: number [NEW]             │
└─────────────────────────────────────────────┘
```

---

## 6. Data Flow: OIDC Login

```
User clicks "Sign in with [Provider]"
  │
  ▼
GET /api/v1/auth/oidc/login
  │  Generate state + nonce, store in session
  │  Build authorization URL via OidcAdapter
  ▼
302 Redirect → OIDC Provider authorization endpoint
  │
  ▼
User authenticates at IdP
  │
  ▼
302 Redirect → GET /api/v1/auth/oidc/callback?code=...&state=...
  │
  ▼
OidcAdapter.handleCallback()
  │  Exchange code for tokens
  │  Validate ID token
  │  Extract: sub, email, name, picture, groups, exp
  ▼
User lookup: oidcSub → email → create new
  │
  ▼
Group mapping resolution (if configured)
  │  OR'd permissions from all matching groups
  │  Fallback to defaultPermissions
  ▼
Set session:
  │  req.session.userId = user.id
  │  req.session.oidcTokenExpiry = idToken.exp
  ▼
302 Redirect → / (dashboard)
```

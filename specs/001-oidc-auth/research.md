# Research: OIDC Authentication

**Feature Branch**: `001-oidc-auth` | **Date**: 2026-04-16

## Decision 1: OIDC Client Library -- openid-client vs next-auth

### Context

Allseerr needs an OIDC Relying Party (RP) implementation. The constitution mentions
"next-auth (extend existing providers, do not replace)" in the tech stack, but the
existing codebase does not use next-auth -- authentication is implemented via raw
Express routes (`server/routes/auth.ts`) with manual session management using
`express-session` + `connect-typeorm`.

Two viable approaches:

1. **next-auth**: Add the next-auth framework with its OIDC provider. This would
   introduce a new authentication layer alongside the existing Express-based auth.
2. **openid-client**: Use the `openid-client` library directly within the existing
   Express route pattern. This keeps the architecture consistent with how Plex/Jellyfin
   auth is already implemented.

### Decision: Use `openid-client` directly

**Rationale**:

- **FR-019 compliance**: Sessions must respect OIDC token expiry. next-auth manages
  its own session lifecycle and abstracts token expiry behind its JWT/session strategy.
  Implementing custom expiry would mean fighting next-auth's design. With `openid-client`,
  we store the token expiry directly in the express-session and check it in middleware.

- **Consistency**: All existing auth (Plex, Jellyfin, local) uses the same pattern:
  Express route handler -> validate credentials -> set `req.session.userId`. Adding
  OIDC via the same pattern means no architectural divergence.

- **Minimal surface area**: `openid-client` is a focused OIDC RP library (~800KB).
  next-auth brings its own routing, session management, CSRF protection, and database
  adapters -- all of which duplicate existing Allseerr infrastructure.

- **Constitution note**: The "next-auth" mention in the constitution describes the
  inherited Seerr stack, but Seerr never actually used next-auth. The existing codebase
  has zero next-auth references. Introducing it would be a new dependency adding a
  parallel auth system, not "extending existing providers."

**Trade-offs**:

- We implement the OIDC authorization code flow manually (discovery, redirect,
  callback, token exchange). This is ~150 lines of adapter code.
- If Allseerr later wants additional OAuth providers (GitHub, Google), each would
  need its own adapter rather than a next-auth config line. Acceptable since the spec
  explicitly excludes "OAuth2 without OIDC."

### Key implementation details

```typescript
// OidcAdapter wraps openid-client
interface OidcAuthResult {
  sub: string;           // OIDC subject identifier
  email: string;         // Required claim
  name?: string;         // Optional display name
  picture?: string;      // Optional avatar URL
  groups?: string[];     // From configurable group claim
  idTokenExpiry: number; // Unix timestamp from id_token exp claim
}
```

The adapter handles:
1. Discovery: `Issuer.discover(issuerUrl)` to fetch `.well-known/openid-configuration`
2. Client registration: `new issuer.Client({ client_id, client_secret })`
3. Authorization URL: `client.authorizationUrl({ scope: 'openid email profile', ... })`
4. Callback: `client.callback(redirectUri, params, { state, nonce })`
5. Token claims: Extract `sub`, `email`, `groups` (configurable claim name)

---

## Decision 2: Token Expiry Session Management

### Context

FR-019 requires that OIDC sessions end when the OIDC token expires. The existing
session model uses `express-session` with a TypeORM-backed store (`connect-typeorm`).
Sessions currently have no expiry tied to external token lifecycle.

### Decision: Store token expiry in session, validate in middleware

**Approach**:

1. On OIDC login callback, extract `exp` claim from the ID token.
2. Store it as `req.session.oidcTokenExpiry` (Unix timestamp in seconds).
3. In `checkUser` middleware, check:
   ```typescript
   if (req.session?.oidcTokenExpiry && req.session.oidcTokenExpiry < now) {
     req.session.destroy();
     // user is not set, downstream middleware returns 403
   }
   ```

**Why not refresh tokens?**

- Refresh tokens would allow silently extending sessions, but the spec says
  "the user MUST re-authenticate via the identity provider rather than maintaining
  an indefinite Allseerr session." This means we intentionally do NOT use refresh
  tokens to extend the session.

- The OIDC token's `exp` claim becomes the hard session deadline.

**Why not a custom session store?**

- Modifying the session store would affect ALL users (Plex, Jellyfin, local).
  By checking `oidcTokenExpiry` only when it exists, non-OIDC sessions are
  completely unaffected.

**Session data extension**:

```typescript
declare module 'express-session' {
  interface SessionData {
    userId: number;
    oidcTokenExpiry?: number;  // Unix timestamp (seconds)
  }
}
```

---

## Decision 3: OidcSettings Storage -- settings.json vs DB entity

### Context

OIDC provider configuration includes: issuer URL, client ID, client secret,
display name, enabled flag, auto-create flag, group claim name, default permission
level, and group-to-permission mappings.

Two storage options:

1. **settings.json** (via the existing `AllSettings` interface and `Settings` class)
2. **TypeORM entity** (new `OidcSettings` + `OidcGroupMapping` tables)

### Decision: Store in settings.json

**Rationale**:

- **Pattern consistency**: All provider configuration in Allseerr uses settings.json.
  `PlexSettings`, `JellyfinSettings`, `RadarrSettings[]`, `SonarrSettings[]` are all
  interfaces on `AllSettings`, persisted to `config/settings.json`.

- **Singleton nature**: There is only one OIDC provider configured at a time. A
  database table for singleton config adds unnecessary migration and query complexity.

- **Persistence**: `config/settings.json` survives database resets/recreations, which
  is important for homelabs where users might wipe and recreate their SQLite database.

- **Client secret handling**: The client secret is stored in settings.json. While not
  encrypted at rest in the file (same as Jellyfin API key, Radarr API key, etc.),
  it follows the existing security model. The `select: false` pattern used for
  `plexToken` in the DB does not apply here since settings.json is a flat file not
  exposed via API by default.

**Schema within AllSettings**:

```typescript
export interface OidcGroupMapping {
  oidcGroup: string;       // Group name from IdP
  permissions: number;     // Allseerr permission bitfield
}

export interface OidcSettings {
  enabled: boolean;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  displayName: string;
  autoCreateUsers: boolean;
  groupClaimName: string;          // e.g., "groups" or "roles"
  defaultPermissions: number;      // Permission bitfield for unmapped users
  groupMappings: OidcGroupMapping[];
}
```

The `AllSettings` interface gets a new `oidc: OidcSettings` field. The `Settings`
class gets a getter/setter pair following the exact pattern of `plex`, `jellyfin`, etc.
The `FullPublicSettings` interface gets `oidcEnabled: boolean` and
`oidcProviderName: string` so the login page knows whether to show the OIDC button.

---

## Decision 4: Group Claim Parsing and Permission Mapping

### Context

FR-011 through FR-015 describe group-based permission assignment. The OIDC
provider includes group membership in a configurable claim (typically `groups`).
Allseerr must map these to its bitwise permission system.

### Decision: Configurable claim name + array of mappings

**Group claim extraction**:

The admin configures the claim name (default: `groups`). The adapter reads this
claim from the ID token first, then falls back to the userinfo endpoint. The claim
value is expected to be a JSON array of strings:

```json
{ "groups": ["allseerr-admins", "allseerr-users", "other-group"] }
```

**Mapping resolution**:

Each `OidcGroupMapping` maps a group name to a permission bitfield. On login:

1. Extract the groups array from the configured claim.
2. For each group, look up the matching `OidcGroupMapping`.
3. Combine all matched permissions using bitwise OR (this naturally gives the
   "highest permission" behavior per FR-013, since admin bit OR'd with anything
   still includes admin).
4. If no groups match (or group mapping is not configured), use `defaultPermissions`.

**Permission re-evaluation (FR-014)**:

Permissions are re-evaluated on every OIDC login. The callback handler always
recalculates permissions from the current token's groups, overwriting the user's
stored permissions. This means if a user is removed from the "admins" group in the
IdP, they lose admin on next login.

**Admin override**:

Per the spec assumption: "Per-user permission overrides by admins take precedence
over OIDC group mappings." Implementation: add a boolean `oidcGroupPermissionsLocked`
(or equivalent) to the User entity, defaulting to `false`. When an admin manually
edits a user's permissions, this flag is set to `true`, and subsequent OIDC logins
skip the group-based permission override for that user.

*Simplification*: For the initial implementation, we will NOT add the lock flag.
Group permissions always overwrite on login. If an admin wants to override, they
can create a dedicated group mapping. This can be revisited based on user feedback.

**Permission level presets for the UI**:

The settings UI offers three preset mappings for convenience (matching FR-012):

| UI Label | Permission Bitfield |
|----------|-------------------|
| Admin | `Permission.ADMIN` |
| Standard User | `Permission.REQUEST` (the default permission set) |
| Request-Only User | `Permission.REQUEST` (minimal) |

Admins can also set custom bitfields via advanced mode.

---

## Decision 5: User Matching and Account Linking

### Context

When a user authenticates via OIDC, the system must either find their existing
account or create a new one (FR-007, FR-008).

### Decision: Match by oidcSub first, then by email

**Login flow**:

1. User completes OIDC authentication; adapter returns `{ sub, email, ... }`.
2. Look up user by `oidcSub = sub` (exact match on OIDC subject identifier).
3. If not found, look up user by `email` (case-insensitive).
4. If found by email: link the account by setting `oidcSub = sub`.
5. If not found at all:
   - If `autoCreateUsers` is true: create a new user with `UserType.OIDC`,
     `oidcSub = sub`, email from token, permissions from group mapping or
     default.
   - If `autoCreateUsers` is false: reject with a clear message (FR-009).

**Why sub-first matching?**

The OIDC subject identifier (`sub`) is the stable, unique identifier for a user
at a given provider. Email addresses can change. After the initial linking (which
uses email as fallback), subsequent logins use `sub` for reliable identification.

**UserType handling**:

Existing users who link via email retain their original `UserType` (Plex, Jellyfin,
etc.). Only newly created users get `UserType.OIDC`. This means a user can have
both a Plex identity and an OIDC identity on the same account, and can log in via
either method.

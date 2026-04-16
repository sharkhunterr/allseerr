# Implementation Plan: OIDC Authentication

**Branch**: `001-oidc-auth` | **Date**: 2026-04-16 | **Spec**: spec.md

## Summary

Add generic OIDC (OpenID Connect) login as an optional, additional authentication
method alongside existing Plex/Jellyfin/Emby flows. Admins configure a single OIDC
provider (Authentik, Keycloak, Authelia, etc.) via the Settings UI. Users see a
"Sign in with [Provider Name]" button on the login page. Group claims can be mapped
to Allseerr permission levels. Sessions respect OIDC token expiry (FR-019).

The implementation uses the `openid-client` library directly (not next-auth) to
keep full control over token lifecycle and session expiry. OIDC configuration is
stored in the existing `settings.json` persistence layer. The User entity is
extended with an `oidcSub` column. A new `UserType.OIDC` enum value is added.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js (version from `.nvmrc`)
**Primary Dependencies**: `openid-client` (OIDC RP library), existing Express session infrastructure
**Storage**: SQLite (default) / PostgreSQL (optional) via TypeORM; `settings.json` for OIDC config
**Testing**: Jest (existing test setup), co-located `__tests__/` directories
**Target Platform**: Linux server (Docker), same as existing Seerr deployments
**Project Type**: Full-stack web application (Next.js + Express backend)
**Performance Goals**: OIDC login completes in < 5 seconds excluding IdP response time (SC-001)
**Constraints**: Zero regression on existing auth flows (SC-003); single OIDC provider at a time
**Scale/Scope**: Homelab scale (1-50 users), single-instance deployment

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Never Break Existing Functionality | PASS | OIDC is strictly additive. No existing auth routes or entity classes are modified. New `authRoutes.get/post` handlers are added; existing `/auth/plex`, `/auth/jellyfin`, `/auth/local` are untouched. |
| II. Adapter Pattern for External Services | PASS | OIDC provider communication is encapsulated in `server/lib/adapters/oidc/OidcAdapter.ts` behind a typed interface. No direct OIDC calls outside the adapter. |
| III. MediaType Enum Authority | N/A | This feature does not introduce new media types. |
| IV. Explicit Over Implicit | PASS | All new types are fully typed. No `any`. OIDC settings, callback payloads, and session extensions are typed interfaces. |
| V. Incremental Delivery | PASS | Phase 0 feature. Three implementation tiers: (1) admin config + basic login, (2) group mapping, (3) connection test. Each tier is independently deployable. |

**Prohibitions Checklist**:
- [ ] No modification of existing movie/TV entities, services, or API routes
- [ ] No changes to existing Plex/Jellyfin/Emby authentication flows
- [ ] No `any` TypeScript type
- [ ] No `npm` or `yarn` (always `pnpm`)
- [ ] No hardcoded URLs, credentials, or API keys
- [ ] No direct external API calls outside adapter layer

## Project Structure

### Documentation (this feature)

```text
specs/001-oidc-auth/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Entity definitions
├── quickstart.md        # Developer quickstart for testing OIDC
├── contracts/
│   └── oidc-api.md      # API endpoint contracts
└── tasks.md             # Phase 2 output (generated separately)
```

### Source Code (repository root)

```text
server/
├── constants/
│   └── user.ts                          # Add UserType.OIDC = 5
├── entity/
│   └── User.ts                          # Add oidcSub column (nullable)
├── lib/
│   ├── adapters/
│   │   └── oidc/
│   │       ├── OidcAdapter.ts           # OIDC RP adapter (openid-client wrapper)
│   │       └── __tests__/
│   │           └── OidcAdapter.test.ts
│   └── settings/
│       └── index.ts                     # Add OidcSettings + OidcGroupMapping interfaces
├── routes/
│   ├── auth.ts                          # Add OIDC login initiation + callback routes
│   └── settings/
│       └── oidc.ts                      # OIDC settings CRUD + test connection
├── middleware/
│   └── auth.ts                          # Extend checkUser for OIDC token expiry
└── types/
    └── express-session.d.ts             # Add oidcTokenExpiry to SessionData

src/
├── components/
│   ├── Login/
│   │   └── OidcLoginButton.tsx          # "Sign in with [Provider]" button
│   └── Settings/
│       └── SettingsOidc/
│           ├── index.tsx                # OIDC settings page
│           └── OidcGroupMappingEditor.tsx # Group-to-permission mapping UI
├── pages/
│   └── settings/
│       └── oidc.tsx                     # Next.js page for OIDC settings
└── hooks/
    └── useSettings.ts                   # No changes (existing hook reads public settings)
```

### Key Design Decisions

1. **openid-client over next-auth**: Direct `openid-client` usage gives full control
   over token lifecycle, enabling FR-019 (session respects token expiry). next-auth
   abstracts away token expiry management and would require fighting its session model.

2. **Settings.json storage (not a DB entity)**: OIDC config follows the same pattern as
   Plex/Jellyfin settings -- stored in `settings.json` via the `AllSettings` interface.
   This is consistent with how all other provider configs work, avoids a new entity table,
   and survives database resets.

3. **User entity extension (not a new entity)**: A single `oidcSub` column on the existing
   User entity links OIDC identities. This mirrors the existing `plexId` / `jellyfinUserId`
   pattern and avoids join complexity.

4. **Session-level token expiry**: The express-session `SessionData` is extended with
   `oidcTokenExpiry` (Unix timestamp). The `checkUser` middleware validates this on every
   request for OIDC users, destroying expired sessions.

## Implementation Tiers

### Tier 1 -- Admin Config + Basic Login (P1, FR-001 to FR-010, FR-016, FR-018, FR-019)

**Goal**: Admin can configure OIDC provider. Users can log in via OIDC. Sessions respect
token expiry. Existing auth flows are unaffected.

| Step | File(s) | Description |
|------|---------|-------------|
| 1.1 | `server/constants/user.ts` | Add `OIDC = 5` to `UserType` enum |
| 1.2 | `server/lib/settings/index.ts` | Add `OidcSettings` and `OidcGroupMapping` interfaces; add `oidc` field to `AllSettings`; add getter/setter to `Settings` class; add `oidcEnabled` + `oidcProviderName` to `FullPublicSettings` |
| 1.3 | `server/entity/User.ts` | Add `oidcSub` column (`varchar`, nullable, unique) |
| 1.4 | `server/lib/adapters/oidc/OidcAdapter.ts` | Implement OIDC adapter: discovery, authorization URL generation, callback token exchange, userinfo retrieval |
| 1.5 | `server/types/express-session.d.ts` | Add `oidcTokenExpiry?: number` to `SessionData` |
| 1.6 | `server/middleware/auth.ts` | In `checkUser`, if `session.oidcTokenExpiry` exists and is past, destroy session and clear `req.user` |
| 1.7 | `server/routes/auth.ts` | Add `GET /auth/oidc/login` (redirect to IdP) and `GET /auth/oidc/callback` (handle callback, create/match user, set session with token expiry) |
| 1.8 | `server/routes/settings/oidc.ts` | Add `GET/PUT /settings/oidc` for CRUD (admin-only) |
| 1.9 | `src/components/Login/OidcLoginButton.tsx` | Render "Sign in with [Provider Name]" button |
| 1.10 | `src/components/Login/index.tsx` | Conditionally render `OidcLoginButton` when OIDC is enabled |
| 1.11 | `src/components/Settings/SettingsOidc/index.tsx` | Settings form: issuer URL, client ID, client secret, display name, enabled toggle, auto-create toggle |
| 1.12 | `src/pages/settings/oidc.tsx` | Next.js page wiring |
| 1.13 | TypeORM migration | Add `oidcSub` column to `user` table |

### Tier 2 -- Group Mapping (P2, FR-011 to FR-015)

**Goal**: Admin can map OIDC group claims to Allseerr permission levels.

| Step | File(s) | Description |
|------|---------|-------------|
| 2.1 | `server/lib/adapters/oidc/OidcAdapter.ts` | Add group claim extraction from ID token / userinfo |
| 2.2 | `server/routes/auth.ts` | In OIDC callback, resolve groups to permissions via mappings; assign highest permission level |
| 2.3 | `server/routes/settings/oidc.ts` | Add `GET/PUT /settings/oidc/group-mappings` endpoints |
| 2.4 | `src/components/Settings/SettingsOidc/OidcGroupMappingEditor.tsx` | UI for adding/removing group-to-permission mappings |
| 2.5 | `src/components/Settings/SettingsOidc/index.tsx` | Integrate group mapping editor; add group claim name field |

### Tier 3 -- Connection Test (P3, FR-017)

**Goal**: Admin can validate OIDC config before saving.

| Step | File(s) | Description |
|------|---------|-------------|
| 3.1 | `server/lib/adapters/oidc/OidcAdapter.ts` | Add `testConnection()` method: fetch discovery document, validate client credentials |
| 3.2 | `server/routes/settings/oidc.ts` | Add `POST /settings/oidc/test` endpoint (accepts unsaved config, returns result) |
| 3.3 | `src/components/Settings/SettingsOidc/index.tsx` | Add "Test Connection" button with result display |

## Complexity Tracking

No constitution violations. No complexity justifications needed.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| No new DB entity for OidcSettings | Store in `settings.json` | Follows existing pattern for Plex/Jellyfin config. Simpler than a TypeORM entity for singleton config. |
| No next-auth | Use `openid-client` directly | FR-019 requires explicit token expiry control. next-auth's session model would fight this requirement. |
| Single `oidcSub` column on User | Not a separate linking table | Mirrors `plexId`/`jellyfinUserId` pattern. Only one OIDC provider is supported, so a 1:1 mapping suffices. |

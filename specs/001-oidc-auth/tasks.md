# Tasks: OIDC Authentication

**Feature Branch**: `001-oidc-auth` | **Generated**: 2026-04-16 | **Spec**: spec.md | **Plan**: plan.md

## Phase 1 — Setup & Dependencies

- [ ] T001 [P] Install `openid-client` dependency via pnpm. Run `pnpm add openid-client` and verify it appears in `package.json` dependencies. File: `package.json`
- [ ] T002 [P] Install `openid-client` type definitions if needed (check if the package ships its own types; if not, `pnpm add -D @types/openid-client`). File: `package.json`

## Phase 2 — Foundation (Data Model & Types)

- [x] T010 [P] [US1] Add `OIDC = 5` to the `UserType` enum after `EMBY = 4`. File: `server/constants/user.ts`
- [x] T011 [P] [US1] Add `OidcGroupMapping` and `OidcSettings` interfaces to the settings module. `OidcGroupMapping` has fields `oidcGroup: string` and `permissions: number`. `OidcSettings` has fields: `enabled: boolean`, `issuerUrl: string`, `clientId: string`, `clientSecret: string`, `displayName: string`, `autoCreateUsers: boolean`, `groupClaimName: string`, `defaultPermissions: number`, `groupMappings: OidcGroupMapping[]`. Add `oidc: OidcSettings` to the `AllSettings` interface. File: `server/lib/settings/index.ts`
- [x] T012 [US1] Add default values for the `oidc` field in the `Settings` constructor, inside `this.data = { ... }`. Defaults: `enabled: false`, `issuerUrl: ''`, `clientId: ''`, `clientSecret: ''`, `displayName: 'OIDC'`, `autoCreateUsers: true`, `groupClaimName: 'groups'`, `defaultPermissions: Permission.REQUEST`, `groupMappings: []`. Must come after T011. File: `server/lib/settings/index.ts`
- [x] T013 [US1] Add getter/setter pair for `oidc` on the `Settings` class, following the exact pattern of the `plex` getter/setter. Getter returns `this.data.oidc`, setter uses `mergeSettings(this.data.oidc, data)`. Must come after T012. File: `server/lib/settings/index.ts`
- [x] T014 [US1] Add `oidcEnabled: boolean` and `oidcProviderName: string` to the `FullPublicSettings` interface. In the `get fullPublicSettings()` getter, add: `oidcEnabled: this.data.oidc.enabled && !!this.data.oidc.issuerUrl && !!this.data.oidc.clientId` and `oidcProviderName: this.data.oidc.displayName || 'OIDC'`. Must come after T013. File: `server/lib/settings/index.ts`
- [x] T015 [P] [US2] Add `oidcTokenExpiry?: number` to the `SessionData` interface (Unix timestamp in seconds). Add a comment: `// Unix timestamp in seconds; set only for OIDC sessions`. File: `server/types/express-session.d.ts`
- [x] T016 [P] [US2] Add `oidcSub` column to the `User` entity. Declare it as `@Column({ type: 'varchar', nullable: true, unique: true })` with type `string | null | undefined`. Place it after the `jellyfinAuthToken` column, following the same nullable varchar pattern as `jellyfinUserId`. Also add `'oidcSub'` to the `User.filteredFields` static array (alongside `plexToken`, `jellyfinAuthToken`, etc.). File: `server/entity/User.ts`
- [x] T017 [US2] Create SQLite migration to add the `oidcSub` column to the `user` table. Use timestamp `1776000000000`. Class name: `AddOidcSub1776000000000`. The `up` method runs two queries: `ALTER TABLE "user" ADD COLUMN "oidcSub" varchar` and `CREATE UNIQUE INDEX "IDX_user_oidcSub" ON "user" ("oidcSub")`. The `down` method drops the index then drops the column (SQLite requires the temp-table-swap pattern: create temp table without `oidcSub`, copy data, drop original, rename temp). Follow the pattern in `server/migration/sqlite/1771080196816-RenameBlacklistToBlocklist.ts`. Must come after T016. File: `server/migration/sqlite/1776000000000-AddOidcSub.ts`
- [x] T018 [US2] Create PostgreSQL migration to add the `oidcSub` column. Use timestamp `1776000000000`. Class name: `AddOidcSub1776000000000`. The `up` method runs: `ALTER TABLE "user" ADD COLUMN "oidcSub" varchar UNIQUE`. The `down` method runs: `ALTER TABLE "user" DROP COLUMN "oidcSub"`. Follow the pattern in `server/migration/postgres/`. Must come after T016. File: `server/migration/postgres/1776000000000-AddOidcSub.ts`
- [x] T019 [US2] Register both new migrations in the datasource configuration. Find the file that lists all migrations (search for existing migration imports) and add the new SQLite and PostgreSQL migrations to their respective arrays. File: `server/datasource.ts` (or wherever migrations are registered)

## Phase 3 — Tier 1: Admin Configures OIDC Provider (US1, P1)

### Backend — OIDC Adapter

- [x] T100 [US1] Create the OIDC adapter file. Define the `OidcAuthResult` interface with fields: `sub: string`, `email: string`, `name?: string`, `picture?: string`, `groups?: string[]`, `idTokenExpiry: number`. Export a class `OidcAdapter` with a constructor that accepts `{ issuerUrl: string, clientId: string, clientSecret: string }`. File: `server/lib/adapters/oidc/OidcAdapter.ts`
- [x] T101 [US1] Implement the `discover()` method on `OidcAdapter`. Uses `openid-client`'s `Issuer.discover(issuerUrl)` to fetch the `.well-known/openid-configuration` document. Caches the resulting `Issuer` instance on the adapter. Throws a typed error if discovery fails (wrap in try/catch, log with `@server/logger`, rethrow with a descriptive message). Must come after T100. File: `server/lib/adapters/oidc/OidcAdapter.ts`
- [x] T102 [US1] Implement the `getAuthorizationUrl(redirectUri: string, state: string, nonce: string): Promise<string>` method. Calls `discover()` if not cached, creates a `Client` instance with the configured `client_id` and `client_secret`, then returns `client.authorizationUrl({ redirect_uri: redirectUri, scope: 'openid email profile', state, nonce, response_type: 'code' })`. Must come after T101. File: `server/lib/adapters/oidc/OidcAdapter.ts`
- [x] T103 [US2] Implement the `handleCallback(redirectUri: string, callbackParams: Record<string, string>, checks: { state: string, nonce: string }): Promise<OidcAuthResult>` method. Uses `client.callback(redirectUri, callbackParams, checks)` to exchange the authorization code for tokens. Extracts `sub`, `email`, `name`, `picture` from the ID token claims. Extracts `exp` from the ID token for `idTokenExpiry`. Returns an `OidcAuthResult`. Throws typed errors for token exchange failures and missing email claim. Must come after T102. File: `server/lib/adapters/oidc/OidcAdapter.ts`
- [x] T104 [US2] Add group claim extraction to `handleCallback`. After extracting base claims, read the configurable group claim name (passed as a parameter `groupClaimName: string`) from the ID token claims. If not present in the ID token, attempt to fetch from the userinfo endpoint via `client.userinfo(tokenSet)`. The groups value should be a `string[]`. If the claim is not an array, wrap a single string value in an array; if not present, set `groups` to `undefined`. Must come after T103. File: `server/lib/adapters/oidc/OidcAdapter.ts`

### Backend — Settings Routes

- [x] T110 [US1] Create the OIDC settings route file. Export a `Router`. Add `GET /` handler (mapped to `GET /api/v1/settings/oidc` via parent mount). It reads `getSettings().oidc` and returns it as JSON with the `clientSecret` field replaced: return `clientSecretSet: true` if `clientSecret` is non-empty, otherwise `clientSecretSet: false`. Never return the actual secret. File: `server/routes/settings/oidc.ts`
- [x] T111 [US1] Add `PUT /` handler to the OIDC settings route. Accepts the `OidcSettings` body. Validates: if `enabled` is `true`, then `issuerUrl` and `clientId` must be non-empty; `issuerUrl` must start with `http://` or `https://`; each `groupMappings[].oidcGroup` must be non-empty; `defaultPermissions` must be a valid integer. If `clientSecret` is empty string or undefined, preserve the existing secret. Otherwise overwrite. Calls `settings.oidc = validatedData` then `settings.save()`. Returns the updated settings (secret redacted). File: `server/routes/settings/oidc.ts`
- [x] T112 [US1] Register the OIDC settings route in the settings router. Import the oidc route module and mount it with `settingsRoutes.use('/oidc', oidcRoutes)`. Must come after T110. File: `server/routes/settings/index.ts`

### Backend — Auth Routes

- [x] T120 [US2] Add `GET /oidc/login` route to the auth router. Check that OIDC is enabled and configured (issuerUrl + clientId are non-empty); if not, return 404. Generate a random `state` and `nonce` (using `crypto.randomBytes`), store them in `req.session` (add `oidcState` and `oidcNonce` to the session type — update `server/types/express-session.d.ts` to include `oidcState?: string` and `oidcNonce?: string`). Construct the callback `redirectUri` from `settings.main.applicationUrl + '/api/v1/auth/oidc/callback'`. Instantiate `OidcAdapter` with the settings, call `getAuthorizationUrl()`, and redirect (302) to the returned URL. On error, return 500 with a descriptive message. File: `server/routes/auth.ts`
- [x] T121 [US2] Add `GET /oidc/callback` route to the auth router. If query params include `error`, redirect to `/login?error=oidc_provider_error&message={error_description}`. Validate `state` matches `req.session.oidcState`; if not, redirect to `/login?error=oidc_state_mismatch`. Call `OidcAdapter.handleCallback()` with the query params and stored `{ state, nonce }` checks. On token exchange failure, redirect to `/login?error=oidc_token_error`. On missing email, redirect to `/login?error=oidc_missing_email`. On provider unreachable, redirect to `/login?error=oidc_provider_unreachable`. Clean up `oidcState` and `oidcNonce` from session. Must come after T120. File: `server/routes/auth.ts`
- [x] T122 [US2] In the OIDC callback route (after successful token exchange), implement user lookup and creation. Use `getRepository(User)`. First query: `findOne({ where: { oidcSub: result.sub } })`. If not found, query: `findOne({ where: { email: ILike(result.email) } })` (import `ILike` from typeorm for case-insensitive match). If found by email, link: set `user.oidcSub = result.sub`, save. If not found at all: check `settings.oidc.autoCreateUsers`. If true, create a new `User` with `userType: UserType.OIDC`, `email: result.email`, `oidcSub: result.sub`, `username: result.name || result.email`, `avatar: result.picture || ''`, `permissions: settings.oidc.defaultPermissions`. If false, redirect to `/login?error=oidc_no_account`. Must come after T121. File: `server/routes/auth.ts`
- [x] T123 [US2] In the OIDC callback route (after user is resolved), set session and redirect. Set `req.session.userId = user.id` and `req.session.oidcTokenExpiry = result.idTokenExpiry`. Redirect (302) to `/`. Must come after T122. File: `server/routes/auth.ts`

### Backend — Middleware

- [x] T130 [US2] Extend the `checkUser` middleware to handle OIDC token expiry. After the existing user lookup block (`else if (req.session?.userId)`), add a check: if `req.session?.oidcTokenExpiry` exists and `Math.floor(Date.now() / 1000) > req.session.oidcTokenExpiry`, then call `req.session.destroy()` (with a callback), set `req.user = undefined`, and call `next()` early (the user will be treated as unauthenticated by downstream middleware). Non-OIDC sessions (no `oidcTokenExpiry`) are completely unaffected. File: `server/middleware/auth.ts`

### Frontend — Login Page

- [x] T140 [P] [US2] Create the `OidcLoginButton` component. It receives `oidcProviderName: string` as a prop. Renders a `Button` (from `@app/components/Common/Button`) styled consistently with the existing Plex/Jellyfin login buttons. The button text is "Sign in with {providerName}" (use `intl.formatMessage` with a new message). On click, it navigates to `/api/v1/auth/oidc/login` (full page redirect via `window.location.href`, since the backend does a 302 to the IdP). Add intl messages: `signinwithoidc: 'Use your {oidcProviderName} account'`. File: `src/components/Login/OidcLoginButton.tsx`
- [x] T141 [US2] Integrate `OidcLoginButton` into the Login page. Import `OidcLoginButton`. After the existing auth buttons section (Plex/Jellyfin/Local), conditionally render `OidcLoginButton` when `settings.currentSettings.oidcEnabled` is true, passing `settings.currentSettings.oidcProviderName` as the provider name. Ensure the OIDC button appears alongside (not replacing) existing auth methods. Must come after T140. File: `src/components/Login/index.tsx`
- [x] T142 [US2] Handle OIDC error query parameters on the Login page. Check `router.query.error` for OIDC-specific error codes (`oidc_provider_error`, `oidc_state_mismatch`, `oidc_missing_email`, `oidc_no_account`, `oidc_token_error`, `oidc_provider_unreachable`). Map each to a user-friendly intl message string. Display the error using the existing error display mechanism (the `error` state + `XCircleIcon` block). Add intl messages for each error code. File: `src/components/Login/index.tsx`

### Frontend — Settings Page

- [x] T150 [US1] Create the OIDC settings page component. Build a form with fields: Issuer URL (text input, required), Client ID (text input, required), Client Secret (password input, shows placeholder if set), Display Name (text input, default "OIDC"), Enabled toggle (switch), Auto-create Users toggle (switch). Use `useSWR` to fetch `GET /api/v1/settings/oidc` for initial values. On save, `PUT /api/v1/settings/oidc` with form data. Use `formik` for form state and validation (consistent with other settings pages like `SettingsMain`). Show success/error toast on save. File: `src/components/Settings/SettingsOidc/index.tsx`
- [x] T151 [US1] Create the Next.js page for OIDC settings. Import `SettingsLayout` and `SettingsOidc`, wrap in `SettingsLayout`. Apply `useRouteGuard(Permission.ADMIN)`. Follow the exact pattern of `src/pages/settings/main.tsx`. File: `src/pages/settings/oidc.tsx`
- [x] T152 [US1] Add the OIDC settings link to the Settings navigation menu. Add a new menu entry `{ text: 'OIDC', route: '/settings/oidc', regex: /^\/settings\/oidc/ }` to the `settingsRoutes` array in `SettingsLayout`. Add an intl message `menuOidc: 'OIDC'`. Place it after the Users entry. File: `src/components/Settings/SettingsLayout.tsx`

### Frontend — Type Extensions

- [x] T160 [P] [US1] Add `oidcEnabled` and `oidcProviderName` to the frontend `PublicSettingsResponse` type (or equivalent type used by `useSettings` hook). Search for where `FullPublicSettings` fields are typed on the frontend side and add the two new fields. File: `src/hooks/useSettings.ts` (or the relevant interface file)

## Phase 4 — Tier 2: Admin Maps OIDC Groups to Permissions (US3, P2)

- [x] T200 [US3] Add group-to-permission resolution logic in the OIDC callback route. After user lookup/creation (T122), if `settings.oidc.groupMappings.length > 0` and `result.groups` is defined, iterate through the user's groups: for each group, find a matching `OidcGroupMapping` by `oidcGroup` name. Combine all matched mapping permissions using bitwise OR. If at least one group matched, update `user.permissions` to the OR'd value and save. If no groups matched, set `user.permissions = settings.oidc.defaultPermissions`. If group mapping is not configured (empty mappings array), do not modify permissions for existing users; for new users, `defaultPermissions` is already applied at creation. Must come after T122. File: `server/routes/auth.ts`
- [x] T210 [US3] Add `GET /group-mappings` and `PUT /group-mappings` endpoints to the OIDC settings route. GET returns `settings.oidc.groupMappings`. PUT accepts `{ groupClaimName: string, groupMappings: OidcGroupMapping[] }`, validates each mapping has a non-empty `oidcGroup` and valid integer `permissions`, updates settings, and saves. File: `server/routes/settings/oidc.ts`
- [x] T220 [US3] Create the group mapping editor component. Renders a dynamic list where each row has: a text input for OIDC group name and a dropdown/select for permission level (presets: Admin = `Permission.ADMIN`, Standard User = `Permission.REQUEST`, Request-Only = `Permission.REQUEST`; show the numeric value). Include an "Add Mapping" button and a delete button per row. Also include a text input for "Group Claim Name" (default: `groups`). File: `src/components/Settings/SettingsOidc/OidcGroupMappingEditor.tsx`
- [x] T221 [US3] Integrate the group mapping editor into the OIDC settings page. Import `OidcGroupMappingEditor` and render it below the main OIDC config form. Pass the current `groupClaimName` and `groupMappings` as props. On save, include group mapping data in the PUT request body. Also add a "Default Permission Level" dropdown for users not matching any group. Must come after T150 and T220. File: `src/components/Settings/SettingsOidc/index.tsx`

## Phase 5 — Tier 2: Admin Disables OIDC Without Disruption (US4, P2)

- [x] T300 [US4] Verify that disabling OIDC preserves user accounts. This is inherently satisfied by the settings model (toggling `enabled` to `false` does not touch the `user` table). Add a code comment in the PUT settings handler confirming this invariant: "Disabling OIDC does not delete or modify any user accounts. OIDC-created users remain in the database." File: `server/routes/settings/oidc.ts`
- [x] T301 [US4] Verify the login page hides the OIDC button when disabled. The `oidcEnabled` computed field in `fullPublicSettings` already returns `false` when `enabled` is `false`. Confirm that `OidcLoginButton` is only rendered when `settings.currentSettings.oidcEnabled` is truthy (done in T141). No additional code needed if T141 is correct. File: `src/components/Login/index.tsx`
- [x] T302 [US4] Add a guard to the `GET /auth/oidc/login` route to return 404 when OIDC is disabled. This is already specified in T120, but verify it covers the case where OIDC was previously enabled and is now disabled — active sessions should still work until they expire (the `checkUser` middleware handles expiry independently), but new login attempts are blocked. File: `server/routes/auth.ts`

## Phase 6 — Tier 3: Admin Tests OIDC Before Saving (US5, P3)

- [x] T400 [US5] Implement `testConnection(config: { issuerUrl: string, clientId: string, clientSecret: string }): Promise<OidcTestResult>` as a static method on `OidcAdapter`. Step 1: fetch `{issuerUrl}/.well-known/openid-configuration` and validate it contains `authorization_endpoint`, `token_endpoint`, and `jwks_uri`. Step 2: if the discovery document includes a `token_endpoint`, attempt a client credentials grant or introspection to validate client ID + secret (wrap in try/catch; if the provider doesn't support client_credentials grant, report discovery-only success). Return `{ status: 'success', message, details }` on success or `{ status: 'error', message, code }` on failure. Define the `OidcTestResult` type in the same file. File: `server/lib/adapters/oidc/OidcAdapter.ts`
- [x] T410 [US5] Add `POST /test` endpoint to the OIDC settings route. Accepts `{ issuerUrl, clientId, clientSecret }` in the body. If `clientSecret` is empty, use the existing saved secret from settings (for the case where the admin is re-testing without changing the secret). Calls `OidcAdapter.testConnection()` with the provided config. Returns 200 with success result or 400 with error result. The config is NOT saved to settings. Must come after T400. File: `server/routes/settings/oidc.ts`
- [x] T420 [US5] Add a "Test Connection" button to the OIDC settings page. When clicked, it sends a `POST /api/v1/settings/oidc/test` with the current (unsaved) form values. Displays a loading spinner during the test. On success, shows a green success banner with the provider details (issuer, endpoints). On failure, shows a red error banner with the specific error message. The test does NOT trigger a save. Must come after T150. File: `src/components/Settings/SettingsOidc/index.tsx`

## Phase 7 — Tests

- [x] T500 [P] Write unit tests for `OidcAdapter`. Mock `openid-client` (Issuer.discover, Client, etc.). Test cases: (1) `discover()` succeeds and caches issuer, (2) `discover()` fails with unreachable URL, (3) `getAuthorizationUrl()` returns valid URL, (4) `handleCallback()` returns correct `OidcAuthResult` with all claims, (5) `handleCallback()` throws on missing email, (6) group claim extraction from ID token, (7) group claim fallback to userinfo, (8) `testConnection()` success, (9) `testConnection()` discovery failure. File: `server/lib/adapters/oidc/__tests__/OidcAdapter.test.ts`
- [x] T510 [P] Write unit tests for the OIDC auth routes. Mock the `OidcAdapter`, `getRepository(User)`, and `getSettings()`. Test cases: (1) `GET /oidc/login` returns 302 when OIDC enabled, (2) `GET /oidc/login` returns 404 when OIDC disabled, (3) callback creates new user when `autoCreateUsers` is true, (4) callback links existing user by email, (5) callback links existing user by oidcSub, (6) callback rejects when `autoCreateUsers` is false and user unknown, (7) callback redirects with error on state mismatch, (8) callback redirects with error on missing email, (9) session `oidcTokenExpiry` is set correctly. File: `server/routes/__tests__/auth.oidc.test.ts`
- [x] T520 [P] Write unit tests for the `checkUser` middleware OIDC expiry check. Test cases: (1) non-OIDC session (no `oidcTokenExpiry`) is unaffected, (2) OIDC session with future expiry proceeds normally, (3) OIDC session with past expiry destroys session and unsets user. File: `server/middleware/__tests__/auth.test.ts`
- [x] T530 [P] Write unit tests for OIDC settings routes. Test cases: (1) GET returns settings with secret redacted, (2) PUT validates required fields when enabled, (3) PUT preserves secret when not provided, (4) PUT overwrites secret when provided, (5) POST /test returns success for valid config, (6) POST /test returns error for invalid config. File: `server/routes/settings/__tests__/oidc.test.ts`
- [x] T540 [P] Write unit tests for group permission resolution. Test cases: (1) single group match assigns correct permissions, (2) multiple group matches OR permissions together, (3) no group match falls back to defaultPermissions, (4) empty groupMappings array does not modify existing user permissions, (5) permissions are recalculated on every login (not cached). File: `server/routes/__tests__/auth.oidc.groups.test.ts`

## Phase 8 — Polish & Integration

- [x] T600 Add error logging for all OIDC operations. Ensure every catch block in `OidcAdapter`, auth routes, and settings routes logs with `logger.error` or `logger.warn` using structured data (include `label: 'oidc'` for filtering). File: `server/lib/adapters/oidc/OidcAdapter.ts`, `server/routes/auth.ts`, `server/routes/settings/oidc.ts`
- [x] T610 Verify that the `jellyfinServerName` field pattern is followed for OIDC — ensure `oidcProviderName` appears in the public settings API response (already done in T014). Manually trace: `GET /api/v1/settings/public` -> `fullPublicSettings` -> frontend `useSettings()` -> Login component -> OidcLoginButton. Confirm no field is missing in the chain. File: multiple (verification task)
- [x] T620 Add i18n message definitions for all new user-facing strings. Ensure all new `defineMessages` calls use the correct component prefix. Strings needed: OIDC login button text, OIDC error messages (6 error codes), OIDC settings page labels (issuer URL, client ID, client secret, display name, enabled, auto-create, group claim, default permissions, group mappings), test connection button, test success/failure messages, settings menu label. File: `src/components/Login/OidcLoginButton.tsx`, `src/components/Login/index.tsx`, `src/components/Settings/SettingsOidc/index.tsx`, `src/components/Settings/SettingsLayout.tsx`
- [x] T630 Add validation on the OIDC callback to handle edge case: OIDC provider returns a token without an email claim but the user exists by `oidcSub`. In this case, proceed with login (email is only required for first-time linking). Update the email-missing check in T121 to only reject when the user cannot be found by `oidcSub`. File: `server/routes/auth.ts`
- [x] T640 Ensure the OIDC adapter handles provider signing key rotation gracefully. The `openid-client` library handles JWKS rotation automatically via the discovery document's `jwks_uri`. Add a code comment documenting this behavior. Clear the cached `Issuer` on discovery errors to force re-fetch on retry. File: `server/lib/adapters/oidc/OidcAdapter.ts`

## Dependency Graph

```
T001/T002 (parallel)
    |
    v
T010, T011, T015, T016, T160 (parallel, no deps on each other)
    |
    v
T012 -> T013 -> T014 (sequential chain on settings)
T017, T018 (parallel, depend on T016) -> T019
    |
    v
T100 -> T101 -> T102 -> T103 -> T104 (sequential adapter chain)
T110 -> T111 (sequential)
T110 -> T112 (mount route)
    |
    v
T120 -> T121 -> T122 -> T123 (sequential auth route chain)
T130 (independent, depends on T015)
T140 -> T141, T142 (login UI)
T150 -> T151, T152 (settings UI)
    |
    v
T200 (depends on T122 and T104)
T210 (depends on T111)
T220 -> T221 (depends on T150)
    |
    v
T300, T301, T302 (verification, depend on prior phases)
    |
    v
T400 -> T410 (test connection backend)
T420 (depends on T150 and T410)
    |
    v
T500-T540 (tests, parallel, depend on implementation tasks)
    |
    v
T600-T640 (polish, depend on all implementation)
```

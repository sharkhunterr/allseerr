# API Contracts: OIDC Authentication

**Feature Branch**: `001-oidc-auth` | **Date**: 2026-04-16

All endpoints are prefixed with `/api/v1` (the existing Allseerr API prefix).

---

## 1. Authentication Endpoints

### 1.1 Initiate OIDC Login

Redirects the user to the OIDC provider's authorization endpoint.

```
GET /api/v1/auth/oidc/login
```

**Authentication**: None (public endpoint)

**Query Parameters**: None

**Response**:

| Status | Description |
|--------|-------------|
| 302 | Redirect to OIDC provider authorization URL |
| 404 | OIDC is not enabled or not configured |
| 500 | Failed to build authorization URL (IdP unreachable, discovery failed) |

**302 Response Headers**:

```
Location: https://idp.example.com/authorize?
  response_type=code&
  client_id=allseerr&
  redirect_uri=https://allseerr.example.com/api/v1/auth/oidc/callback&
  scope=openid+email+profile&
  state=<random>&
  nonce=<random>
```

**Session side effects**: Stores `oidcState` and `oidcNonce` in session for
CSRF validation on callback.

**Error response body** (404/500):

```json
{
  "status": 404,
  "error": "OIDC authentication is not configured."
}
```

---

### 1.2 OIDC Callback

Handles the redirect back from the OIDC provider after user authentication.

```
GET /api/v1/auth/oidc/callback
```

**Authentication**: None (public endpoint, but validates state parameter)

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | Authorization code from the OIDC provider |
| `state` | string | Yes | State parameter for CSRF validation |
| `error` | string | No | Error code if the IdP rejected the request |
| `error_description` | string | No | Human-readable error description |

**Response**:

| Status | Description |
|--------|-------------|
| 302 | Redirect to `/` (login successful) or `/login?error=...` (login failed) |

**Success redirect**: `302 Location: /`

Session is populated:
```
req.session.userId = <user_id>
req.session.oidcTokenExpiry = <id_token_exp_claim>
```

**Failure redirects**:

| Condition | Redirect |
|-----------|----------|
| IdP returned error | `/login?error=oidc_provider_error&message=<error_description>` |
| State mismatch | `/login?error=oidc_state_mismatch` |
| No email in token | `/login?error=oidc_missing_email` |
| Auto-create disabled, user unknown | `/login?error=oidc_no_account` |
| Token exchange failed | `/login?error=oidc_token_error` |
| Provider unreachable | `/login?error=oidc_provider_unreachable` |

**User creation/matching logic** (executed server-side before redirect):

1. Extract `sub`, `email`, `name`, `picture` from ID token / userinfo.
2. Find user by `oidcSub = sub`.
3. If not found, find user by `email` (case-insensitive).
4. If found by email, link: set `user.oidcSub = sub`.
5. If not found:
   - If `autoCreateUsers`: create user with `UserType.OIDC`, assign permissions.
   - Else: redirect with `oidc_no_account` error.
6. If group mappings configured: recalculate permissions from token groups.
7. Set session and redirect to `/`.

---

## 2. Settings Endpoints

All settings endpoints require `Permission.MANAGE_SETTINGS` (admin-only).

### 2.1 Get OIDC Settings

```
GET /api/v1/settings/oidc
```

**Authentication**: Required (admin)

**Response**: `200 OK`

```json
{
  "enabled": true,
  "issuerUrl": "https://auth.example.com",
  "clientId": "allseerr-client",
  "clientSecret": "",
  "displayName": "Authentik",
  "autoCreateUsers": true,
  "groupClaimName": "groups",
  "defaultPermissions": 32,
  "groupMappings": [
    {
      "oidcGroup": "allseerr-admins",
      "permissions": 2
    },
    {
      "oidcGroup": "allseerr-users",
      "permissions": 32
    }
  ]
}
```

**Note on clientSecret**: The GET response returns the `clientSecret` as an empty
string if it is set (to indicate "a secret is configured") or as an empty string if
not set. The actual secret is never returned via the API. This follows the pattern
used by other services (Radarr/Sonarr API keys are stored but not re-displayed in
some UIs).

*Alternative approach*: Return a boolean `clientSecretSet: true/false` instead.
The implementation should choose whichever is simpler.

---

### 2.2 Update OIDC Settings

```
PUT /api/v1/settings/oidc
```

**Authentication**: Required (admin)

**Request body**:

```json
{
  "enabled": true,
  "issuerUrl": "https://auth.example.com",
  "clientId": "allseerr-client",
  "clientSecret": "new-secret-value",
  "displayName": "Authentik",
  "autoCreateUsers": true,
  "groupClaimName": "groups",
  "defaultPermissions": 32,
  "groupMappings": [
    {
      "oidcGroup": "allseerr-admins",
      "permissions": 2
    },
    {
      "oidcGroup": "allseerr-users",
      "permissions": 32
    }
  ]
}
```

**Field behavior**:

| Field | Behavior |
|-------|----------|
| `clientSecret` | If empty string or omitted, existing secret is preserved. If non-empty, overwrites. |
| `groupMappings` | Full replacement (not merge). Send the complete list. |
| All other fields | Overwrite with provided value. |

**Response**:

| Status | Body | Description |
|--------|------|-------------|
| 200 | Updated `OidcSettings` (secret redacted) | Success |
| 400 | `{ "status": 400, "error": "..." }` | Validation error |

**Validation rules**:

- If `enabled` is `true`: `issuerUrl`, `clientId` are required (non-empty).
- `issuerUrl` must be a valid URL (starts with `https://` or `http://`).
- `groupMappings[].oidcGroup` must be non-empty strings.
- `groupMappings[].permissions` must be valid integer.
- `defaultPermissions` must be a valid integer.

---

### 2.3 Test OIDC Connection

Tests the provided OIDC configuration without saving it.

```
POST /api/v1/settings/oidc/test
```

**Authentication**: Required (admin)

**Request body**: Same shape as the PUT body (unsaved configuration to test).

```json
{
  "issuerUrl": "https://auth.example.com",
  "clientId": "allseerr-client",
  "clientSecret": "test-secret"
}
```

Only `issuerUrl`, `clientId`, and `clientSecret` are used for the test. Other
fields are ignored.

**Response**:

| Status | Body | Description |
|--------|------|-------------|
| 200 | `{ "status": "success", "message": "..." }` | Connection test passed |
| 400 | `{ "status": "error", "message": "..." }` | Test failed with details |

**Success response** (`200`):

```json
{
  "status": "success",
  "message": "Successfully connected to OIDC provider.",
  "details": {
    "issuer": "https://auth.example.com",
    "authorizationEndpoint": "https://auth.example.com/authorize",
    "tokenEndpoint": "https://auth.example.com/token",
    "userinfoEndpoint": "https://auth.example.com/userinfo",
    "supportedScopes": ["openid", "email", "profile", "groups"]
  }
}
```

**Failure responses** (`400`):

Discovery failure:
```json
{
  "status": "error",
  "message": "Failed to fetch OIDC discovery document from https://auth.example.com/.well-known/openid-configuration. Ensure the Issuer URL is correct and the provider is reachable.",
  "code": "DISCOVERY_FAILED"
}
```

Client credentials failure:
```json
{
  "status": "error",
  "message": "OIDC provider rejected the client credentials. Verify the Client ID and Client Secret are correct.",
  "code": "CLIENT_AUTH_FAILED"
}
```

**Test procedure** (server-side):

1. Fetch `{issuerUrl}/.well-known/openid-configuration`.
2. Validate the response contains required OIDC fields (`authorization_endpoint`,
   `token_endpoint`, `jwks_uri`).
3. Attempt a client credentials or introspection call to validate client ID + secret
   (if the provider supports it). If the provider does not support client credentials
   grant, the test validates discovery only and reports that client authentication
   will be verified on first login.

---

## 3. Public Settings Extension

The existing public settings endpoint already returns `FullPublicSettings`. The
following fields are added:

```
GET /api/v1/settings/public
```

**New fields in response**:

```json
{
  "oidcEnabled": true,
  "oidcProviderName": "Authentik"
}
```

These are computed from `OidcSettings` (never expose secret fields):

- `oidcEnabled`: `oidc.enabled && oidc.issuerUrl !== '' && oidc.clientId !== ''`
- `oidcProviderName`: `oidc.displayName || 'OIDC'`

---

## 4. Type Definitions

### OidcSettingsInput (request body validation)

```typescript
interface OidcSettingsInput {
  enabled: boolean;
  issuerUrl: string;
  clientId: string;
  clientSecret?: string;        // Optional on update (preserve existing)
  displayName: string;
  autoCreateUsers: boolean;
  groupClaimName: string;
  defaultPermissions: number;
  groupMappings: OidcGroupMappingInput[];
}

interface OidcGroupMappingInput {
  oidcGroup: string;
  permissions: number;
}
```

### OidcTestInput (test endpoint body)

```typescript
interface OidcTestInput {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
}
```

### OidcTestResult (test endpoint response)

```typescript
interface OidcTestResult {
  status: 'success' | 'error';
  message: string;
  code?: string;
  details?: {
    issuer: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    userinfoEndpoint: string;
    supportedScopes: string[];
  };
}
```

---

## 5. Error Codes Reference

| Code | HTTP Status | Context | User-facing message |
|------|------------|---------|-------------------|
| `oidc_provider_error` | 302 (redirect) | Callback | "The identity provider returned an error: {description}" |
| `oidc_state_mismatch` | 302 (redirect) | Callback | "Authentication failed due to a security check. Please try again." |
| `oidc_missing_email` | 302 (redirect) | Callback | "Your identity provider did not include an email address. Please configure it to include the email claim." |
| `oidc_no_account` | 302 (redirect) | Callback | "No account found. Please contact your administrator to create an account." |
| `oidc_token_error` | 302 (redirect) | Callback | "Failed to complete authentication. Please try again." |
| `oidc_provider_unreachable` | 302 (redirect) | Callback | "Could not reach the identity provider. Please try again later." |
| `DISCOVERY_FAILED` | 400 | Test | See test endpoint response above |
| `CLIENT_AUTH_FAILED` | 400 | Test | See test endpoint response above |

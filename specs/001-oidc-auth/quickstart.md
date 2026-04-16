# Developer Quickstart: OIDC Authentication

**Feature Branch**: `001-oidc-auth` | **Date**: 2026-04-16

This guide covers how to set up a local development environment for testing OIDC
authentication with Allseerr.

---

## Prerequisites

- Docker and Docker Compose installed
- Node.js (version from `.nvmrc`) and pnpm installed
- Allseerr development environment running (`pnpm dev`)

---

## Option A: Authentik (Recommended for Homelab Testing)

Authentik is the most common OIDC provider in the homelab community.

### 1. Start Authentik via Docker Compose

Create a `docker-compose.oidc.yml` in your working directory (not committed to the
repo):

```yaml
services:
  authentik-db:
    image: docker.io/library/postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: authentik
      POSTGRES_USER: authentik
      POSTGRES_PASSWORD: authentik-dev-password
    volumes:
      - authentik-db:/var/lib/postgresql/data

  authentik-redis:
    image: docker.io/library/redis:7-alpine
    restart: unless-stopped

  authentik-server:
    image: ghcr.io/goauthentik/server:latest
    restart: unless-stopped
    command: server
    environment:
      AUTHENTIK_SECRET_KEY: dev-secret-key-change-me-in-prod
      AUTHENTIK_REDIS__HOST: authentik-redis
      AUTHENTIK_POSTGRESQL__HOST: authentik-db
      AUTHENTIK_POSTGRESQL__USER: authentik
      AUTHENTIK_POSTGRESQL__PASSWORD: authentik-dev-password
      AUTHENTIK_POSTGRESQL__NAME: authentik
    ports:
      - "9000:9000"
      - "9443:9443"
    depends_on:
      - authentik-db
      - authentik-redis

  authentik-worker:
    image: ghcr.io/goauthentik/server:latest
    restart: unless-stopped
    command: worker
    environment:
      AUTHENTIK_SECRET_KEY: dev-secret-key-change-me-in-prod
      AUTHENTIK_REDIS__HOST: authentik-redis
      AUTHENTIK_POSTGRESQL__HOST: authentik-db
      AUTHENTIK_POSTGRESQL__USER: authentik
      AUTHENTIK_POSTGRESQL__PASSWORD: authentik-dev-password
      AUTHENTIK_POSTGRESQL__NAME: authentik
    depends_on:
      - authentik-db
      - authentik-redis

volumes:
  authentik-db:
```

```bash
docker compose -f docker-compose.oidc.yml up -d
```

### 2. Initial Authentik Setup

1. Open `http://localhost:9000/if/flow/initial-setup/`
2. Create the admin account (e.g., `akadmin` / `password`)
3. Navigate to **Admin Interface** (top-right gear icon)

### 3. Create an OIDC Application in Authentik

1. Go to **Applications > Providers** and click **Create**
2. Select **OAuth2/OpenID Provider**
3. Configure:
   - **Name**: `allseerr`
   - **Authorization flow**: `default-provider-authorization-implicit-consent`
   - **Client type**: Confidential
   - **Client ID**: `allseerr` (auto-generated, note this)
   - **Client Secret**: (auto-generated, note this)
   - **Redirect URIs/Origins**: `http://localhost:5055/api/v1/auth/oidc/callback`
   - **Scopes**: `openid`, `email`, `profile`
   - **Subject mode**: Based on the user's username
4. Click **Finish**

5. Go to **Applications > Applications** and click **Create**
   - **Name**: `Allseerr`
   - **Slug**: `allseerr`
   - **Provider**: Select `allseerr` (created above)
6. Click **Create**

### 4. Configure Group Claims (Optional, for Group Mapping Testing)

1. Go to **Directory > Groups** and create groups:
   - `allseerr-admins`
   - `allseerr-users`
2. Assign test users to these groups

3. Create a custom scope to include groups in tokens:
   - Go to **Customization > Property Mappings** and click **Create**
   - Select **Scope Mapping**
   - **Name**: `allseerr-groups`
   - **Scope name**: `groups`
   - **Expression**:
     ```python
     return [group.name for group in request.user.ak_groups.all()]
     ```
4. Go to **Applications > Providers** and edit the `allseerr` provider
5. Under **Advanced protocol settings > Scopes**, add the `allseerr-groups` mapping

### 5. Configure Allseerr

With your dev server running (`pnpm dev` on port 5055):

1. Log in as admin
2. Navigate to **Settings > OIDC** (once the UI is implemented)
3. Enter:
   - **Issuer URL**: `http://localhost:9000/application/o/allseerr/`
   - **Client ID**: (from step 3)
   - **Client Secret**: (from step 3)
   - **Display Name**: `Authentik`
   - **Auto-create users**: Enabled
4. Save

### 6. Test Login

1. Open an incognito window and navigate to `http://localhost:5055/login`
2. Click "Sign in with Authentik"
3. Authenticate with an Authentik user
4. Verify you are redirected to the Allseerr dashboard

---

## Option B: Keycloak

### 1. Start Keycloak

```yaml
# Add to docker-compose.oidc.yml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:latest
    command: start-dev
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: admin
    ports:
      - "8080:8080"
```

```bash
docker compose -f docker-compose.oidc.yml up -d keycloak
```

### 2. Configure Keycloak

1. Open `http://localhost:8080` and log in as `admin`/`admin`
2. Create a new realm: `allseerr` (or use `master`)
3. Go to **Clients** and click **Create client**:
   - **Client type**: OpenID Connect
   - **Client ID**: `allseerr`
   - **Client authentication**: ON (confidential)
   - **Valid redirect URIs**: `http://localhost:5055/api/v1/auth/oidc/callback`
   - **Web origins**: `http://localhost:5055`
4. Note the **Client Secret** from the **Credentials** tab

### 3. Create Test Users and Groups

1. Go to **Groups** and create `allseerr-admins` and `allseerr-users`
2. Go to **Users** and create test users, assigning them to groups
3. To include groups in tokens:
   - Go to **Client scopes** > `allseerr-dedicated` > **Mappers**
   - Add a mapper: **Group Membership**
   - **Token claim name**: `groups`
   - **Full group path**: OFF

### 4. Configure Allseerr

- **Issuer URL**: `http://localhost:8080/realms/allseerr`
  (or `http://localhost:8080/realms/master` if using master realm)
- **Client ID**: `allseerr`
- **Client Secret**: (from Keycloak credentials tab)
- **Display Name**: `Keycloak`

---

## Option C: Mock OIDC Provider (For Automated Tests)

For unit and integration tests, use a mock OIDC provider that runs in-process.

### Using `oidc-provider` (npm package)

```bash
pnpm add -D oidc-provider
```

Create a test helper at `server/lib/adapters/oidc/__tests__/mockOidcProvider.ts`:

```typescript
import Provider from 'oidc-provider';

export async function createMockOidcProvider(port: number): Promise<{
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  close: () => Promise<void>;
}> {
  const provider = new Provider(`http://localhost:${port}`, {
    clients: [
      {
        client_id: 'test-client',
        client_secret: 'test-secret',
        redirect_uris: ['http://localhost:5055/api/v1/auth/oidc/callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
      },
    ],
    claims: {
      openid: ['sub'],
      email: ['email', 'email_verified'],
      profile: ['name', 'picture'],
      groups: ['groups'],
    },
    // Test accounts
    async findAccount(_ctx, id) {
      return {
        accountId: id,
        async claims() {
          return {
            sub: id,
            email: `${id}@test.local`,
            name: `Test User ${id}`,
            groups: ['allseerr-users'],
          };
        },
      };
    },
  });

  const server = provider.listen(port);

  return {
    issuerUrl: `http://localhost:${port}`,
    clientId: 'test-client',
    clientSecret: 'test-secret',
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
```

---

## Verifying the Implementation

### Manual Test Checklist

1. **Admin config persists**: Configure OIDC, restart the dev server, verify settings
   are retained in `config/settings.json`.

2. **Login button visibility**: With OIDC enabled, the login page shows the OIDC button.
   Disable OIDC, refresh -- button is gone. Existing Plex/Jellyfin buttons always visible.

3. **New user creation**: Log in with an OIDC user that has no Allseerr account.
   Verify a new user appears in the user list with `UserType.OIDC`.

4. **Email matching**: Create a local user with email `test@example.com`. Log in via
   OIDC with the same email. Verify the existing account is linked (not a duplicate).

5. **Token expiry**: Log in via OIDC. Wait for the token to expire (or set a short
   expiry in the IdP). Verify the next API request returns 403 and the user is
   redirected to login.

6. **Group mapping**: Configure group mappings. Log in with a user in the
   `allseerr-admins` group. Verify they receive admin permissions. Remove the user
   from the group in the IdP, log in again, verify permissions are downgraded.

7. **Connection test**: Enter valid OIDC config, click "Test Connection", verify
   success. Enter an invalid issuer URL, click test, verify specific error message.

8. **Disable without disruption**: Create a user via OIDC. Disable OIDC. Verify the
   user account still exists in the database. Re-enable OIDC, verify the user can
   log in again.

### Useful Debug Commands

```bash
# Check settings.json for OIDC config
cat config/settings.json | jq '.oidc'

# Check user table for OIDC-linked users
# (SQLite)
sqlite3 config/db/db.sqlite3 "SELECT id, email, userType, oidcSub FROM user WHERE oidcSub IS NOT NULL;"

# Check active sessions
sqlite3 config/db/db.sqlite3 "SELECT * FROM session;"

# Tail logs for OIDC-related entries
pnpm dev 2>&1 | grep -i oidc
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "OIDC authentication is not configured" | Missing issuer URL or client ID | Check Settings > OIDC config |
| Redirect loop on callback | Incorrect redirect URI in IdP | Ensure redirect URI is exactly `http://localhost:5055/api/v1/auth/oidc/callback` |
| "Failed to fetch discovery document" | IdP not reachable from Node.js | Check Docker networking; ensure the IdP URL is accessible from the host, not just the browser |
| "email claim missing" | IdP not configured to include email | Add `email` scope to the OIDC provider config in the IdP |
| Session expires immediately | Clock skew between Allseerr and IdP | Sync clocks; check `exp` claim in the ID token |
| Groups not mapping | Wrong claim name | Check the IdP's token contents (decode the JWT at jwt.io) and match the claim name in Allseerr settings |

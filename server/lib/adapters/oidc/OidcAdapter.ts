import logger from '@server/logger';
import type { Client, Issuer as OidcIssuer, TokenSet } from 'openid-client';
import { Issuer } from 'openid-client';

export interface OidcAuthResult {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  groups?: string[];
  idTokenExpiry: number;
}

export interface OidcTestResult {
  status: 'success' | 'error';
  message: string;
  details?: Record<string, string>;
  code?: string;
}

interface OidcAdapterConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
}

export class OidcAdapter {
  private config: OidcAdapterConfig;
  private cachedIssuer?: OidcIssuer;
  private cachedClient?: Client;

  constructor(config: OidcAdapterConfig) {
    this.config = config;
  }

  /**
   * Fetches the OIDC discovery document and caches the Issuer instance.
   * Clears cache on error to force re-fetch on retry.
   */
  async discover(): Promise<OidcIssuer> {
    if (this.cachedIssuer) {
      return this.cachedIssuer;
    }

    try {
      this.cachedIssuer = await Issuer.discover(this.config.issuerUrl);
      logger.info('OIDC discovery completed successfully', {
        label: 'oidc',
        issuer: this.cachedIssuer.metadata.issuer,
      });
      return this.cachedIssuer;
    } catch (e) {
      this.cachedIssuer = undefined;
      this.cachedClient = undefined;
      logger.error('OIDC discovery failed', {
        label: 'oidc',
        issuerUrl: this.config.issuerUrl,
        error: e instanceof Error ? e.message : String(e),
      });
      throw new Error(
        `OIDC discovery failed for ${this.config.issuerUrl}: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  private async getClient(): Promise<Client> {
    if (this.cachedClient) {
      return this.cachedClient;
    }

    const issuer = await this.discover();
    this.cachedClient = new issuer.Client({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      response_types: ['code'],
    });
    return this.cachedClient;
  }

  /**
   * Generates the authorization URL for redirecting the user to the IdP.
   */
  async getAuthorizationUrl(
    redirectUri: string,
    state: string,
    nonce: string
  ): Promise<string> {
    const client = await this.getClient();
    return client.authorizationUrl({
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state,
      nonce,
      response_type: 'code',
    });
  }

  /**
   * Handles the OIDC callback: exchanges the authorization code for tokens
   * and extracts user claims including groups.
   */
  async handleCallback(
    redirectUri: string,
    callbackParams: Record<string, string>,
    checks: { state: string; nonce: string },
    groupClaimName: string
  ): Promise<OidcAuthResult> {
    const client = await this.getClient();

    let tokenSet: TokenSet;
    try {
      tokenSet = await client.callback(redirectUri, callbackParams, {
        state: checks.state,
        nonce: checks.nonce,
      });
    } catch (e) {
      logger.error('OIDC token exchange failed', {
        label: 'oidc',
        error: e instanceof Error ? e.message : String(e),
      });
      throw new Error(
        `OIDC token exchange failed: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }

    const claims = tokenSet.claims();

    if (!claims.email) {
      logger.warn('OIDC token missing email claim', {
        label: 'oidc',
        sub: claims.sub,
      });
      throw new Error(
        'OIDC provider did not return an email claim. ' +
          'Configure your identity provider to include the email claim in ID tokens.'
      );
    }

    // Extract groups from ID token claims first, then try userinfo
    let groups: string[] | undefined;
    const groupClaim = claims[groupClaimName];

    if (Array.isArray(groupClaim)) {
      groups = groupClaim as string[];
    } else if (typeof groupClaim === 'string') {
      groups = [groupClaim];
    } else {
      // Try userinfo endpoint as fallback
      try {
        const userinfo = await client.userinfo(tokenSet);
        const userinfoGroups = userinfo[groupClaimName];
        if (Array.isArray(userinfoGroups)) {
          groups = userinfoGroups as string[];
        } else if (typeof userinfoGroups === 'string') {
          groups = [userinfoGroups];
        }
      } catch (e) {
        logger.debug('OIDC userinfo fetch failed (non-fatal)', {
          label: 'oidc',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const idTokenExpiry = claims.exp ?? Math.floor(Date.now() / 1000) + 3600;

    return {
      sub: claims.sub,
      email: claims.email as string,
      name: claims.name as string | undefined,
      picture: claims.picture as string | undefined,
      groups,
      idTokenExpiry,
    };
  }

  /**
   * Tests OIDC configuration without saving. Validates discovery document
   * and optionally tests client credentials.
   */
  static async testConnection(config: {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
  }): Promise<OidcTestResult> {
    try {
      const issuer = await Issuer.discover(config.issuerUrl);

      const metadata = issuer.metadata;
      if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
        return {
          status: 'error',
          message:
            'Discovery document is missing required endpoints ' +
            '(authorization_endpoint or token_endpoint).',
          code: 'INCOMPLETE_DISCOVERY',
        };
      }

      // Try client credentials grant to validate client ID/secret
      try {
        const client = new issuer.Client({
          client_id: config.clientId,
          client_secret: config.clientSecret,
        });
        await client.grant({ grant_type: 'client_credentials' });
      } catch {
        // Many IdPs don't support client_credentials grant;
        // discovery success is sufficient
        logger.debug(
          'OIDC client_credentials grant not supported (non-fatal)',
          { label: 'oidc' }
        );
      }

      return {
        status: 'success',
        message: `Successfully connected to OIDC provider at ${metadata.issuer}`,
        details: {
          issuer: metadata.issuer as string,
          authorizationEndpoint: metadata.authorization_endpoint as string,
          tokenEndpoint: metadata.token_endpoint as string,
          jwksUri: (metadata.jwks_uri as string) ?? 'not provided',
        },
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error('OIDC test connection failed', {
        label: 'oidc',
        issuerUrl: config.issuerUrl,
        error: message,
      });
      return {
        status: 'error',
        message: `Failed to connect to OIDC provider: ${message}`,
        code: 'DISCOVERY_FAILED',
      };
    }
  }
}

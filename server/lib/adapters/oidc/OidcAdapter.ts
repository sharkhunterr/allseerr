import logger from '@server/logger';
import * as oidc from 'openid-client';

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
  private cachedConfig?: oidc.Configuration;

  constructor(config: OidcAdapterConfig) {
    this.config = config;
  }

  /**
   * Discovers the OIDC provider and creates a Configuration instance.
   * Caches the result. Clears cache on error to force re-fetch on retry.
   */
  async getConfiguration(): Promise<oidc.Configuration> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    try {
      this.cachedConfig = await oidc.discovery(
        new URL(this.config.issuerUrl),
        this.config.clientId,
        this.config.clientSecret
      );
      logger.info('OIDC discovery completed successfully', {
        label: 'oidc',
      });
      return this.cachedConfig;
    } catch (e) {
      this.cachedConfig = undefined;
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

  /**
   * Generates the authorization URL for redirecting the user to the IdP.
   */
  async getAuthorizationUrl(
    redirectUri: string,
    state: string,
    nonce: string
  ): Promise<string> {
    const config = await this.getConfiguration();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state,
      nonce,
    });
    return url.href;
  }

  /**
   * Handles the OIDC callback: exchanges the authorization code for tokens
   * and extracts user claims including groups.
   */
  async handleCallback(
    redirectUri: string,
    callbackUrl: URL,
    checks: { state: string; nonce: string },
    groupClaimName: string
  ): Promise<OidcAuthResult> {
    const config = await this.getConfiguration();

    let tokens: oidc.TokenEndpointResponse;
    try {
      tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        expectedState: checks.state,
        expectedNonce: checks.nonce,
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

    const claims = tokens.claims();

    if (!claims) {
      throw new Error('OIDC provider did not return ID token claims.');
    }

    const email = claims.email as string | undefined;
    if (!email) {
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
        const userinfo = await oidc.fetchUserInfo(
          config,
          tokens.access_token,
          claims.sub
        );
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
      email,
      name: claims.name as string | undefined,
      picture: claims.picture as string | undefined,
      groups,
      idTokenExpiry,
    };
  }

  /**
   * Tests OIDC configuration without saving. Validates discovery document.
   */
  static async testConnection(config: {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
  }): Promise<OidcTestResult> {
    try {
      const oidcConfig = await oidc.discovery(
        new URL(config.issuerUrl),
        config.clientId,
        config.clientSecret
      );

      const serverMetadata = oidcConfig.serverMetadata();

      if (
        !serverMetadata.authorization_endpoint ||
        !serverMetadata.token_endpoint
      ) {
        return {
          status: 'error',
          message:
            'Discovery document is missing required endpoints ' +
            '(authorization_endpoint or token_endpoint).',
          code: 'INCOMPLETE_DISCOVERY',
        };
      }

      return {
        status: 'success',
        message: `Successfully connected to OIDC provider at ${serverMetadata.issuer}`,
        details: {
          issuer: serverMetadata.issuer as string,
          authorizationEndpoint:
            serverMetadata.authorization_endpoint as string,
          tokenEndpoint: serverMetadata.token_endpoint as string,
          jwksUri: (serverMetadata.jwks_uri as string) ?? 'not provided',
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

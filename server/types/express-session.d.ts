import 'express-session';

// Declaration merging to apply our own types to SessionData
// See: (https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/express-session/index.d.ts#L23)
declare module 'express-session' {
  interface SessionData {
    userId: number;
    /** Unix timestamp in seconds; set only for OIDC sessions */
    oidcTokenExpiry?: number;
    /** OIDC state parameter for CSRF protection during auth flow */
    oidcState?: string;
    /** OIDC nonce for token replay protection */
    oidcNonce?: string;
  }
}

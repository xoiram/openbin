import { config } from './config.js';
import { ForbiddenError } from './httpErrors.js';

/**
 * Throws when REQUIRE_OIDC_LOGIN=true. Call at the top of every route that
 * creates, verifies, or resets a password — login, register,
 * forgot/reset-password, and set/change password — before any DB query.
 */
export function requirePasswordAuthEnabled(): void {
  if (config.requireOidcLogin) {
    throw new ForbiddenError(
      "Password sign-in is disabled on this instance. Please sign in with your organization's SSO provider."
    );
  }
}

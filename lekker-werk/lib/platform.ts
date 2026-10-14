/**
 * Platform operators (The Web Daddy). Any account on this domain is made SUPER_ADMIN at signup
 * and at every login. NOTE: signup does not verify email ownership, so anyone who can register
 * an address on this domain gets platform access; add email verification before relying on it.
 */
export const PLATFORM_EMAIL_DOMAIN = "thewebdaddy.co.za";

export function isPlatformEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${PLATFORM_EMAIL_DOMAIN}`);
}

/**
 * Platform operators (The Web Daddy). Only accounts on this domain can be made SUPER_ADMIN, and
 * only by someone with database access running `npm run platform:admin -- grant <email>`.
 * Signup and login never grant platform access: signup does not verify email ownership, and a
 * company admin can create users with any address.
 */
export const PLATFORM_EMAIL_DOMAIN = "thewebdaddy.co.za";

export function isPlatformEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${PLATFORM_EMAIL_DOMAIN}`);
}

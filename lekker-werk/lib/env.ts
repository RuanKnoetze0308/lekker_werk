import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get encryptionKey() {
    return required("APP_ENCRYPTION_KEY");
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
  get whatsappAppSecret() {
    return process.env.WHATSAPP_APP_SECRET ?? "";
  },
  get whatsappVerifyToken() {
    return process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  },
  /**
   * Meta Graph API version. Meta retires versions ~2 years after their successor ships, so this
   * is configuration, not code. Check developers.facebook.com/docs/graph-api/changelog yearly.
   */
  get whatsappGraphVersion() {
    return process.env.WHATSAPP_GRAPH_VERSION || "v26.0";
  },
  /**
   * The shared LekkerWerk WhatsApp number every company can use without its own Meta setup.
   * Empty until the Meta Business account is approved.
   */
  get whatsappShared() {
    return {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
      displayNumber: (process.env.WHATSAPP_DISPLAY_NUMBER ?? "").replace(/\D/g, ""),
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
    };
  },
  get payfast() {
    const mode = (process.env.PAYFAST_MODE ?? "live") === "sandbox" ? "sandbox" : "live";
    return {
      merchantId: process.env.PAYFAST_MERCHANT_ID ?? "",
      merchantKey: process.env.PAYFAST_MERCHANT_KEY ?? "",
      passphrase: process.env.PAYFAST_PASSPHRASE ?? "",
      mode: mode as "live" | "sandbox",
      host: mode === "sandbox" ? "sandbox.payfast.co.za" : "www.payfast.co.za",
      // Local testing of ITN logic only. Ignored in production.
      skipRemoteChecks: process.env.NODE_ENV !== "production" && process.env.PAYFAST_SKIP_REMOTE_CHECKS === "1",
      allowLocalLive: process.env.PAYFAST_ALLOW_LOCAL_LIVE === "1",
    };
  },
  /** Where new integration requests are emailed for quoting. Optional. */
  get opsEmail() {
    return process.env.OPS_EMAIL ?? "";
  },
  /**
   * Chat and device simulators (fake transports that drive the real pipeline). On by default in
   * development; in production only if explicitly enabled for a demo environment.
   */
  get simulatorsEnabled() {
    return process.env.NODE_ENV !== "production" || process.env.ENABLE_SIMULATORS === "1";
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
};

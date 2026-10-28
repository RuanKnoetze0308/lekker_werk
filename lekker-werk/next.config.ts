import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Dev only: lets a temporary Cloudflare quick tunnel (phone testing) load the dev server.
  // Has no effect on production builds.
  allowedDevOrigins: ["*.trycloudflare.com"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }];
  },
};

export default nextConfig;

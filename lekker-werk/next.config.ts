import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets a temporary Cloudflare quick tunnel (phone testing) load the dev server.
  // Has no effect on production builds.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;

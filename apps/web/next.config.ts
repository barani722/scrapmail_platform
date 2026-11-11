import path from "node:path";
import type { NextConfig } from "next";

// Extra hosts allowed to open the *dev* server (e.g. this machine's public IP),
// comma-separated in DEV_ALLOWED_ORIGINS. Has no effect on production builds.
const devAllowedOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: devAllowedOrigins,
  reactStrictMode: true,
  poweredByHeader: false,
  // Don't generate AGENTS.md files during `next dev`.
  agentRules: false,
  // Monorepo: the pnpm workspace root is two levels up.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;

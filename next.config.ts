import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone for the container image (Vercel ignores this and
  // uses its own build output). Keeps the image small and removes any need to
  // ship node_modules or run `npm install` at deploy time.
  output: "standalone",

};

export default nextConfig;

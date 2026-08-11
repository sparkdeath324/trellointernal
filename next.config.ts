import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone: a self-contained server plus only the node_modules
  // it actually needs. Keeps the container image small and removes any need to
  // ship a full node_modules or run `npm install` at deploy time.
  output: "standalone",

  // better-sqlite3 is a native addon — it must stay outside the server bundle.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

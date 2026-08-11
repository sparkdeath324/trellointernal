import type { NextConfig } from "next";

/**
 * `output: "standalone"` produces the self-contained server the container image
 * runs (see Dockerfile). Vercel must NOT get it: standalone mode consumes the
 * `.nft.json` file-trace manifests that Vercel's own build pipeline reads, and
 * the deploy dies with
 *
 *   ENOENT: no such file or directory, open '.next/next-server.js.nft.json'
 *
 * Vercel sets VERCEL=1 during the build, so key off that and let it use the
 * default output there.
 */
const isVercelBuild = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  ...(isVercelBuild ? {} : { output: "standalone" as const }),
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this project (a stray lockfile higher up confuses inference).
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@reckon-protocol/types"],
};

export default nextConfig;

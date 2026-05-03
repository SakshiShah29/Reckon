import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@reckon-protocol/types"],
  webpack: (config) => {
    // The types package uses .js extensions in imports (required by NodeNext
    // module resolution for tsc), but the actual files are .ts. Tell webpack
    // to try .ts before .js so the source files resolve correctly.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".js"],
    };
    return config;
  },
};

export default nextConfig;

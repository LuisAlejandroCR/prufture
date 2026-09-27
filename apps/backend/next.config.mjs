// next.config.mjs: Next.js config for the dashboard / public site.
// Transpiles the shared @proof/core workspace package, which ships TypeScript source.
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@proof/core"],
  env: {
    API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787",
  },
};
export default nextConfig;

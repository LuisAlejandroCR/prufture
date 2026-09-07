// next.config.mjs: transpile the shared workspace package.
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@proof/core"],
  env: {
    API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787",
  },
};
export default nextConfig;

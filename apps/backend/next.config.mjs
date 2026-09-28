// next.config.mjs: Next.js config for the dashboard / public site. Transpiles the shared @proof/core
// package, which ships TypeScript source with NodeNext-style `./x.js` imports; webpack needs the
// extension alias to resolve those to the `.ts` files, or `next build` fails.
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@proof/core"],
  env: {
    API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787",
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
export default nextConfig;

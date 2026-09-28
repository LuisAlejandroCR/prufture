// metro.config.js: monorepo-aware Metro config for apps/frontend — watches the workspace root,
// resolves hoisted node_modules, enables package exports, and maps @proof/core's Node-ESM ".js"
// specifiers back to the ".ts"/".tsx" source that Metro would otherwise fail to resolve.

const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const coreRoot = path.resolve(workspaceRoot, "packages/core");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

// Other apps' build output churns while Metro watches the whole workspace; a folder deleted under the
// watcher crashes it (ENOENT on apps/backend/.next), so never crawl build dirs.
config.resolver.blockList = [/[\\/]\.next[\\/].*/, /[\\/]apps[\\/]api[\\/]\.data[\\/].*/];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.unstable_enablePackageExports = true;

// @proof/core ships Node-ESM-correct ".js" specifiers on ".ts" source. tsc, tsx
// and Next resolve those to the sibling ".ts"; Metro does not. Retry any ".js"
// request that lands under packages/core as ".ts"/".tsx" before giving up.
const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolveRequest || context.resolveRequest;

  if (moduleName.endsWith(".js") && (moduleName.startsWith("./") || moduleName.startsWith("../"))) {
    const fromDir = path.dirname(context.originModulePath || "");
    const target = path.resolve(fromDir, moduleName);
    if (target.startsWith(coreRoot)) {
      const base = moduleName.slice(0, -3);
      for (const ext of [".ts", ".tsx"]) {
        try {
          return resolve(context, base + ext, platform);
        } catch (_e) {
          // fall through to the next extension / the original request
        }
      }
    }
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;

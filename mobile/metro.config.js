const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// The API client is shared with the web app (packages/api). It has no
// dependencies, so Metro only needs to watch that folder and map the import.
const apiSrc = path.resolve(__dirname, '../packages/api/src');
config.watchFolders = [...(config.watchFolders ?? []), apiSrc];
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@easioprotect/api') {
    return { type: 'sourceFile', filePath: path.join(apiSrc, 'index.ts') };
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });

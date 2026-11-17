const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const engine = path.resolve(__dirname, '../packages/risk-engine');

/**
 * O motor de risco vive em ../packages/risk-engine (compartilhado com a API).
 * Rode `npm run build` na raiz antes, para gerar o dist/ que o Metro consome.
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [engine],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    unstable_enableSymlinks: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

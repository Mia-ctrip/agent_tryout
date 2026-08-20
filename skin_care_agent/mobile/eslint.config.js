// https://docs.expo.dev/guides/using-eslint/
const path = require('node:path');
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const expoConfigDirectory = path.dirname(
  require.resolve('eslint-config-expo/flat'),
);
const typescriptResolver = require.resolve(
  'eslint-import-resolver-typescript',
  { paths: [expoConfigDirectory] },
);
const resolvedExpoConfig = expoConfig.map((config) => {
  const resolvers = config.settings?.['import/resolver'];
  if (!resolvers || !Object.hasOwn(resolvers, 'typescript')) {
    return config;
  }

  const { typescript, ...otherResolvers } = resolvers;
  return {
    ...config,
    settings: {
      ...config.settings,
      'import/resolver': {
        ...otherResolvers,
        [typescriptResolver]: typescript,
      },
    },
  };
});

module.exports = defineConfig([
  resolvedExpoConfig,
  {
    ignores: ['dist/*'],
  },
]);

const {
  override,
  addWebpackAlias,
  adjustStyleLoaders,
  fixBabelImports,
  addBabelPlugin,
  removeModuleScopePlugin,
} = require('customize-cra');
const webpack = require('webpack');
const path = require('path');
const fs = require('fs');

function Found() {}

function searchLinked(dir, scope) {
  dir = dir || '.';
  const context = path.resolve(dir);
  if (!fs.existsSync(context)) return [];
  const contents = fs.readdirSync(context);
  return contents.reduce(function (accumulated, name) {
    const relative = path.join(dir, name);
    const isScoped = name.charAt(0) === '@';
    if (isScoped) {
      return accumulated.concat(searchLinked(relative, name));
    }
    const found = new Found();
    found.name = scope ? scope + '/' + name : name;
    found.path = path.resolve(relative);
    if (scope) found.scope = scope;
    if (is(relative)) found.link = read(relative);
    accumulated.push(found);
    return accumulated;
  }, []);
}

function read(p) {
  return path.resolve(fs.readlinkSync(path.resolve(p)));
}

function pluck(found) {
  return found[this];
}

function root(dir) {
  return path.join(dir || '.', 'node_modules');
}

function links(dir) {
  return searchLinked(root(dir)).filter(is).map(pluck, 'link');
}

function is(p) {
  if (p instanceof Found) return p.hasOwnProperty('link');
  return fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink();
}

const setupNodePolyfills = (config) => {
  const fallback = config.resolve.fallback || {};
  Object.assign(fallback, {
    fs: false,
    child_process: false,
    net: false,
    tls: false,
    crypto: require.resolve('crypto-browserify'),
    stream: require.resolve('stream-browserify'),
    assert: require.resolve('assert'),
    http: require.resolve('stream-http'),
    https: require.resolve('https-browserify'),
    os: require.resolve('os-browserify'),
    url: require.resolve('url'),
  });
  config.resolve.fallback = fallback;
  config.plugins = (config.plugins || []).concat([
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ]);
  return config;
};

const addAliases = (config) => {
  const linkedPackages = process.env !== 'production' && links(__dirname);
  const defaultAliases = {
    '@': path.resolve(__dirname, 'src'),
    path: require.resolve('path-browserify'),
  };

  const hasLinkedPackages = linkedPackages && linkedPackages.length > 0;

  const aliases = hasLinkedPackages
    ? {
        ...defaultAliases,
        react: path.resolve(__dirname, 'node_modules', 'react'),
        'react-dom': path.resolve(__dirname, 'node_modules', 'react-dom'),
      }
    : defaultAliases;

  if (hasLinkedPackages) {
    console.log('Starting with linked packages:\n', linkedPackages.join('\n'));
  }

  return addWebpackAlias(aliases)(config);
};

module.exports = {
  webpack: override(
    fixBabelImports('import', {
      libraryName: 'antd',
      libraryDirectory: 'es',
      style: true,
    }),
    removeModuleScopePlugin(),
    adjustStyleLoaders(({ use: [, , postcss] }) => {
      const postcssOptions = postcss.options;
      postcss.options = { postcssOptions };
    }),
    setupNodePolyfills,
    addAliases,
    fixBabelImports('@mui/material', {
      libraryName: '@mui/material',
      camel2DashComponentName: false,
      customName: (name) => {
        const MuiDeepExports = {
          tableCellClasses: '@mui/material/TableCell/tableCellClasses',
        };

        return MuiDeepExports[name] || `@mui/material/${name}`;
      },
    }),
    addBabelPlugin([
      'babel-plugin-import',
      {
        libraryName: '@mui/icons-material',
        libraryDirectory: '',
        camel2DashComponentName: false,
      },
      'icons',
    ]),
  ),
};

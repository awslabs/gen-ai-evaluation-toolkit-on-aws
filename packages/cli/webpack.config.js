/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-require-imports */
const process = require('process');
const path = require('path');
const { TsconfigPathsPlugin } = require('tsconfig-paths-webpack-plugin');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const isWatch = process.env.WEBPACK_WATCH === 'true';

module.exports = {
  entry: './src/main.ts',
  target: ['node', 'es2022'],
  mode: 'production',
  externalsPresets: {
    node: true,
  },
  externals: {
    // Bundle the client but keep other node modules external
    '@awssolutions/gen-ai-evaluation-toolkit-client': false,
  },
  watchOptions: {
    ignored: /node_modules/,
    aggregateTimeout: 50,
    poll: false,
    followSymlinks: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: [/node_modules/, /\.test\.ts$/, /jest\.config.+$/],
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: isWatch,
            configFile: path.resolve(__dirname, 'tsconfig.json'),
            experimentalWatchApi: true,
            compilerOptions: {
              noEmit: false,
            },
          },
        },
      },
    ],
  },
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  },
  resolve: {
    plugins: [
      new TsconfigPathsPlugin({
        configFile: path.resolve(__dirname, 'tsconfig.json'),
      }),
    ],
    extensions: ['.ts', '.js', '.mjs'],
    alias: {
      handlebars: 'handlebars/dist/handlebars.min.js',
    },
  },
  output: {
    filename: 'genai-etk',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: '#!/usr/bin/env node',
      raw: true,
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/templates/partials',
          to: 'partials',
        },
        {
          from: 'src/templates/views',
          to: 'views',
        },
        {
          from: 'assets',
          to: 'assets',
        },
      ],
    }),
  ],
  optimization: {
    moduleIds: 'deterministic',
    minimize: false,
    usedExports: true,
    sideEffects: true,
    chunkIds: 'deterministic',
  },
  devtool: 'source-map',
  stats: {
    errorDetails: true,
    cachedModules: true,
    reasons: true,
    cached: true,
    cachedAssets: true,
  },
};

/**
 * Webpack config for building project
 * https://webpack.js.org/
 */
const path = require('path');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');

module.exports = {
  devtool: 'source-map',
  entry: './app/index.js',
  output: {
    path: path.resolve(__dirname, './build'),
    filename: 'app.bundle.js'
  },
  module: {
    rules: [
      {
        test: /app\/.*\.(js|svelte\.html)$/,
        loader: 'babel-loader',
        options: {
          cacheDirectory: true
        }
      },
      {
        test: /app\/.*\.svelte\.html$/,
        exclude: /node_modules/,
        use: 'svelte-loader'
      }
    ]
  },
  plugins: [
    new UglifyJSPlugin({
      sourceMap: true
    })
  ]
};

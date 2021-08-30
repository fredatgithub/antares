const webpack = require('webpack');
const path = require('path');

module.exports = {
   stats: 'errors-warnings',
   entry: path.resolve('src/main', 'index.ts'),
   plugins: [
      new webpack.DefinePlugin({
         'process.env': {
            PACKAGE_VERSION: JSON.stringify(require('./package.json').version)
         }
      })
   ],
   module: {
      rules: [
         {
            test: /\.ts$/,
            exclude: 'node_modules',
            use: {
               loader: 'ts-loader'
            }
         },
         {
            test: /\.scss$/,
            use: [
               {
                  loader: 'sass-loader',
                  options: {
                     additionalData: '@import "@/scss/_variables.scss";'
                  }
               }
            ]
         }
      ]
   }
};

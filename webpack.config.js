const webpack = require('webpack');

module.exports = {
   stats: 'errors-warnings',
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
            test: /\.(ts|tsx)$/,
            exclude: /node_modules/,
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

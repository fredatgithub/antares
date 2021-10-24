/* eslint-env node */

import { chrome } from '../../electron-vendors.config.json';
import { join } from 'path';
import { builtinModules } from 'module';
import { createVuePlugin } from 'vite-plugin-vue2';

const PACKAGE_ROOT = __dirname;

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
   mode: process.env.MODE,
   root: PACKAGE_ROOT,
   resolve: {
      alias: {
         common: join(PACKAGE_ROOT, '../common'),
         '@/': PACKAGE_ROOT + '/',
         '~': '/node_modules/'
      }
   },
   plugins: [createVuePlugin()],
   base: '',
   server: {
      fs: {
         strict: true
      }
   },
   build: {
      sourcemap: true,
      target: `chrome${chrome}`,
      outDir: 'dist',
      assetsDir: '.',
      terserOptions: {
         ecma: 2020,
         compress: {
            passes: 2
         },
         safari10: false
      },
      rollupOptions: {
         external: [
            ...builtinModules
         ]
      },
      emptyOutDir: true,
      brotliSize: false
   },
   css: {
      preprocessorOptions: {
         scss: {
            additionalData: '@import "@/scss/_variables.scss";',
            includePaths: ['node_modules']
         }
      }
   }
};

export default config;

import { node } from '../../electron-vendors.config.json';
import { join, resolve } from 'path';
import { builtinModules } from 'module';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const PACKAGE_ROOT = __dirname;

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
   mode: process.env.MODE,
   root: PACKAGE_ROOT,
   envDir: process.cwd(),
   resolve: {
      alias: {
         common: join(PACKAGE_ROOT, '../common'),
         '@/': PACKAGE_ROOT + '/'
      }
   },
   build: {
      sourcemap: 'inline',
      target: `node${node}`,
      outDir: resolve(PACKAGE_ROOT, '../../dist/main'),
      assetsDir: '.',
      minify: process.env.MODE === 'development' ? false : 'terser',
      terserOptions: {
         ecma: 2020,
         compress: {
            passes: 2
         },
         safari10: false
      },
      lib: {
         entry: 'index.js',
         formats: ['cjs']
      },
      rollupOptions: {
         external: [
            'electron',
            'electron-devtools-installer',
            'pg-native',
            ...builtinModules
         ],
         output: {
            entryFileNames: 'index.js'
         },
         plugins: [
            commonjs(),
            nodeResolve({ preferBuiltins: false })
         ]
      },
      emptyOutDir: true,
      brotliSize: false
   }
};

export default config;

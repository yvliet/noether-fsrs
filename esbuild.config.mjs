import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');
const possibleSrcDirs = [
  path.resolve(__dirname, '../../src'),
  path.resolve(__dirname, '../noether/src'),
  path.resolve('c:/Users/sultan haikal/Downloads/noether/src'),
  path.resolve(__dirname, '../src'),
];
const srcDir = possibleSrcDirs.find((d) => fs.existsSync(d)) || path.resolve(__dirname, '../../src');

const buildOptions = {
  entryPoints: [path.join(__dirname, 'FsrsExtension.tsx')],
  bundle: true,
  outfile: path.join(__dirname, 'dist/main.js'),
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
    'clsx',
    'tailwind-merge',
    'zustand',
    'zustand/vanilla',
    '@hugeicons/*',
    '@hugeicons/react',
    '@hugeicons/core-free-icons',
    'zod',
    'ts-fsrs',
    'canvas-confetti',
    
    
    
    
    
    
    
  ],
  alias: {
    '@': srcDir,
  },
  minify: !isWatch,
  sourcemap: isWatch ? 'inline' : false,
};

async function run() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('[Watch] Watching for changes in Spaced Repetition (FSRS)...');
  } else {
    await esbuild.build(buildOptions);
    const stats = fs.statSync(path.join(__dirname, 'dist/main.js'));
    console.log(`[Build] Generated dist/main.js for Spaced Repetition (FSRS) (${(stats.size / 1024).toFixed(1)} KB)`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

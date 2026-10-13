import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist/assets', { recursive: true });
await build({ entryPoints: ['src/main.jsx'], bundle: true, outdir: 'dist/assets', entryNames: 'app', minify: true, sourcemap: true, jsx: 'automatic', target: ['es2020'], define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.svg': 'dataurl' } });
const entry = await readFile('index.html', 'utf8');
await writeFile('dist/index.html', entry.replaceAll('./dist/assets/', './assets/'));
console.log('Built dist/index.html — open directly or run the local server.');

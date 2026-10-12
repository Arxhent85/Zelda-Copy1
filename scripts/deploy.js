import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

console.log('📦 Building project for production...');
execSync('bun run build', { stdio: 'inherit' });

// Ensure .nojekyll in dist
fs.writeFileSync(path.join('dist', '.nojekyll'), '');

const tempDir = path.join(os.tmpdir(), `gh-pages-${Date.now()}`);
console.log('🚀 Preparing gh-pages bundle...');
fs.cpSync('dist', tempDir, { recursive: true });

execSync('git init', { cwd: tempDir, stdio: 'ignore' });
execSync('git checkout -b gh-pages', { cwd: tempDir, stdio: 'ignore' });
execSync('git config user.name "Arxhent85"', { cwd: tempDir, stdio: 'ignore' });
execSync('git config user.email "arxhent85@users.noreply.github.com"', { cwd: tempDir, stdio: 'ignore' });
execSync('git add -A', { cwd: tempDir, stdio: 'ignore' });
execSync('git commit -m "Deploy Hyrule Realms 3D to GitHub Pages"', { cwd: tempDir, stdio: 'ignore' });
execSync('git remote add origin https://github.com/Arxhent85/Zelda-Copy1.git', { cwd: tempDir, stdio: 'ignore' });

console.log('🌐 Pushing to GitHub gh-pages branch...');
execSync('git push origin gh-pages --force', { cwd: tempDir, stdio: 'inherit' });

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('✅ Successfully published to GitHub Pages!');
console.log('🎮 Play online: https://arxhent85.github.io/Zelda-Copy1/');

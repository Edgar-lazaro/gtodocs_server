/**
 * Prepara carpeta release-repo/ con dist + runtime para subir al repo remoto.
 * No incluye src/.
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release-repo');
const REMOTE_URL = process.env.RELEASE_REPO_URL || 'https://github.com/Edgar-lazaro/Gto_backend_v1.0.0.git';

function rmDirRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) rmDirRecursive(fp);
    else fs.unlinkSync(fp);
  }
  fs.rmdirSync(dir);
}

function copyRecursive(src, dest, skipPatterns) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src)) {
      if (skipPatterns && skipPatterns.some(p => f.endsWith(p))) continue;
      copyRecursive(path.join(src, f), path.join(dest, f), skipPatterns);
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function stripComments(str) {
  return str
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n');
}

function stripCommentsFromDir(dir, ext) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) {
      stripCommentsFromDir(fp, ext);
    } else if ((ext && f.endsWith(ext)) || (!ext && f.endsWith('.js'))) {
      const code = stripComments(fs.readFileSync(fp, 'utf8'));
      fs.writeFileSync(fp, code, 'utf8');
    }
  }
}

console.log('Paso 1: Build (npm run build:prod)...');
execSync('npm run build:prod', { cwd: ROOT, stdio: 'inherit' });

const distPath = path.join(ROOT, 'dist');
const prismaPath = path.join(ROOT, 'prisma');
if (!fs.existsSync(distPath)) {
  console.error('No existe dist/ tras el build.');
  process.exit(1);
}

console.log('Paso 2: Creando carpeta release-repo/...');
if (fs.existsSync(RELEASE_DIR)) rmDirRecursive(RELEASE_DIR);
fs.mkdirSync(RELEASE_DIR, { recursive: true });

copyRecursive(distPath, path.join(RELEASE_DIR, 'dist'), ['.d.ts', '.js.map']);
stripCommentsFromDir(path.join(RELEASE_DIR, 'dist'));
copyRecursive(prismaPath, path.join(RELEASE_DIR, 'prisma'));
stripCommentsFromDir(path.join(RELEASE_DIR, 'prisma'), '.prisma');
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(RELEASE_DIR, 'package.json'));
if (fs.existsSync(path.join(ROOT, 'package-lock.json'))) {
  fs.copyFileSync(path.join(ROOT, 'package-lock.json'), path.join(RELEASE_DIR, 'package-lock.json'));
}
if (fs.existsSync(path.join(ROOT, '.env.example'))) {
  fs.copyFileSync(path.join(ROOT, '.env.example'), path.join(RELEASE_DIR, '.env.example'));
}

fs.writeFileSync(path.join(RELEASE_DIR, '.gitignore'), `node_modules
.env
.env.*
!.env.example
*.log
.DS_Store
`);

fs.writeFileSync(path.join(RELEASE_DIR, 'README.md'), `# GTO Backend

\`\`\`bash
npm ci
npx prisma generate
cp .env.example .env
npm run start
\`\`\`

Variable de entorno \`PORT\` (por defecto 3000).
`);

console.log('Listo. Carpeta release-repo/ creada.');
console.log('');
console.log('Para subir a GitHub (ejecuta en tu terminal):');
console.log('  cd release-repo');
console.log('  git init');
console.log('  git add .');
console.log('  git commit -m "Initial commit"');
console.log('  git branch -M main');
console.log('  git remote add origin ' + REMOTE_URL);
console.log('  git push -u origin main');
console.log('');
console.log('Si el repo en GitHub ya tenía archivos (ej. README), antes del push:');
console.log('  git pull origin main --allow-unrelated-histories');
console.log('  git push -u origin main');

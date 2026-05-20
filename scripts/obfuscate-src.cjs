/**
 * Ofusca todo src/:
 * 1) Compila src/ → dist (nest build)
 * 2) Ofusca todos los .js en dist/
 * 3) Escribe copias ofuscadas en src/*.js (misma estructura), así src/ también tiene el código ofuscado
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');

function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) {
      walkDir(fp, fileList);
    } else if (f.endsWith('.js') && !f.endsWith('.map')) {
      fileList.push(fp);
    }
  }
  return fileList;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Ofuscación MÁXIMA: código muy difícil de entender
const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 1,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.5,
  debugProtection: true,
  debugProtectionInterval: 2000,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  identifiersPrefix: '_0x',
  renameGlobals: false,
  renameProperties: false,
  selfDefending: true,
  splitStrings: true,
  splitStringsChunkLength: 5,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 1,
  stringArrayEncoding: ['rc4'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 1,
  stringArrayWrappersCount: 3,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 5,
  stringArrayWrappersType: 'function',
  transformObjectKeys: false,
  unicodeEscapeSequence: true,
  numbersToExpressions: true,
  target: 'node',
  reservedNames: ['^__', '^req$', '^res$', '^next$', '^err$', '^_\$', '^exports$', '^module$', '^require$', '^__dirname$', '^__filename$'],
  reservedStrings: [],
};

console.log('Paso 1: Compilando src/ (nest build)...');
execSync('npx nest build', { cwd: ROOT, stdio: 'inherit' });

if (!fs.existsSync(DIST)) {
  console.error('dist/ no existe tras el build.');
  process.exit(1);
}

const files = walkDir(DIST);
console.log('Paso 2: Ofuscando todo el codigo (' + files.length + ' archivos)...');

for (const file of files) {
  try {
    const code = fs.readFileSync(file, 'utf8');
    const obfuscated = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions).getObfuscatedCode();
    fs.writeFileSync(file, obfuscated, 'utf8');
    var rel = path.relative(DIST, file);
    console.log('  ', rel);
    var destInSrc = path.join(SRC, rel);
    ensureDir(path.dirname(destInSrc));
    fs.writeFileSync(destInSrc, obfuscated, 'utf8');
  } catch (err) {
    console.error('  ERROR:', path.relative(DIST, file), err.message);
  }
}

console.log('Listo. Todo src/ ofuscado: dist/ y src/*.js actualizados.');

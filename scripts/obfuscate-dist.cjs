/**
 * Ofuscación fuerte de todo el código compilado en dist/.
 * Incluye control flow, inyección de dead code, string array, etc.
 */
const path = require('path');
const fs = require('fs');
const JavaScriptObfuscator = require('javascript-obfuscator');

const DIST = path.join(__dirname, '..', 'dist');

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

// Ofuscación MÁXIMA: código muy difícil de entender (control flow, dead code, RC4, split strings, self-defending)
const options = {
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

const files = walkDir(DIST);
console.log('Ofuscando TODO el codigo en dist/ (' + files.length + ' archivos)...');

for (const file of files) {
  try {
    const code = fs.readFileSync(file, 'utf8');
    const obfuscated = JavaScriptObfuscator.obfuscate(code, options).getObfuscatedCode();
    fs.writeFileSync(file, obfuscated, 'utf8');
    console.log('  ', path.relative(DIST, file));
  } catch (err) {
    console.error('  ERROR:', path.relative(DIST, file), err.message);
  }
}

console.log('Listo.');

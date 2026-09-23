const fs = require('fs');
const path = require('path');

const walk = (dir, callback) => {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
};

const keys = new Set();
walk('f:/Aquakart 2.0/aquakart-2/apps/mobile/app', (filePath) => {
  if (filePath.endsWith('.tsx')) {
    const content = fs.readFileSync(filePath, 'utf8');
    const regex = /t\(['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      keys.add(match[1]);
    }
  }
});

const translationsFile = fs.readFileSync('f:/Aquakart 2.0/aquakart-2/apps/mobile/features/i18n/translations.ts', 'utf8');
const existingKeys = new Set();
const keyRegex = /"([^"]+)":/g;
let match;
while ((match = keyRegex.exec(translationsFile)) !== null) {
  existingKeys.add(match[1]);
}

const missing = [];
for (let key of keys) {
  if (!existingKeys.has(key)) {
    missing.push(key);
  }
}

console.log(JSON.stringify(missing, null, 2));

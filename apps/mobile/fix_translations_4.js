const fs = require('fs');

const translationsFile = 'f:/Aquakart 2.0/aquakart-2/apps/mobile/features/i18n/translations.ts';
let content = fs.readFileSync(translationsFile, 'utf8');

// The file has a lot of duplicated keys in `en` because we ran scripts multiple times.
// Let's just cleanly parse the AST or use a simple line-by-line deduplication.

const lines = content.split('\n');
const newLines = [];
let currentLang = null;
const seenKeys = { en: new Set(), hi: new Set() };
let inMisplacedBlock = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.includes('en: {')) currentLang = 'en';
  else if (line.includes('hi: {')) currentLang = 'hi';
  
  // Skip the misplaced block completely. It was at the end after `};`
  // Wait, if it was after `};`, it's not valid JS.
  // Actually, any line that starts with `"khata.bill"` etc outside of `hi` is bad.
  // Let's just track if we have seen the final `};`
  
  // Let's just extract the key and check for duplicates inside currentLang
  const match = line.match(/^\s*"([^"]+)"\s*:/);
  if (match && currentLang) {
    const key = match[1];
    if (seenKeys[currentLang].has(key)) {
      // Duplicate, skip this line
      continue;
    }
    seenKeys[currentLang].add(key);
  }
  
  newLines.push(line);
}

// Write the deduplicated file back
fs.writeFileSync(translationsFile, newLines.join('\n'), 'utf8');

console.log('Deduplication done.');

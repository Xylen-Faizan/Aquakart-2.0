const fs = require('fs');
const path = require('path');

const walk = (dir, callback) => {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
};

const keys = new Set();
const dirsToScan = [
  'f:/Aquakart 2.0/aquakart-2/apps/mobile/app',
  'f:/Aquakart 2.0/aquakart-2/apps/mobile/components',
  'f:/Aquakart 2.0/aquakart-2/apps/mobile/features'
];

dirsToScan.forEach(dir => {
  walk(dir, (filePath) => {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      const content = fs.readFileSync(filePath, 'utf8');
      const regex = /t\(['"]([^'"]+)['"]/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        keys.add(match[1]);
      }
    }
  });
});

const translationsFile = 'f:/Aquakart 2.0/aquakart-2/apps/mobile/features/i18n/translations.ts';
let content = fs.readFileSync(translationsFile, 'utf8');

const existingKeys = new Set();
const keyRegex = /"([^"]+)":/g;
let match;
while ((match = keyRegex.exec(content)) !== null) {
  existingKeys.add(match[1]);
}

const missing = [];
for (let key of keys) {
  if (!existingKeys.has(key)) {
    missing.push(key);
  }
}

function decamelize(str) {
  const parts = str.split('.');
  const last = parts[parts.length - 1];
  if (!last) return str;
  let result = last.replace(/([A-Z])/g, ' $1');
  result = result.replace(/_/g, ' ');
  return result.charAt(0).toUpperCase() + result.slice(1);
}

let enAdditions = '\n    // --- Additional Missing Keys ---\n';
let hiAdditions = '\n    // --- Additional Missing Keys ---\n';

let hasNewKeys = false;
missing.forEach(key => {
  if (key.includes(' ') || key.includes(',')) return;
  let val = decamelize(key);
  
  if (key === 'khata.jarsThisMonth') val = 'Jars This Month';
  if (key === 'khata.billGenerated') val = 'Bill Generated';
  if (key === 'khata.paidThisMonth') val = 'Paid This Month';
  if (key === 'khata.emptyJarsWithYou') val = 'Empty Jars With You';
  if (key === 'khata.dailyRecord') val = 'Daily Record';
  if (key === 'khata.noRecordsFound') val = 'No Records Found';
  if (key === 'khata.jars') val = 'Jars';
  if (key === 'khata.bill') val = 'Bill';
  if (key === 'customers.filter_All') val = 'All';
  if (key === 'customers.filter_household') val = 'Household';
  if (key === 'customers.filter_office') val = 'Office';
  if (key === 'customers.filter_business') val = 'Business';

  enAdditions += `    "${key}": "${val}",\n`;
  hiAdditions += `    "${key}": "${val}",\n`;
  hasNewKeys = true;
});

if (hasNewKeys) {
  // Find the split point for EN: right before hi: {
  const hiIndex = content.indexOf('  hi: {');
  if (hiIndex !== -1) {
    const enEndIndex = content.lastIndexOf('},', hiIndex);
    if (enEndIndex !== -1) {
      content = content.slice(0, enEndIndex) + enAdditions + content.slice(enEndIndex);
    }
  }

  // Find the split point for HI: right before the final };
  const finalEndIndex = content.lastIndexOf('};');
  if (finalEndIndex !== -1) {
    const hiEndIndex = content.lastIndexOf('}', finalEndIndex);
    if (hiEndIndex !== -1) {
      content = content.slice(0, hiEndIndex) + hiAdditions + '  ' + content.slice(hiEndIndex);
    }
  }

  fs.writeFileSync(translationsFile, content, 'utf8');
  console.log('Added ' + missing.length + ' missing keys.');
} else {
  console.log('No new missing keys found.');
}

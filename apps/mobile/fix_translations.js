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
  return result.charAt(0).toUpperCase() + result.slice(1);
}

let enAdditions = '\n    // --- Auto Generated Missing Keys ---\n';
let hiAdditions = '\n    // --- Auto Generated Missing Keys ---\n';

missing.forEach(key => {
  if (key.includes(' ') || key.includes(',')) return;
  let val = decamelize(key);
  
  if (key === 'more.businessProfileSubtitle') val = 'Manage your business details';
  if (key === 'more.pricingCatalog') val = 'Pricing & Catalog';
  if (key === 'more.pricingCatalogSubtitle') val = 'Manage product pricing';
  if (key === 'more.teamCrew') val = 'Team & Crew';
  if (key === 'more.teamCrewSubtitle') val = 'Manage your staff';
  if (key === 'more.fleetVehicles') val = 'Fleet Vehicles';
  if (key === 'more.fleetVehiclesSubtitle') val = 'Manage your delivery fleet';
  if (key === 'more.ledgerReports') val = 'Ledger & Reports';
  if (key === 'more.ledgerReportsSubtitle') val = 'View financial data';
  if (key === 'more.appSettings') val = 'App Settings';
  if (key === 'more.appSettingsSubtitle') val = 'App preferences';
  if (key === 'more.helpSupport') val = 'Help & Support';
  if (key === 'more.helpSupportSubtitle') val = 'Get help';

  enAdditions += `    "${key}": "${val}",\n`;
  hiAdditions += `    "${key}": "${val}",\n`;
});

content = content.replace('hi: {', enAdditions + '  },\n\n  hi: {');
content = content.replace(/  \},\n\};\s*$/, hiAdditions + '  },\n};\n');

fs.writeFileSync(translationsFile, content, 'utf8');
console.log('Added ' + missing.length + ' missing keys.');

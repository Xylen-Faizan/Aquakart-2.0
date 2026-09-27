const fs = require('fs');
const files = [
  'apps/mobile/app/(customer)/(tabs)/khata.tsx',
  'apps/mobile/app/(helper)/dashboard.tsx',
  'apps/mobile/app/(supplier)/(tabs)/customers.tsx',
  'apps/mobile/app/(supplier)/(tabs)/fleet.tsx',
  'apps/mobile/app/(supplier)/(tabs)/jars.tsx',
  'apps/mobile/app/(supplier)/khata/[id].tsx',
  'apps/mobile/app/(supplier)/more/marketplace-history.tsx',
  'apps/mobile/components/customer/SubscribedHome.tsx',
  'apps/mobile/components/helper/OfferAlertOverlay.tsx',
  'apps/mobile/app/(driver)/route.tsx',
  'apps/mobile/app/(helper)/opportunities.tsx',
  'apps/mobile/app/(helper)/route.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  const needsImport = !content.includes('lib/date');
  
  if (needsImport) {
    const depth = file.split('/').length - 3;
    const prefix = Array(depth).fill('..').join('/');
    const fullImport = `import { formatISTDate, formatISTTime, formatISTDateTime, getIndiaBusinessDate } from '${prefix}/lib/date';\n`;
    content = fullImport + content;
  }
  
  // Replacements
  content = content.replace(/new Date\(\)\.toISOString\(\)\.split\(['"]T['"]\)\[0\]/g, 'getIndiaBusinessDate()');
  
  content = content.replace(/\{date\.toLocaleDateString\([\s\S]*?\}\s*•\s*\{date\.toLocaleTimeString\([\s\S]*?\)\}/g, '{formatISTDateTime(date)}');
  content = content.replace(/\{new Date\(entry\.created_at\)\.toLocaleDateString\([\s\S]*?\)\}/g, '{formatISTDate(entry.created_at)}');
  content = content.replace(/\{new Date\(alert\.created_at\)\.toLocaleTimeString\([\s\S]*?\)\}/g, '{formatISTTime(alert.created_at)}');
  content = content.replace(/\{new Date\(order\.created_at\)\.toLocaleTimeString\([\s\S]*?\)\}/g, '{formatISTTime(order.created_at)}');
  
  content = content.replace(/date\.toLocaleTimeString\([\s\S]*?\)/g, 'formatISTTime(date)');
  content = content.replace(/date\.toLocaleDateString\([\s\S]*?\)/g, 'formatISTDate(date)');
  
  content = content.replace(/new Date\(v\.captured_at\)\.toLocaleTimeString\(\)/g, 'formatISTTime(v.captured_at)');
  content = content.replace(/new Date\(act\.created_at\)\.toLocaleString\(\)/g, 'formatISTDateTime(act.created_at)');
  content = content.replace(/new Date\(entry\.created_at\)\.toLocaleDateString\(\)/g, 'formatISTDate(entry.created_at)');
  content = content.replace(/new Date\(\)\.toLocaleDateString\([\s\S]*?\)/g, 'formatISTDate(new Date())');
  
  fs.writeFileSync(file, content);
}

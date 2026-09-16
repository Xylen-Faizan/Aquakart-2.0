const fs = require('fs');
const path = require('path');

// 1. Export models
const idxPath = path.join(__dirname, '../packages/types/src/index.ts');
let idx = fs.readFileSync(idxPath, 'utf8');
if (!idx.includes('./models')) {
  idx += '\nexport * from "./models";\n';
  fs.writeFileSync(idxPath, idx);
}

// 2. Fix UI errors
function fixUIProps(filePath) {
  const p = path.join(__dirname, filePath);
  let content = fs.readFileSync(p, 'utf8');
  
  // Badge children
  content = content.replace(/<Badge([^>]*)text=\{([^}]*)\}\s*\/>/g, '<Badge$1>{$2}</Badge>');
  content = content.replace(/<Badge([^>]*)text="([^"]*)"\s*\/>/g, '<Badge$1>$2</Badge>');
  
  // Badge variant
  content = content.replace(/variant="default"/g, 'variant="neutral"');
  
  // Button textStyle (which doesn't exist)
  content = content.replace(/textStyle=\{[^}]*\}/g, '');
  
  // inputLabel doesn't exist in styles
  content = content.replace(/style=\{styles\.inputLabel\}/g, '');
  
  fs.writeFileSync(p, content);
}
fixUIProps('../apps/mobile/app/(supplier)/customers.tsx');
fixUIProps('../apps/mobile/app/(supplier)/deliveries.tsx');
fixUIProps('../apps/mobile/app/(supplier)/more.tsx');

// 3. Fix realtime timeout
const rtPath = path.join(__dirname, '../apps/mobile/hooks/useSupplierOrderRealtime.ts');
let rt = fs.readFileSync(rtPath, 'utf8');
rt = rt.replace(/useRef<NodeJS\.Timeout>\(\)/g, 'useRef<ReturnType<typeof setTimeout> | null>(null)');
rt = rt.replace(/timerRef\.current = setTimeout/g, 'timerRef.current = setTimeout'); // already is
fs.writeFileSync(rtPath, rt);

// 4. services/dashboard.ts - lib import
const dbPath = path.join(__dirname, '../apps/mobile/services/dashboard.ts');
let db = fs.readFileSync(dbPath, 'utf8');
db = db.replace(/'\.\.\/lib\/supabase'/g, "'../lib/supabase/client'");
fs.writeFileSync(dbPath, db);

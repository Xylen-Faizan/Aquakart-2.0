const fs = require('fs');
const path = require('path');
const dir = 'app/(supplier)/more';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));
for (const file of files) {
  const p = path.join(dir, file);
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(/from '\.\.\/\.\.\/constants/g, "from '../../../constants");
  c = c.replace(/from '\.\.\/\.\.\/components/g, "from '../../../components");
  c = c.replace(/from '\.\.\/\.\.\/features/g, "from '../../../features");
  c = c.replace(/from '\.\.\/\.\.\/lib/g, "from '../../../lib");
  fs.writeFileSync(p, c);
}
console.log('Fixed imports');

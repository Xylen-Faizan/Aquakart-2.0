const fs = require('fs');
function fixUIProps(p) {
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(/colors\.text\b/g, 'colors.textPrimary');
  // customers.tsx specific fix
  content = content.replace(/<Badge\s+variant="success"\s+text=\{`Active \(\$\{activeCount\}\)`\}\s*\/>/g, '<Badge variant="success">Active ({activeCount})</Badge>');
  content = content.replace(/<Badge\s+variant="success"\s+text="Active"\s*\/>/g, '<Badge variant="success">Active</Badge>');
  content = content.replace(/<Badge\s+variant="default"/g, '<Badge variant="neutral"');
  content = content.replace(/size="small"/g, 'size="sm"');
  content = content.replace(/icon=\{<Ionicons[^>]*>\}/g, ''); 
  content = content.replace(/text="Pending"/g, '>Pending</Badge>');
  content = content.replace(/<Badge\s+variant="warning"\s+>Pending<\/Badge>\s*\/>/g, '<Badge variant="warning">Pending</Badge>');
  fs.writeFileSync(p, content);
}
fixUIProps('apps/mobile/app/(supplier)/customers.tsx');
fixUIProps('apps/mobile/app/(supplier)/deliveries.tsx');
fixUIProps('apps/mobile/app/(supplier)/jars.tsx');
fixUIProps('apps/mobile/app/(supplier)/more.tsx');
fixUIProps('apps/mobile/app/(supplier)/today.tsx');

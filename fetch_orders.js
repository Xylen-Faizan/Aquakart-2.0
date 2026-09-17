const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  const envContent = fs.readFileSync('apps/mobile/.env', 'utf-8');
  const supabaseUrl = envContent.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
  const anonKey = envContent.match(/EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/)[1].trim();
  
  const supabase = createClient(supabaseUrl, anonKey);
  
  const { data, error } = await supabase.rpc('get_today_manifest');
    
  console.log('Manifest:', JSON.stringify(data, null, 2));
  if (error) console.error('Error:', error);
}

main();

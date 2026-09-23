const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'apps/mobile/.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'contact@purejal.bokaro',
        password: 'password123',
    });
    if (authError) {
        console.error('Auth Error:', authError);
        return;
    }
    console.log('Logged in as:', authData.user.id);
    
    const { data: manifest, error: manifestError } = await supabase.rpc('get_today_manifest');
    console.log('Manifest Error:', manifestError);
    console.log('Manifest Data length:', manifest?.length);
    console.log('Manifest Data:', JSON.stringify(manifest, null, 2));

    const { data: stats, error: statsError } = await supabase.rpc('get_supplier_today');
    console.log('Stats Error:', statsError);
    console.log('Stats Data:', stats);
}

main();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'apps/mobile/.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testPush() {
    const supplierId = '59596160-e132-46f8-b66d-e2b503938c74';
    
    // Auth as customer to test RLS
    const { error: authError } = await supabase.auth.signInWithPassword({
        email: 'tamrinsaif123@gmail.com',
        password: 'password123',
    });
    if (authError) {
        console.error("Auth Error", authError);
    }
    
    const { data: pushToken, error: tokenError } = await supabase
          .rpc('get_supplier_push_token', { p_supplier_id: supplierId });
          
    console.log("Push Token:", pushToken, "Error:", tokenError);
    
    if (!pushToken) return;

    const message = {
        to: pushToken,
        sound: 'default',
        title: 'Test Notification! 💧',
        body: `You just received a new marketplace order!`,
        data: { route: '/(supplier)/today' },
    };

    try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });
        
        console.log("Response status:", response.status);
        const json = await response.json();
        console.log("Response JSON:", json);
    } catch (e) {
        console.error("Fetch error:", e);
    }
}

testPush();

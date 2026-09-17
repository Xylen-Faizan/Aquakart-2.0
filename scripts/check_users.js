const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://gmoethzwvoeuajfzqakn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdtb2V0aHp3dm9ldWFqZnpxYWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzMxNDcsImV4cCI6MjEwNDk0OTE0N30.eQCfyYsA_1a_mlHAudmt1fWT6QwfKPkhIs5pVWTraYs';

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkUsers() {
  console.log("Checking for existing users by trying to login...");
  
  // The system uses 'contact@purejal.com', let's check if we can query public.suppliers directly
  const { data: suppliers, error } = await client.from('suppliers').select('*, profiles!inner(email)');
  
  if (error) {
    console.log("Could not query suppliers. Error:", error.message);
  } else {
    console.log(`Found ${suppliers?.length || 0} suppliers:`);
    suppliers?.forEach(s => {
      console.log(`- ${s.business_name} (Email from profile relation might fail if no permissions)`);
    });
  }

  const emailsToTry = ['google_demo@gmail.com', 'customer@example.com', 'customer1@aquakart.demo'];
  
  for (const email of emailsToTry) {
    const { data, error } = await client.auth.signInWithPassword({ email, password: 'password123' });
    if (error) {
      console.log(`${email}: ${error.message}`);
    } else {
      console.log(`SUCCESS: ${email}`);
    }
  }
}

checkUsers().then(() => process.exit(0));

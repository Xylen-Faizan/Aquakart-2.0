const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://gmoethzwvoeuajfzqakn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdtb2V0aHp3dm9ldWFqZnpxYWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzMxNDcsImV4cCI6MjEwNDk0OTE0N30.eQCfyYsA_1a_mlHAudmt1fWT6QwfKPkhIs5pVWTraYs';

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkProfiles() {
  // Try logging in with the known supplier account first to get authenticated
  await client.auth.signInWithPassword({ email: 'info@bokaroaqua.in', password: 'password123' });
  
  const { data: profiles, error } = await client.from('profiles').select('*').limit(20);
  if (error) {
    console.log("Error querying profiles:", error.message);
  } else {
    console.log("Profiles found:");
    profiles.forEach(p => {
      console.log(`- ${p.name} (${p.role}) - ID: ${p.id} - Email: ${p.email}`);
    });
  }
}

checkProfiles().then(() => process.exit(0));

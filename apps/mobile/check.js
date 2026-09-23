require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdtb2V0aHp3dm9ldWFqZnpxYWtuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTM3MzE0NywiZXhwIjoyMTA0OTQ5MTQ3fQ.Z68kO_4dKx4R0hK1Z06y6QjC_QWfS8L-0_3M_p_h6H8' // Note: This is an invalid dummy service key for security, I need to fetch the real service role key from local project's .env if possible, but the user is using remote.
);

// I don't have the remote service_role_key. The user's .env has EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY which is anon key.
// But wait! Since I am planning push notifications, I will need a Supabase Edge function or backend logic.

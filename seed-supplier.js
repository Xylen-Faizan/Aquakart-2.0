require('dotenv').config({ path: './apps/mobile/.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
// We need the service role key to bypass RLS and create users, or we can use the anon key if email signup is open.
// Since we have supabase locally, let's just use the CLI or run a raw query, or just use the local anon key to sign up.

const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function seed() {
  console.log('Signing up supplier...');
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: 'supplier@example.com',
    password: 'password123',
    options: {
      data: {
        name: 'Aqua Pure Solutions'
      }
    }
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      console.log('Supplier already registered. Attempting login to verify...');
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: 'supplier@example.com',
        password: 'password123'
      });
      if (loginError) {
         console.error('Login failed, password might be different:', loginError.message);
      } else {
         console.log('Login successful.');
      }
    } else {
      console.error('Error signing up:', authError.message);
      return;
    }
  } else {
    console.log('Supplier signed up:', authData.user?.email);
  }

  console.log('Waiting for trigger to create profile...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Setting role to supplier...');
  // Need to update the role to 'supplier'. We can use the service role key for this, but since we don't have it explicitly parsed, let's try with the user's own token (if they have permissions, though usually RLS prevents this).
  // Wait, the anon key won't let us update the role if RLS blocks it.
  
  // Wait, I can just use psql to update the role directly in the db.
}

seed();

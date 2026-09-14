const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function seed() {
  console.log('Signing up supplier...');
  
  // Use admin auth to create user directly
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: 'supplier@example.com',
    password: 'password123',
    email_confirm: true,
    user_metadata: {
      name: 'Aqua Pure Solutions'
    }
  });

  let userId;

  if (authError) {
    if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
      console.log('Supplier already registered. Attempting to find user...');
      const { data } = await supabase.auth.admin.listUsers();
      const user = data.users.find(u => u.email === 'supplier@example.com');
      if (user) {
         userId = user.id;
         console.log('Found user with ID:', userId);
         // update password just in case
         await supabase.auth.admin.updateUserById(userId, { password: 'password123' });
         console.log('Password updated to password123');
      }
    } else {
      console.error('Error signing up:', authError.message);
      return;
    }
  } else {
    userId = authData.user?.id;
    console.log('Supplier created with ID:', userId);
  }

  if (userId) {
     console.log('Waiting for profile trigger to run...');
     await new Promise(resolve => setTimeout(resolve, 2000));
     
     console.log('Updating profile role to supplier...');
     const { error: profileError } = await supabase
       .from('profiles')
       .update({ role: 'supplier' })
       .eq('id', userId);
       
     if (profileError) {
       console.error('Error updating role:', profileError.message);
     } else {
       console.log('Role successfully updated to supplier!');
     }
  }
}

seed();

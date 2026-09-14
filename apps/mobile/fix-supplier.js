const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  console.log('Finding supplier@example.com...');
  const { data: userData } = await supabase.auth.admin.listUsers();
  const user = userData.users.find(u => u.email === 'supplier@example.com');
  
  if (!user) {
    console.error('User not found!');
    return;
  }
  
  const userId = user.id;
  console.log('User ID:', userId);
  
  const { data: supplierData } = await supabase
    .from('suppliers')
    .select('id')
    .eq('profile_id', userId)
    .single();
    
  if (!supplierData) {
     console.log('Supplier row not found, creating one...');
     const { error } = await supabase
       .from('suppliers')
       .insert({
         profile_id: userId,
         business_name: 'Aqua Pure Solutions',
         description: 'Best water delivery in town.',
         phone: '+1234567890',
         is_accepting_orders: true
       });
       
     if (error) {
       console.error('Error inserting supplier:', error.message);
     } else {
       console.log('Successfully inserted supplier record!');
     }
  } else {
     console.log('Supplier row already exists!');
  }
}

fix();

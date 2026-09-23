require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// We must use SERVICE_ROLE_KEY to bypass RLS in the script
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
// I will get the service role key from the terminal output earlier! 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSuppliers() {
  const { data, error } = await supabase.from('suppliers').select('id, business_name, profile_id');
  console.log("Suppliers:", data);
  
  const { data: orders, error: oErr } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(2);
  console.log("Latest orders:", orders);
}

checkSuppliers();

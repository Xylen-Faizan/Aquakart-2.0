import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runStressTest() {
  console.log('Starting Concurrency Stress Test...');

  // 1. Get Simulation Supplier
  const { data: supplier, error: suppErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('business_name', 'Amrit Dhara (Simulation)')
    .single();

  if (suppErr || !supplier) {
    console.error('Simulation supplier not found.', suppErr);
    return;
  }
  const supplierId = supplier.id;

  // 2. Get one customer
  const { data: customer, error: custErr } = await supabase
    .from('supplier_customers')
    .select('id')
    .eq('supplier_id', supplierId)
    .limit(1)
    .single();

  if (custErr || !customer) {
    console.error('No customers found.', custErr);
    return;
  }
  const customerId = customer.id;

  // 3. Get supplier_product_id
  const { data: sp, error: spErr } = await supabase
    .from('supplier_products')
    .select('id')
    .eq('supplier_id', supplierId)
    .limit(1)
    .single();

  if (spErr || !sp) {
    console.error('No products found for supplier.', spErr);
    return;
  }
  const supplierProductId = sp.id;

  console.log(`Testing concurrent deliveries for customer ${customerId}`);

  // Create an authenticated client impersonating the supplier
  // Note: we can just call rpc with the service role, but we need to set the claim
  // But wait, Supabase JS `rpc` with service role doesn't automatically impersonate.
  // We can just use standard `supabase.rpc` if the function uses auth.uid(), wait, it uses get_supplier_id() which depends on auth.uid() or jwt claim.
  // We should create a dummy jwt or just modify the function to accept supplier_id for testing?
  // Let's just create an RPC wrapper or generate a JWT using jsonwebtoken.
  
  const jwt = require('jsonwebtoken');
  const jwtSecret = process.env.SUPABASE_JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long';
  const token = jwt.sign({
    role: 'authenticated',
    sub: supplierId,
    aud: 'authenticated',
  }, jwtSecret);

  const authClient = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  // 4. Fire 5 concurrent complete_delivery requests
  console.log('Firing 5 concurrent requests...');
  
  // Simulate a double-tap/offline retry by sending the SAME idempotency key
  const crypto = require('crypto');
  const idempotencyKey = crypto.randomUUID();

  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(
      authClient.rpc('complete_delivery', {
        p_customer_id: customerId,
        p_supplier_product_id: supplierProductId,
        p_quantity: 2,
        p_jars_delivered: 2,
        p_jars_returned: 2,
        p_amount_collected: 50,
        p_payment_method: 'cash',
        p_idempotency_key: idempotencyKey
      })
    );
  }

  const results = await Promise.allSettled(promises);
  
  let successes = 0;
  let failures = 0;

  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && !r.value.error) {
      successes++;
      console.log(`Req ${i}: Success (${r.value.data})`);
    } else {
      failures++;
      console.log(`Req ${i}: Failed (${r.status === 'fulfilled' ? JSON.stringify(r.value.error) : r.reason})`);
    }
  });

  console.log(`\nStress Test Results: ${successes} Success, ${failures} Failed`);
  
  if (successes > 1) {
    console.warn('\nWARNING: Multiple requests succeeded! You have a double-delivery race condition.');
  } else {
    console.log('\nSUCCESS: Race condition prevented.');
  }
}

runStressTest().catch(console.error);

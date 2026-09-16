import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runReconciliation(supplierId: string) {
  console.log(`\n=========================================`);
  console.log(`AQUAKART RECONCILIATION`);
  console.log(`Supplier: ${supplierId}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`=========================================\n`);

  let isHealthy = true;

  // 0. Data Integrity (Pilot Constraints)
  console.log(`DATA INTEGRITY`);
  
  // Customers
  const { data: dupPhones } = await supabase.rpc('check_duplicate_phones', { supp_id: supplierId }).select('*').maybeSingle();
  let dupPhoneCount = 0; // Using a raw query via RPC might be hard, let's just query directly
  
  const { data: allCust } = await supabase.from('supplier_customers').select('id, phone, customer_type').eq('supplier_id', supplierId);
  const phoneCounts = new Map();
  allCust?.forEach(c => phoneCounts.set(c.phone, (phoneCounts.get(c.phone) || 0) + 1));
  const duplicatePhones = Array.from(phoneCounts.values()).filter(count => count > 1).length;
  
  console.log(`${duplicatePhones === 0 ? '✓' : '✗'} Duplicate phones            ${duplicatePhones}`);
  if (duplicatePhones > 0) isHealthy = false;

  // Pricing
  const { data: negPrices } = await supabase.from('customer_product_prices')
    .select('id, supplier_customer_id!inner(supplier_id)')
    .eq('supplier_customer_id.supplier_id', supplierId)
    .lt('price', 0);
  console.log(`${(!negPrices || negPrices.length === 0) ? '✓' : '✗'} Negative prices             ${negPrices?.length || 0}`);
  if (negPrices && negPrices.length > 0) isHealthy = false;

  // Schedules
  const { data: badSchedules } = await supabase.from('customer_delivery_schedules')
    .select('id, supplier_customer_id!inner(supplier_id)')
    .eq('supplier_customer_id.supplier_id', supplierId)
    .lt('interval_days', 1);
  console.log(`${(!badSchedules || badSchedules.length === 0) ? '✓' : '✗'} Invalid schedules           ${badSchedules?.length || 0}`);
  if (badSchedules && badSchedules.length > 0) isHealthy = false;

  // Jar Balances >= 0
  const { data: negJars } = await supabase.from('customer_jar_balances')
    .select('id, supplier_customer_id!inner(supplier_id)')
    .eq('supplier_customer_id.supplier_id', supplierId)
    .lt('jars_with_customer', 0);
  console.log(`${(!negJars || negJars.length === 0) ? '✓' : '✗'} Negative jar balances       ${negJars?.length || 0}`);
  if (negJars && negJars.length > 0) isHealthy = false;

  console.log();

  // 1. Jars
  const { data: jars, error: jarErr } = await supabase
    .from('supplier_jar_reconciliation')
    .select('*')
    .eq('supplier_id', supplierId)
    .maybeSingle();

  if (jarErr) {
    console.error("Failed to fetch jar reconciliation:", jarErr.message);
  } else if (jars) {
    console.log(`JARS`);
    console.log(`${jars.is_equation_valid ? '✓' : '✗'} Owned                     ${jars.owned_jars}`);
    console.log(`  Available                 ${jars.available_jars}`);
    console.log(`  With Customers            ${jars.customer_jars}`);
    console.log(`  Damaged                   ${jars.damaged_jars}`);
    console.log(`  Missing                   ${jars.missing_jars}`);
    console.log(`${jars.is_equation_valid ? '✓ Equation                  PASS' : '✗ Equation                  FAIL'}`);
    console.log(`${jars.is_customer_sum_valid ? '✓ Customer Sum Matching     PASS' : '✗ Customer Sum Matching     FAIL'}`);
    console.log();
    if (!jars.is_equation_valid || !jars.is_customer_sum_valid) isHealthy = false;
  } else {
    console.log(`JARS`);
    console.log(`! No jar reconciliation record found for this supplier.`);
    console.log();
  }

  // 2. Financials
  const { data: fin, error: finErr } = await supabase
    .from('supplier_financial_reconciliation')
    .select('*')
    .eq('supplier_id', supplierId)
    .maybeSingle();

  if (finErr) {
    console.error("Failed to fetch financial reconciliation:", finErr.message);
  } else if (fin) {
    console.log(`FINANCIALS`);
    console.log(`  Deliveries billed       ₹${fin.total_billed}`);
    console.log(`  Payments collected      ₹${fin.total_collected}`);
    console.log(`  Ledger Debits           ₹${fin.ledger_debits}`);
    console.log(`  Ledger Credits          ₹${fin.ledger_credits}`);
    console.log(`${fin.is_billing_synced ? '✓ Billing Synced            PASS' : '✗ Billing Synced            FAIL'}`);
    console.log(`${fin.is_collection_synced ? '✓ Collection Synced         PASS' : '✗ Collection Synced         FAIL'}`);
    console.log();
    if (!fin.is_billing_synced || !fin.is_collection_synced) isHealthy = false;
  } else {
    console.log(`FINANCIALS`);
    console.log(`! No financial reconciliation record found for this supplier.`);
    console.log();
  }

  // 3. Schedules
  const { data: sched, error: schedErr } = await supabase
    .from('supplier_schedule_integrity')
    .select('*')
    .eq('supplier_id', supplierId)
    .maybeSingle();

  if (schedErr) {
    console.error("Failed to fetch schedule integrity:", schedErr.message);
  } else if (sched) {
    const sPass = sched.duplicate_schedules_count === 0 && sched.duplicate_deliveries_count === 0 && sched.orphan_deliveries_count === 0;
    console.log(`SCHEDULES`);
    console.log(`${sched.duplicate_schedules_count === 0 ? '✓' : '✗'} Duplicate schedules        ${sched.duplicate_schedules_count}`);
    console.log(`${sched.duplicate_deliveries_count === 0 ? '✓' : '✗'} Duplicate deliveries       ${sched.duplicate_deliveries_count}`);
    console.log(`${sched.orphan_deliveries_count === 0 ? '✓' : '✗'} Orphan deliveries          ${sched.orphan_deliveries_count}`);
    console.log(`${sPass ? '✓ Schedule integrity        PASS' : '✗ Schedule integrity        FAIL'}`);
    console.log();
    if (!sPass) isHealthy = false;
  }

  console.log(`OVERALL`);
  if (isHealthy) {
    console.log(`✓ HEALTHY`);
  } else {
    console.log(`✗ ACTION REQUIRED: Reconciliation Failed.`);
  }
  console.log(`=========================================\n`);
}

async function main() {
  const arg = process.argv.find(a => a.startsWith('--supplier='))?.split('=')[1] || process.argv[2];
  if (!arg) {
    console.error("Usage: npx ts-node scripts/reconcile.ts <supplier_id_or_name|sim> OR --supplier=Amrit Dhara");
    process.exit(1);
  }

  let supplierId = arg;

  // UUID regex
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(arg)) {
    const businessName = arg === 'sim' ? 'Amrit Dhara (Simulation)' : arg;
    console.log(`Looking up supplier: ${businessName}`);
    
    const { data, error } = await supabase
      .from('suppliers')
      .select('id')
      .eq('business_name', businessName)
      .single();
      
    if (error || !data) {
      console.error(`Could not find supplier with name "${businessName}"`);
      process.exit(1);
    }
    
    supplierId = data.id;
  }

  await runReconciliation(supplierId);
}

main();

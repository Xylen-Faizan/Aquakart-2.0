import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Usage: npx tsx scripts/onboard-amrit-dhara.ts [--dry-run] [--fixture] [--email=amritdhara@aquakart.com]
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isFixture = args.includes('--fixture');
const emailArg = args.find(a => a.startsWith('--email='))?.split('=')[1] || 'amritdhara@aquakart.com';

const csvPath = isFixture
  ? path.resolve(__dirname, '../data/fixtures/amrit_dhara_synthetic_15.csv')
  : path.resolve(__dirname, '../data/pilot/amrit_dhara_pilot_cohort.csv');

async function runOnboarding() {
  console.log(`=========================================`);
  console.log(`AMRIT DHARA ONBOARDING ${isDryRun ? '— DRY RUN' : ''}`);
  console.log(`=========================================`);
  
  if (!fs.existsSync(csvPath)) {
    console.error(`\n❌ Error: CSV file not found at ${csvPath}`);
    console.log(`Please create it or use --fixture to run synthetic data.`);
    process.exit(1);
  }

  // 1. Verify Supplier Auth User Exists
  console.log(`\nVerifying supplier account for ${emailArg}...`);
  let authUserId;
  
  // Since getUserById requires ID, and we only have email, we need to query auth.users
  // Let's use an RPC or just query auth.users if we have service role. Service role cannot query auth.users directly via PostgREST unless there's a view.
  // Actually, let's query public.profiles directly joining auth if possible, or just look up profile by email if we added email to profile? No, profile has ID.
  // Let's query profiles first to see if we can find them by some other means, or we can use admin.listUsers().
  const { data: users, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
     console.error('❌ Failed to list users:', listErr.message);
     process.exit(1);
  }
  
  const user = users.users.find(u => u.email === emailArg);
  if (!user) {
      console.log(`User not found. Auto-creating ${emailArg} for onboarding...`);
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email: emailArg,
          password: 'password123',
          email_confirm: true,
          user_metadata: { name: 'Amrit Dhara' }
      });
      if (createErr) {
          console.error(`❌ Failed to create user:`, createErr.message);
          process.exit(1);
      }
      authUserId = newUser.user.id;
  } else {
      authUserId = user.id;
  }
  
  console.log(`✓ Found Auth User: ${authUserId}`);

  // 2. Verify Profile and Supplier Record
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', authUserId)
    .single();

  if (profileErr || !profile) {
      console.error(`❌ Profile not found for auth ID ${authUserId}`);
      process.exit(1);
  }
  
  if (profile.role !== 'supplier') {
      console.log(`Auto-upgrading profile role to supplier...`);
      await supabase.from('profiles').update({ role: 'supplier' }).eq('id', authUserId);
  }
  
  let supplierId;
  const { data: existingSupp, error: suppErr } = await supabase.from('suppliers').select('*').eq('profile_id', authUserId).maybeSingle();
  if (!existingSupp) {
      console.log(`Auto-creating supplier record...`);
      const { error: insertSuppErr } = await supabase.from('suppliers').insert({
          id: authUserId,
          profile_id: authUserId,
          business_name: 'Amrit Dhara (Pilot)',
          phone: profile.phone || '9999999999',
          is_active: true,
          is_accepting_orders: true
      });
      if (insertSuppErr) {
          console.error(`❌ Failed to create supplier record:`, insertSuppErr.message);
          process.exit(1);
      }
      supplierId = authUserId;
  } else {
      supplierId = existingSupp.id;
  }

  const supplier = {
      id: supplierId,
      business_name: existingSupp?.business_name || 'Amrit Dhara (Pilot)'
  };

  console.log(`✓ Supplier active (ID: ${supplierId})`);

  // Ensure 20L Jar exists in supplier_products
  const prodId = '00000000-0000-0000-0000-000000000001';
  const { data: suppProd } = await supabase.from('supplier_products').select('id').eq('supplier_id', supplierId).eq('product_id', prodId).maybeSingle();
  if (!suppProd) {
      await supabase.from('supplier_products').insert({
          supplier_id: supplierId,
          product_id: prodId,
          price: 40,
          available: true
      });
      console.log(`✓ Added 20L Jar product for supplier`);
  }

  // 3. Setup Product
  console.log(`\nVerifying Product...`);
  // Ensure "20L Jar" exists globally
  let { data: globalProduct } = await supabase
    .from('products')
    .select('id')
    .eq('name', '20L Jar')
    .single();

  if (!globalProduct) {
      if (isDryRun) {
          console.log(`! Global Product "20L Jar" missing (will be created)`);
      } else {
          const { data: newProd, error: newProdErr } = await supabase
            .from('products')
            .insert({ name: '20L Jar', unit: 'jar' })
            .select('id')
            .single();
          if (newProdErr) throw newProdErr;
          globalProduct = newProd;
      }
  } else {
      console.log(`✓ Global Product "20L Jar" exists`);
  }

  // Ensure Supplier Product Mapping
  let supplierProductId;
  if (!isDryRun) {
      const { data: suppProd, error: suppProdErr } = await supabase
        .from('supplier_products')
        .select('id')
        .eq('supplier_id', supplier.id)
        .eq('product_id', globalProduct.id)
        .maybeSingle();

      if (!suppProd) {
          const { data: newSuppProd, error: insertErr } = await supabase
            .from('supplier_products')
            .insert({
                supplier_id: supplier.id,
                product_id: globalProduct.id,
                price: 25.00
            })
            .select('id')
            .single();
          if (insertErr) throw insertErr;
          supplierProductId = newSuppProd.id;
      } else {
          supplierProductId = suppProd.id;
      }
      console.log(`✓ Supplier Product mapped (${supplierProductId})`);
  } else {
      console.log(`✓ Product mapping step validated`);
  }

  // 4. Parse CSV
  console.log(`\nParsing Cohort CSV...`);
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true
  });

  console.log(`✓ ${records.length} rows parsed`);
  
  const uniquePhones = new Set(records.map((r: any) => r.phone));
  if (uniquePhones.size !== records.length) {
      console.warn(`! WARNING: Duplicate phones detected in CSV!`);
  } else {
      console.log(`✓ ${uniquePhones.size} unique phones`);
  }

  // Validate missing fields
  let issues = 0;
  for (const r of records) {
      if (!r.phone) { console.warn(`! Missing phone for ${r.name}`); issues++; }
      if (!r.price) { console.warn(`! Missing price for ${r.name}`); issues++; }
      if (!r.next_due_date) { console.warn(`! Missing next_due_date for ${r.name}`); issues++; }
  }

  if (isDryRun) {
      console.log(`\nDry run complete. Found ${issues} potential data issues.`);
      console.log(`No database changes made.`);
      process.exit(0);
  }

  // 5. Execute Import Safely
  console.log(`\nExecuting Safe Import...`);

  let imported = 0;
  for (const record of records) {
      const externalId = record.external_customer_id || record.phone; // Fallback to phone as external ID if missing
      
      // UPSERT Customer
      const normalizedPhone = record.phone.replace(/\D/g, '');
      const { data: cust, error: custErr } = await supabase
        .from('supplier_customers')
        .upsert({
            supplier_id: supplier.id,
            name: record.name,
            phone: record.phone,
            normalized_phone: normalizedPhone,
            address: record.address,
            customer_type: record.customer_type
        }, { onConflict: 'supplier_id,normalized_phone' })
        .select('id')
        .single();
        
      if (custErr || !cust) {
          console.error(`❌ Failed to import customer ${record.name}:`, custErr?.message);
          continue;
      }

      // UPSERT Customer Price
      // Because we don't have a direct onConflict composite key for customer_product_prices
      // Let's check first then insert or update
      const { data: existingPrice } = await supabase
        .from('customer_product_prices')
        .select('id')
        .eq('supplier_customer_id', cust.id)
        .eq('supplier_product_id', supplierProductId)
        .maybeSingle();

      if (!existingPrice) {
          await supabase.from('customer_product_prices').insert({
              supplier_customer_id: cust.id,
              supplier_product_id: supplierProductId,
              price: parseFloat(record.price)
          });
      } else {
          await supabase.from('customer_product_prices')
            .update({ price: parseFloat(record.price) })
            .eq('id', existingPrice.id);
      }

      // UPSERT Schedule
      const { data: existingSchedule } = await supabase
        .from('customer_delivery_schedules')
        .select('id')
        .eq('supplier_customer_id', cust.id)
        .eq('supplier_product_id', supplierProductId)
        .maybeSingle();

      if (!existingSchedule) {
          await supabase.from('customer_delivery_schedules').insert({
              supplier_customer_id: cust.id,
              supplier_product_id: supplierProductId,
              interval_days: parseInt(record.interval_days) || 1,
              quantity_per_delivery: parseInt(record.quantity_per_delivery) || 1,
              next_delivery_date: record.next_due_date,
              is_active: true
          });
      } else {
          await supabase.from('customer_delivery_schedules')
            .update({
                interval_days: parseInt(record.interval_days) || 1,
                quantity_per_delivery: parseInt(record.quantity_per_delivery) || 1,
                next_delivery_date: record.next_due_date,
                is_active: true
            })
            .eq('id', existingSchedule.id);
      }

      // UPSERT Jar Balance (Only initialize if it doesn't exist, avoid overwriting live balances)
      const { data: existingBal } = await supabase
        .from('customer_jar_balances')
        .select('id')
        .eq('supplier_customer_id', cust.id)
        .maybeSingle();

      if (!existingBal) {
          await supabase.from('customer_jar_balances').insert({
              supplier_customer_id: cust.id,
              jars_with_customer: parseInt(record.initial_jars) || 0
          });
      }

      // INITIAL OUTSTANDING (If any, via Ledger adjustment) - Optional for RC-1
      if (record.outstanding_amount && parseFloat(record.outstanding_amount) > 0) {
          // Check if we already added an initial balance for this customer
          const { data: existingAdj } = await supabase
            .from('customer_ledger_entries')
            .select('id')
            .eq('supplier_customer_id', cust.id)
            .eq('reference_type', 'adjustment')
            .maybeSingle();
            
          if (!existingAdj) {
               await supabase.from('customer_ledger_entries').insert({
                   supplier_id: supplier.id,
                   supplier_customer_id: cust.id,
                   reference_type: 'adjustment',
                   entry_type: 'debit',
                   amount: parseFloat(record.outstanding_amount)
               });
          }
      }

      imported++;
  }

  console.log(`\n✓ IMPORT COMPLETE! Successfully processed ${imported} customers.`);
}

runOnboarding().catch(console.error);

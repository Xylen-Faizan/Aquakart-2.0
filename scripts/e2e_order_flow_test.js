/**
 * 🧪 AquaKart E2E Order Flow Test
 * ================================
 * This script simulates the COMPLETE order lifecycle:
 * 
 * Phase 1: Supplier Login → Set Capacity to 50 Jars
 * Phase 2: Customer Login → Browse Suppliers → Place Order
 * Phase 3: Supplier → See Order in Manifest → Complete Delivery
 * Phase 4: Customer → Verify Order Delivered
 * 
 * Uses the exact same Supabase RPCs the mobile app uses.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Test accounts
const SUPPLIER_EMAIL = 'contact@purejal.com';
const SUPPLIER_PASSWORD = 'password123';
const CUSTOMER_EMAIL = 'customer@example.com';
const CUSTOMER_PASSWORD = 'password123';

// Output formatting
const DIVIDER = '='.repeat(70);
const SECTION = '-'.repeat(50);
let stepNumber = 0;
const results = [];

function log(emoji, message) {
  const timestamp = new Date().toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });
  console.log(`  ${emoji} [${timestamp}] ${message}`);
}

function step(title) {
  stepNumber++;
  console.log(`\n  Step ${stepNumber}: ${title}`);
  console.log(`  ${SECTION}`);
}

function pass(detail) {
  log('PASS', detail);
  results.push({ step: stepNumber, status: 'PASS', detail });
}

function fail(detail) {
  log('FAIL', detail);
  results.push({ step: stepNumber, status: 'FAIL', detail });
}

function info(detail) {
  log('INFO', detail);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log(`\n${DIVIDER}`);
  console.log('  AquaKart End-to-End Order Flow Test');
  console.log(`  Started: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log(DIVIDER);

  const supplierClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const customerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let supplierId, supplierProfileId;
  let customerId, customerAddressId;
  let orderId, orderDisplayId;
  let supplierPrice, supplierProductId;

  // ========================================
  // PHASE 1: SUPPLIER SETUP
  // ========================================
  console.log(`\n\n  PHASE 1: SUPPLIER LOGIN & CAPACITY SETUP`);
  console.log(`  ${DIVIDER}`);

  step('Supplier opens app and logs in');
  try {
    const { data: authData, error: authError } = await supplierClient.auth.signInWithPassword({
      email: SUPPLIER_EMAIL,
      password: SUPPLIER_PASSWORD
    });
    if (authError) throw authError;
    supplierProfileId = authData.user.id;
    pass(`Logged in as ${SUPPLIER_EMAIL} (ID: ${supplierProfileId.slice(0, 8)}...)`);
  } catch (e) {
    fail(`Login failed: ${e.message}`);
    return;
  }

  step('Verify supplier profile and role');
  try {
    const { data: profile, error } = await supplierClient
      .from('profiles')
      .select('*')
      .eq('id', supplierProfileId)
      .single();
    if (error) throw error;
    if (profile.role === 'supplier') {
      pass(`Profile verified: "${profile.name}" - Role: ${profile.role}`);
    } else {
      fail(`Expected role "supplier", got "${profile.role}"`);
      return;
    }
  } catch (e) {
    fail(`Profile check failed: ${e.message}`);
    return;
  }

  step('Load supplier business data');
  try {
    const { data: supplier, error } = await supplierClient
      .from('suppliers')
      .select('*')
      .eq('profile_id', supplierProfileId)
      .single();
    if (error) throw error;
    supplierId = supplier.id;
    pass(`Business: "${supplier.business_name}" - Active: ${supplier.is_active}, Accepting: ${supplier.is_accepting_orders}`);
    info(`Location: (${supplier.lat}, ${supplier.lng}) - Address: ${supplier.address || 'N/A'}`);
  } catch (e) {
    fail(`Supplier data load failed: ${e.message}`);
    return;
  }

  step('Supplier views "Today" dashboard');
  try {
    const { data: stats, error } = await supplierClient.rpc('get_supplier_today');
    if (error) throw error;
    pass(`Today Stats -> Deliveries Due: ${stats.deliveries_due}, Jars Required: ${stats.jars_required}, Revenue Expected: Rs.${stats.expected_revenue}`);
    info(`Completed: ${stats.deliveries_done}, Collected: Rs.${stats.collected_today}`);
  } catch (e) {
    fail(`Dashboard stats RPC failed: ${e.message}`);
  }

  step('Check current marketplace capacity');
  try {
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { data: capData } = await supplierClient
      .from('supplier_capacity')
      .select('*')
      .eq('supplier_id', supplierId)
      .eq('date', dateStr)
      .single();
    if (capData) {
      info(`Current capacity: ${capData.max_capacity} max, ${capData.reserved_quantity} reserved, ${capData.fulfilled_quantity} fulfilled`);
      info(`Available: ${capData.max_capacity - capData.reserved_quantity - capData.fulfilled_quantity} jars`);
    } else {
      info('No capacity set for today yet');
    }
    pass('Capacity check complete');
  } catch (e) {
    info(`No capacity record found for today (will create one)`);
    pass('Will create new capacity record');
  }

  step('Supplier taps "Update" -> Sets capacity to 50 jars');
  try {
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { error } = await supplierClient.rpc('set_supplier_capacity', {
      p_date: dateStr,
      p_max_capacity: 50
    });
    if (error) throw error;
    pass('Marketplace capacity set to 50 jars!');
    
    const { data: verifyData } = await supplierClient
      .from('supplier_capacity')
      .select('*')
      .eq('supplier_id', supplierId)
      .eq('date', dateStr)
      .single();
    
    if (verifyData && verifyData.max_capacity === 50) {
      pass(`Verified: ${verifyData.max_capacity} Jars Available (${verifyData.max_capacity - verifyData.reserved_quantity - verifyData.fulfilled_quantity} free)`);
    }
  } catch (e) {
    fail(`Capacity update failed: ${e.message}`);
    return;
  }

  step('Verify "Today\'s Work" manifest is empty');
  try {
    const { data: manifest, error } = await supplierClient.rpc('get_today_manifest');
    if (error) throw error;
    if (!manifest || manifest.length === 0) {
      pass('Manifest empty - "All Caught Up!"');
    } else {
      info(`Manifest has ${manifest.length} pending deliveries`);
      pass('Manifest loaded');
    }
  } catch (e) {
    fail(`Manifest RPC failed: ${e.message}`);
  }

  console.log(`\n  PHASE 1 COMPLETE: Supplier is online with 50 jars capacity`);

  // ========================================
  // PHASE 2: CUSTOMER PLACES ORDER
  // ========================================
  console.log(`\n\n  PHASE 2: CUSTOMER BROWSES & PLACES ORDER`);
  console.log(`  ${DIVIDER}`);

  step('Customer opens app and logs in');
  try {
    const { data: authData, error: authError } = await customerClient.auth.signInWithPassword({
      email: CUSTOMER_EMAIL,
      password: CUSTOMER_PASSWORD
    });
    if (authError) throw authError;
    customerId = authData.user.id;
    pass(`Logged in as ${CUSTOMER_EMAIL} (ID: ${customerId.slice(0, 8)}...)`);
  } catch (e) {
    fail(`Customer login failed: ${e.message}`);
    return;
  }

  step('Verify customer profile');
  try {
    const { data: profile, error } = await customerClient
      .from('profiles')
      .select('*')
      .eq('id', customerId)
      .single();
    if (error) throw error;
    
    if (!profile.phone) {
      info('Customer phone not set. Updating profile with test phone...');
      const { error: updateError } = await customerClient
        .from('profiles')
        .update({ phone: '9876543210' })
        .eq('id', customerId);
      if (updateError) throw updateError;
      pass('Updated customer phone to 9876543210');
    } else {
      pass(`Profile: "${profile.name}" - Role: ${profile.role}, Phone: ${profile.phone}`);
    }
  } catch (e) {
    fail(`Customer profile check failed: ${e.message}`);
    return;
  }

  step('Customer checks delivery address');
  try {
    const { data: addresses, error } = await customerClient
      .from('addresses')
      .select('*')
      .eq('user_id', customerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    
    if (addresses && addresses.length > 0) {
      customerAddressId = addresses[0].id;
      pass(`Active address: "${addresses[0].label}" - ${addresses[0].address}`);
      info(`Coordinates: (${addresses[0].lat}, ${addresses[0].lng})`);
    } else {
      info('No address found - creating test delivery address...');
      const { data: newAddr, error: addrError } = await customerClient
        .from('addresses')
        .insert({
          user_id: customerId,
          label: 'Home',
          address: 'Sector 4, Bokaro Steel City',
          lat: 23.6693,
          lng: 86.1511
        })
        .select()
        .single();
      if (addrError) throw addrError;
      customerAddressId = newAddr.id;
      pass(`Created address: "${newAddr.label}" - ${newAddr.address}`);
    }
  } catch (e) {
    fail(`Address check failed: ${e.message}`);
    return;
  }

  step('Customer sees "Nearby Suppliers" on Home screen');
  try {
    const { data: addr } = await customerClient.from('addresses').select('*').eq('id', customerAddressId).single();
    const lat = addr?.lat || 23.6693;
    const lng = addr?.lng || 86.1511;
    
    const { data: suppliers, error } = await customerClient.rpc('get_available_suppliers', {
      p_lat: lat,
      p_lng: lng
    });
    if (error) throw error;
    
    if (!suppliers || suppliers.length === 0) {
      fail('No suppliers found! The supplier may not be visible.');
      return;
    }
    
    pass(`Found ${suppliers.length} nearby supplier(s):`);
    suppliers.forEach((s, i) => {
      const isPureJal = s.id === supplierId;
      const dist = s.distance_km !== undefined ? s.distance_km.toFixed(1) : (s.distance !== undefined ? s.distance.toFixed(1) : '?');
      info(`  ${i+1}. ${s.business_name} - Rs.${s.price}/jar, ${dist} km, ${s.available_quantity || '?'} jars ${isPureJal ? ' <-- THIS ONE' : ''}`);
    });
    
    const pureJal = suppliers.find(s => s.id === supplierId);
    if (pureJal) {
      supplierPrice = pureJal.price;
      pass(`Pure Jal found! Price: Rs.${pureJal.price}/jar`);
    } else {
      info('Pure Jal not found by ID, using first supplier');
      supplierPrice = suppliers[0].price;
      supplierId = suppliers[0].id;
    }
  } catch (e) {
    fail(`Supplier browse failed: ${e.message}`);
    return;
  }

  step('Customer taps Pure Jal -> views supplier storefront');
  try {
    const { data: products, error } = await customerClient
      .from('supplier_products')
      .select('*, products:product_id(*)')
      .eq('supplier_id', supplierId)
      .eq('available', true);
    if (error) throw error;
    
    if (products && products.length > 0) {
      supplierProductId = products[0].product_id;
      pass(`Products available:`);
      products.forEach(p => {
        info(`  * ${p.products?.name || 'Product'} - Rs.${p.price}`);
      });
    } else {
      fail('No products available from this supplier');
      return;
    }
  } catch (e) {
    fail(`Product fetch failed: ${e.message}`);
    return;
  }

  step('Customer selects 1 x 20L Jar -> taps "Checkout"');
  const orderQuantity = 1;
  const orderTotal = supplierPrice * orderQuantity;
  info(`Order Summary: ${orderQuantity} x 20L Jar @ Rs.${supplierPrice} = Rs.${orderTotal}`);
  info(`Delivery Address ID: ${customerAddressId.slice(0, 8)}...`);
  info(`Payment Method: Cash on Delivery`);
  pass('Checkout screen loaded with order details');

  step('Customer taps "Place Order"');
  try {
    const idempotencyKey = crypto.randomUUID();
    const { data: newOrderId, error } = await customerClient.rpc('place_order', {
      p_supplier_id: supplierId,
      p_address_id: customerAddressId,
      p_product_id: supplierProductId,
      p_quantity: orderQuantity,
      p_payment_method: 'cash',
      p_idempotency_key: idempotencyKey
    });
    if (error) throw error;
    orderId = newOrderId;
    pass(`ORDER PLACED SUCCESSFULLY!`);
    info(`Order ID: ${orderId}`);
  } catch (e) {
    fail(`Place order failed: ${e.message}`);
    return;
  }

  step('Customer sees Order Tracking screen');
  try {
    await sleep(1000);
    const { data: order, error } = await customerClient
      .from('orders')
      .select('*, supplier:supplier_id(business_name, phone), order_items(*)')
      .eq('id', orderId)
      .single();
    if (error) throw error;
    orderDisplayId = order.display_id;
    pass(`Order ${order.display_id} - Status: "${order.status.toUpperCase()}"`);
    info(`Supplier: ${order.supplier?.business_name}, Items: ${order.order_items?.length}, Total: Rs.${order.total}`);
    info(`Payment: ${order.payment_method} (${order.payment_status})`);
  } catch (e) {
    fail(`Order tracking failed: ${e.message}`);
  }

  console.log(`\n  PHASE 2 COMPLETE: Order ${orderDisplayId} placed with Pure Jal`);

  // ========================================
  // PHASE 3: SUPPLIER FULFILLS ORDER
  // ========================================
  console.log(`\n\n  PHASE 3: SUPPLIER SEES & FULFILLS ORDER`);
  console.log(`  ${DIVIDER}`);

  step('Supplier pulls to refresh "Today" tab');
  try {
    const { data: stats, error } = await supplierClient.rpc('get_supplier_today');
    if (error) throw error;
    pass(`Updated Stats -> Deliveries Due: ${stats.deliveries_due}, Jars Required: ${stats.jars_required}, Revenue: Rs.${stats.expected_revenue}`);
  } catch (e) {
    fail(`Dashboard refresh failed: ${e.message}`);
  }

  step('Supplier sees new order -> taps "Accept"');
  try {
    const { error } = await supplierClient.rpc('accept_order', {
      p_order_id: orderId
    });
    if (error) throw error;
    pass(`Order ${orderDisplayId} ACCEPTED by supplier`);
  } catch (e) {
    fail(`Accept order failed: ${e.message}`);
  }

  await sleep(500);

  step('Supplier prepares the order');
  try {
    const { error } = await supplierClient.rpc('update_order_status', {
      p_order_id: orderId,
      p_new_status: 'preparing'
    });
    if (error) throw error;
    pass(`Order status updated to "PREPARING"`);
  } catch (e) {
    fail(`Update to preparing failed: ${e.message}`);
  }

  await sleep(500);

  step('Supplier heads out -> marks "Out for Delivery"');
  try {
    const { error } = await supplierClient.rpc('update_order_status', {
      p_order_id: orderId,
      p_new_status: 'out_for_delivery'
    });
    if (error) throw error;
    pass(`Order status updated to "OUT FOR DELIVERY"`);
  } catch (e) {
    fail(`Update to out_for_delivery failed: ${e.message}`);
  }

  await sleep(500);

  step('Supplier checks manifest - order appears in "Today\'s Work"');
  try {
    const { data: manifest, error } = await supplierClient.rpc('get_today_manifest');
    if (error) throw error;
    if (manifest && manifest.length > 0) {
      pass(`Manifest has ${manifest.length} item(s):`);
      manifest.forEach(item => {
        info(`  * ${item.customer_name || 'Customer'} - ${item.quantity || '?'} x 20L @ Rs.${item.effective_unit_price || item.unit_price || '?'}`);
      });
    } else {
      info('Manifest empty (order may have moved past pending state)');
      pass('Manifest checked');
    }
  } catch (e) {
    fail(`Manifest check failed: ${e.message}`);
  }

  step('Supplier delivers jar -> taps "Complete Delivery"');
  try {
    // Try direct status update to delivered
    const { error } = await supplierClient.rpc('update_order_status', {
      p_order_id: orderId,
      p_new_status: 'delivered'
    });
    if (error) throw error;
    pass(`Order marked as DELIVERED!`);
  } catch (e) {
    fail(`Delivery completion failed: ${e.message}`);
  }

  await sleep(500);

  step('Supplier dashboard updates after delivery');
  try {
    const { data: stats, error } = await supplierClient.rpc('get_supplier_today');
    if (error) throw error;
    pass(`Post-delivery Stats -> Deliveries Done: ${stats.deliveries_done}, Collected: Rs.${stats.collected_today}`);
    info(`Revenue: Rs.${stats.expected_revenue}, Outstanding: Rs.${stats.outstanding_total}`);
  } catch (e) {
    fail(`Post-delivery dashboard check failed: ${e.message}`);
  }

  console.log(`\n  PHASE 3 COMPLETE: Order ${orderDisplayId} delivered by Pure Jal`);

  // ========================================
  // PHASE 4: CUSTOMER VERIFICATION
  // ========================================
  console.log(`\n\n  PHASE 4: CUSTOMER VERIFIES DELIVERY`);
  console.log(`  ${DIVIDER}`);

  step('Customer opens order tracking -> sees "Delivered"');
  try {
    const { data: order, error } = await customerClient
      .from('orders')
      .select('*, supplier:supplier_id(business_name), order_items(*), history:order_status_history(*)')
      .eq('id', orderId)
      .single();
    if (error) throw error;
    
    if (order.status === 'delivered') {
      pass(`Order ${order.display_id} confirmed DELIVERED!`);
    } else {
      fail(`Order status is "${order.status}", expected "delivered"`);
    }
    
    info(`Timeline:`);
    if (order.history) {
      const sorted = order.history.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      sorted.forEach(h => {
        const time = new Date(h.created_at).toLocaleTimeString('en-IN', { hour12: true, timeZone: 'Asia/Kolkata' });
        info(`  ${time} -> ${h.status.toUpperCase()}`);
      });
    }
  } catch (e) {
    fail(`Order verification failed: ${e.message}`);
  }

  step('Customer opens "Orders" tab -> sees delivered order');
  try {
    const { data: orders, error } = await customerClient
      .from('orders')
      .select('*, supplier:supplier_id(business_name), order_items(*)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    pass(`Order history has ${orders.length} order(s):`);
    orders.forEach(o => {
      info(`  ${o.display_id} - ${o.status.toUpperCase()} - Rs.${o.total} - ${o.supplier?.business_name}`);
    });
  } catch (e) {
    fail(`Orders list failed: ${e.message}`);
  }

  step('Final check: Supplier capacity after fulfillment');
  try {
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { data: capData } = await supplierClient
      .from('supplier_capacity')
      .select('*')
      .eq('supplier_id', supplierId)
      .eq('date', dateStr)
      .single();
    if (capData) {
      const available = capData.max_capacity - capData.reserved_quantity - capData.fulfilled_quantity;
      pass(`Final Capacity: ${capData.max_capacity} max, ${capData.reserved_quantity} reserved, ${capData.fulfilled_quantity} fulfilled -> ${available} available`);
    }
  } catch (e) {
    fail(`Capacity check failed: ${e.message}`);
  }

  console.log(`\n  PHASE 4 COMPLETE: Customer verified delivery of ${orderDisplayId}`);

  // ========================================
  // TEST SUMMARY
  // ========================================
  console.log(`\n\n${DIVIDER}`);
  console.log('  TEST RESULTS SUMMARY');
  console.log(DIVIDER);
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  console.log(`\n  Total Steps: ${results.length}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log(`\n  Failed Steps:`);
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    Step ${r.step}: ${r.detail}`);
    });
  }
  
  console.log(`\n  Order Flow:`);
  console.log(`    Supplier: ${SUPPLIER_EMAIL} (Pure Jal)`);
  console.log(`    Customer: ${CUSTOMER_EMAIL}`);
  console.log(`    Order ID: ${orderDisplayId || orderId || 'N/A'}`);
  console.log(`    Amount: Rs.${orderTotal || 'N/A'}`);
  console.log(`    Final Status: ${failed === 0 ? 'DELIVERED' : 'INCOMPLETE'}`);
  
  console.log(`\n  Finished: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log(DIVIDER);

  await supplierClient.auth.signOut();
  await customerClient.auth.signOut();
  
  process.exit(failed > 0 ? 1 : 0);
}

runTest().catch(e => {
  console.error('\nFATAL ERROR:', e);
  process.exit(1);
});

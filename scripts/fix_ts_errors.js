const fs = require('fs');
const path = require('path');

// 1. Fix models.ts
const modelsPath = path.join(__dirname, '../packages/types/src/models.ts');
if (fs.existsSync(modelsPath)) {
  let modelsContent = fs.readFileSync(modelsPath, 'utf8');
  modelsContent = modelsContent.replace(/export type OrderStatus = Database\['public'\]\['Enums'\]\['order_status_type'\];/g, "export type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'rejected';");
  modelsContent = modelsContent.replace(/export type PaymentMethod = Database\['public'\]\['Enums'\]\['payment_method_type'\];/g, "export type PaymentMethod = 'cash' | 'upi' | 'card' | 'ledger' | string;");
  fs.writeFileSync(modelsPath, modelsContent);
}

// 2. Fix addresses.tsx
const addrPath = path.join(__dirname, '../apps/mobile/app/(customer)/addresses.tsx');
let addrContent = fs.readFileSync(addrPath, 'utf8');
addrContent = addrContent.replace(/address: AddressInput/g, 'address: Omit<AddressInput, "user_id">');
addrContent = addrContent.replace(/return addressItem\.label;/g, 'return addressItem.label || "Other";');
fs.writeFileSync(addrPath, addrContent);

// 3. Fix checkout.tsx
const checkoutPath = path.join(__dirname, '../apps/mobile/app/(customer)/checkout.tsx');
let checkoutContent = fs.readFileSync(checkoutPath, 'utf8');
checkoutContent = checkoutContent.replace(/await OrderService\.placeOrder\(\{\s*supplier_id: supplierId,\s*items,\s*address_id: selectedAddress.id,\s*payment_method: paymentMethod,\s*\}\);/g, `await OrderService.placeOrder({
          supplier_id: supplierId,
          items: items.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
          delivery_address_id: selectedAddress.id,
        });`);
fs.writeFileSync(checkoutPath, checkoutContent);

// 4. Fix home.tsx, suppliers.tsx
function replaceDistance(filePath) {
  const p = path.join(__dirname, filePath);
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(/distance_km/g, 'distance');
  content = content.replace(/supplier\.price/g, '(supplier.products?.[0]?.price || 0)');
  content = content.replace(/available_quantity/g, 'capacity?.available || 0');
  fs.writeFileSync(p, content);
}
replaceDistance('../apps/mobile/app/(customer)/home.tsx');
replaceDistance('../apps/mobile/app/(customer)/suppliers.tsx');

// 5. Fix order.ts service placeOrder parameters
const orderTsPath = path.join(__dirname, '../apps/mobile/services/order.ts');
let orderTsContent = fs.readFileSync(orderTsPath, 'utf8');
orderTsContent = orderTsContent.replace(/params\.address_id/g, 'params.delivery_address_id');
orderTsContent = orderTsContent.replace(/params\.product_id/g, 'params.items[0].product_id');
orderTsContent = orderTsContent.replace(/params\.quantity/g, 'params.items[0].quantity');
orderTsContent = orderTsContent.replace(/,\s*payment_method: params\.payment_method/g, '');
fs.writeFileSync(orderTsPath, orderTsContent);

// 6. Fix ui badge/button props in supplier screens
function fixUIProps(filePath) {
  const p = path.join(__dirname, filePath);
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(/colors\.text\b/g, 'colors.textPrimary');
  content = content.replace(/<Badge\s+variant="success"\s+text="Active"\s*\/>/g, '<Badge variant="success">Active</Badge>');
  content = content.replace(/<Badge\s+variant="default"/g, '<Badge variant="neutral"');
  content = content.replace(/size="small"/g, 'size="sm"');
  content = content.replace(/icon=\{<Ionicons[^>]*>\}/g, ''); 
  content = content.replace(/text="Pending"/g, '>Pending</Badge>');
  content = content.replace(/<Badge\s+variant="warning"\s+>Pending<\/Badge>\s*\/>/g, '<Badge variant="warning">Pending</Badge>');
  fs.writeFileSync(p, content);
}
fixUIProps('../apps/mobile/app/(supplier)/customers.tsx');
fixUIProps('../apps/mobile/app/(supplier)/deliveries.tsx');
fixUIProps('../apps/mobile/app/(supplier)/jars.tsx');
fixUIProps('../apps/mobile/app/(supplier)/more.tsx');
fixUIProps('../apps/mobile/app/(supplier)/today.tsx');

// fix colors in jars
const jarsPath = path.join(__dirname, '../apps/mobile/app/(supplier)/jars.tsx');
let jarsContent = fs.readFileSync(jarsPath, 'utf8');
jarsContent = jarsContent.replace(/color: theme.colors.warning \}/g, 'color: theme.colors.warning as string }');
jarsContent = jarsContent.replace(/color: theme.colors.success \}/g, 'color: theme.colors.success as string }');
jarsContent = jarsContent.replace(/let color = theme.colors.primary;/g, 'let color: string = theme.colors.primary;');
fs.writeFileSync(jarsPath, jarsContent);

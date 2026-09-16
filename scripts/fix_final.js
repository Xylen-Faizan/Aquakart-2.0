const fs = require('fs');
const path = require('path');

// 1. Fix addresses.tsx (Argument of type ... is not assignable to parameter of type Omit<AddressInput, 'user_id'>)
const addrServicePath = path.join(__dirname, '../apps/mobile/services/address.ts');
let addrServiceContent = fs.readFileSync(addrServicePath, 'utf8');
addrServiceContent = addrServiceContent.replace(/address: AddressInput/g, 'address: Omit<AddressInput, "user_id">');
fs.writeFileSync(addrServicePath, addrServiceContent);

const addrPath = path.join(__dirname, '../apps/mobile/app/(customer)/addresses.tsx');
let addrContent = fs.readFileSync(addrPath, 'utf8');
addrContent = addrContent.replace(/addressItem\.label/g, 'addressItem.label || "Other"');
fs.writeFileSync(addrPath, addrContent);

// 2. Fix checkout.tsx
const checkoutPath = path.join(__dirname, '../apps/mobile/app/(customer)/checkout.tsx');
let checkoutContent = fs.readFileSync(checkoutPath, 'utf8');
checkoutContent = checkoutContent.replace(/address_id: selectedAddress\.id/g, 'delivery_address_id: selectedAddress.id');
fs.writeFileSync(checkoutPath, checkoutContent);

// 3. Fix models.ts OrderStatus and AvailableSupplier
const modelsPath = path.join(__dirname, '../packages/types/src/models.ts');
let modelsContent = fs.readFileSync(modelsPath, 'utf8');
if (!modelsContent.includes("'placed'")) {
  modelsContent = modelsContent.replace(/export type OrderStatus = 'pending'/g, "export type OrderStatus = 'placed' | 'pending'");
}
if (!modelsContent.includes('capacity?:')) {
  modelsContent = modelsContent.replace(/distance\?: number;/g, 'distance?: number;\n  capacity?: { available: number };');
}
fs.writeFileSync(modelsPath, modelsContent);

// 4. Fix Badge props in UI components
function fixBadgeProps(filePath) {
  const p = path.join(__dirname, filePath);
  let content = fs.readFileSync(p, 'utf8');
  
  // Revert children back to label
  content = content.replace(/<Badge variant="success">Active \(\{activeCount\}\)<\/Badge>/g, '<Badge variant="success" label={`Active (${activeCount})`} />');
  content = content.replace(/<Badge variant="success">Active<\/Badge>/g, '<Badge variant="success" label="Active" />');
  content = content.replace(/<Badge variant="warning">Pending<\/Badge>/g, '<Badge variant="warning" label="Pending" />');
  // Also check if any text="xyz" is still around
  content = content.replace(/<Badge([^>]*)text=\{([^}]*)\}\s*\/>/g, '<Badge$1label={$2} />');
  content = content.replace(/<Badge([^>]*)text="([^"]*)"\s*\/>/g, '<Badge$1label="$2" />');
  
  fs.writeFileSync(p, content);
}
fixBadgeProps('../apps/mobile/app/(supplier)/customers.tsx');
fixBadgeProps('../apps/mobile/app/(supplier)/deliveries.tsx');

// 5. Fix order.ts service 
const orderTsPath = path.join(__dirname, '../apps/mobile/services/order.ts');
let orderTsContent = fs.readFileSync(orderTsPath, 'utf8');
orderTsContent = orderTsContent.replace(/,\s*payment_method: params\.payment_method/g, ''); // Ensure payment_method is removed
fs.writeFileSync(orderTsPath, orderTsContent);


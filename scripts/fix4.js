const fs = require('fs');
const path = require('path');

// 1. addresses.tsx label
const addrPath = path.join(__dirname, '../apps/mobile/app/(customer)/addresses.tsx');
let addrContent = fs.readFileSync(addrPath, 'utf8');
addrContent = addrContent.replace(/label=\{item\.label\}/g, 'label={item.label || "Other"}');
fs.writeFileSync(addrPath, addrContent);

// 2. checkout.tsx address_id
const checkoutPath = path.join(__dirname, '../apps/mobile/app/(customer)/checkout.tsx');
let checkoutContent = fs.readFileSync(checkoutPath, 'utf8');
checkoutContent = checkoutContent.replace(/address_id:/g, 'delivery_address_id:');
fs.writeFileSync(checkoutPath, checkoutContent);

// 3. suppliers.tsx price
const suppPath = path.join(__dirname, '../apps/mobile/app/(customer)/suppliers.tsx');
let suppContent = fs.readFileSync(suppPath, 'utf8');
suppContent = suppContent.replace(/supplier\.price/g, '(supplier.products?.[0]?.price || 0)');
suppContent = suppContent.replace(/supplier\.capacity/g, '(supplier.capacity?.available || 0)');
fs.writeFileSync(suppPath, suppContent);

// 4. customers.tsx & deliveries.tsx badge props
function fixBadges(filePath) {
  const p = path.join(__dirname, filePath);
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(/<Badge\s+variant="([a-zA-Z]+)">([^<]+)<\/Badge>/g, '<Badge variant="$1" label="$2" />');
  content = content.replace(/<Badge\s+variant="([a-zA-Z]+)">([^<]*\{[^}]*\}[^<]*)<\/Badge>/g, '<Badge variant="$1" label={`$2`} />');
  
  // just in case we have text= hanging around still:
  content = content.replace(/<Badge([^>]*)text=\{([^}]*)\}\s*\/>/g, '<Badge$1label={$2} />');
  content = content.replace(/<Badge([^>]*)text="([^"]*)"\s*\/>/g, '<Badge$1label="$2" />');

  // default to neutral
  content = content.replace(/variant="default"/g, 'variant="neutral"');
  fs.writeFileSync(p, content);
}
fixBadges('../apps/mobile/app/(supplier)/customers.tsx');
fixBadges('../apps/mobile/app/(supplier)/deliveries.tsx');

// 5. order.ts payment_method
const orderTsPath = path.join(__dirname, '../apps/mobile/services/order.ts');
let orderTsContent = fs.readFileSync(orderTsPath, 'utf8');
orderTsContent = orderTsContent.replace(/,\s*payment_method: params\.payment_method/g, '');
orderTsContent = orderTsContent.replace(/payment_method:/g, '// payment_method:'); // safe fallback
fs.writeFileSync(orderTsPath, orderTsContent);


const fs = require('fs');
const path = require('path');

// 1. checkout.tsx
const checkoutPath = path.join(__dirname, '../apps/mobile/app/(customer)/checkout.tsx');
let checkoutContent = fs.readFileSync(checkoutPath, 'utf8');
checkoutContent = checkoutContent.replace(/supplier_id: params\.supplier_id!,\n\s*delivery_address_id: selectedAddress,\n\s*product_id: params\.product_id!,\n\s*quantity,\n\s*payment_method: paymentMethod,/g, 
  `supplier_id: params.supplier_id!,
        delivery_address_id: selectedAddress,
        items: [{ product_id: params.product_id!, quantity }]`);
fs.writeFileSync(checkoutPath, checkoutContent);

// 2. order.ts
const orderTsPath = path.join(__dirname, '../apps/mobile/services/order.ts');
let orderTsContent = fs.readFileSync(orderTsPath, 'utf8');
orderTsContent = orderTsContent.replace(/p_\/\/\s*payment_method:\s*params\.payment_method,/g, '');
fs.writeFileSync(orderTsPath, orderTsContent);

// 3. customers.tsx & deliveries.tsx badge props
function fixBadges(filePath) {
  const p = path.join(__dirname, filePath);
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(/variant="default"/g, 'variant="neutral"');
  content = content.replace(/text=\{/g, 'label={');
  content = content.replace(/text="/g, 'label="');
  fs.writeFileSync(p, content);
}
fixBadges('../apps/mobile/app/(supplier)/customers.tsx');
fixBadges('../apps/mobile/app/(supplier)/deliveries.tsx');


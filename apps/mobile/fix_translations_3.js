const fs = require('fs');

const translationsFile = 'f:/Aquakart 2.0/aquakart-2/apps/mobile/features/i18n/translations.ts';
let content = fs.readFileSync(translationsFile, 'utf8');

// 1. Clean up the misplaced block at the end of the file.
// The block starts around `// --- Additional Missing Keys ---` (line 1399) and goes until the end.
const misplacedStartIndex = content.lastIndexOf('// --- Additional Missing Keys ---');
if (misplacedStartIndex !== -1) {
  content = content.substring(0, misplacedStartIndex);
  // Re-add the closing of translations object correctly.
  content = content.trimEnd() + '\n};\n';
}

const additionalKeys = {
  "khata.bill": "Bill",
  "khata.jarsThisMonth": "Jars This Month",
  "khata.billGenerated": "Bill Generated",
  "khata.paidThisMonth": "Paid This Month",
  "khata.emptyJarsWithYou": "Empty Jars With You",
  "khata.jars": "Jars",
  "khata.dailyRecord": "Daily Record",
  "khata.loadingLedger": "Loading Ledger",
  "khata.deliveryReceived": "Delivery Received",
  "khata.paymentMade": "Payment Made",
  "khata.delivered": "Delivered",
  "khata.returned": "Returned",
  "khata.via": "Via",
  "khata.noRecordsFound": "No Records Found",
  "window": "Window",
  "customers.filter_All": "All",
  "customers.filter_household": "Household",
  "customers.filter_office": "Office",
  "customers.filter_business": "Business",
  "household": "Household",
  "office": "Office",
  "business": "Business",
  "Default Price": "Default Price"
};

let extraString = '\n    // --- Manual Fix Keys ---\n';
for (const [key, val] of Object.entries(additionalKeys)) {
  extraString += `    "${key}": "${val}",\n`;
}

// Safely insert into EN
// find the end of the EN block, which is right before `  hi: {`
const hiIndex = content.indexOf('  hi: {');
if (hiIndex !== -1) {
  const enEndIndex = content.lastIndexOf('},', hiIndex);
  if (enEndIndex !== -1) {
    content = content.slice(0, enEndIndex) + extraString + content.slice(enEndIndex);
  }
}

// Safely insert into HI
// find the end of the HI block, which is right before the last `};`
const finalEndIndex = content.lastIndexOf('};');
if (finalEndIndex !== -1) {
  const hiEndIndex = content.lastIndexOf('}', finalEndIndex);
  if (hiEndIndex !== -1) {
    content = content.slice(0, hiEndIndex) + extraString + content.slice(hiEndIndex);
  }
}

fs.writeFileSync(translationsFile, content, 'utf8');
console.log('Fixed translations.ts!');

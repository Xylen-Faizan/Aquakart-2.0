const fs = require('fs');
const path = require('path');
const custPath = path.join(__dirname, '../apps/mobile/app/(supplier)/customers.tsx');
let content = fs.readFileSync(custPath, 'utf8');

// 1. handleSchedule
content = content.replace(
  /const handleSchedule = \(customer: SupplierCustomer\) => \{\n\s*setSelectedCustomer\(customer\);\n\s*setScheduleModalVisible\(true\);\n\s*\};/g,
  `const handleSchedule = (customer: SupplierCustomer) => {
    setSelectedCustomer(customer);
    setScheduleQuantity(customer.schedule_quantity ? String(customer.schedule_quantity) : '1');
    setIntervalDays(customer.schedule_interval ? String(customer.schedule_interval) : '2');
    setScheduleModalVisible(true);
  };`
);

// 2. Add toggleScheduleStatus function
const addFunc = `
  const toggleScheduleStatus = async () => {
    if (!selectedCustomer) return;
    try {
      setIsUpdatingSchedule(true);
      const isActive = !selectedCustomer.schedule_active;
      await CustomerService.setCustomerScheduleStatus({
        customerId: selectedCustomer.id,
        productId: '00000000-0000-0000-0000-000000000001', // 20L Jar
        isActive
      });
      await fetchCustomers();
      setScheduleModalVisible(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update schedule status');
    } finally {
      setIsUpdatingSchedule(false);
    }
  };
`;
// inject it before saveSchedule
content = content.replace(/const saveSchedule = async \(\) => \{/, addFunc + '\n  const saveSchedule = async () => {');

// 3. Update modal actions
content = content.replace(
  /<View style=\{styles\.modalActions\}>\n\s*<Button title="Cancel" variant="outline" onPress=\{[^}]*\} style=\{\{ flex: 1 \}\} \/>\n\s*<Button title="Save Schedule" variant="primary" onPress=\{saveSchedule\} loading=\{isUpdatingSchedule\} style=\{\{ flex: 1, marginLeft: 12 \}\} \/>\n\s*<\/View>/,
  `<View style={styles.modalActions}>
              <Button title="Cancel" variant="outline" onPress={() => setScheduleModalVisible(false)} style={{ flex: 1 }} />
              {selectedCustomer?.schedule_quantity && (
                <Button 
                  title={selectedCustomer.schedule_active ? "Pause" : "Resume"} 
                  variant={selectedCustomer.schedule_active ? "warning" : "success"} 
                  onPress={toggleScheduleStatus} 
                  loading={isUpdatingSchedule} 
                  style={{ flex: 1, marginLeft: 8 }} 
                />
              )}
              <Button title="Save Schedule" variant="primary" onPress={saveSchedule} loading={isUpdatingSchedule} style={{ flex: 1, marginLeft: 8 }} />
            </View>`
);

// 4. Also add a nice visual indicator on the customer card if a schedule is active
content = content.replace(
  /<Badge variant="success" label=\{customer\.active_price \? \`₹\$\{customer\.active_price\} \/ 20L\` : 'Default Price'\} \/>\n\s*<\/View>/,
  `<Badge variant="success" label={customer.active_price ? \`₹\${customer.active_price} / 20L\` : 'Default Price'} />
                  {customer.schedule_active ? (
                    <Badge variant="info" label={\`\${customer.schedule_quantity} Jars / \${customer.schedule_interval}d\`} />
                  ) : customer.schedule_quantity ? (
                    <Badge variant="neutral" label="Paused" />
                  ) : null}
                </View>`
);

fs.writeFileSync(custPath, content);

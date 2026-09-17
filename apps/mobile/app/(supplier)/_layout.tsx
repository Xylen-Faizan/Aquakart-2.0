import { Tabs } from 'expo-router';
import { theme } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function SupplierLayout() {
  return (
    <Tabs screenOptions={{ 
      headerShown: true,
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.textTertiary,
    }}>
      <Tabs.Screen 
        name="today" 
        options={{ 
          title: 'Today',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="customers" 
        options={{ 
          title: 'Customers',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="deliveries" 
        options={{ 
          title: 'Deliveries',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="car-outline" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="jars" 
        options={{ 
          title: 'Jars',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="water-outline" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="more" 
        options={{ 
          title: 'More',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="menu-outline" size={24} color={color} />
        }} 
      />
      <Tabs.Screen
        name="order/[id]"
        options={{
          href: null,
          title: 'Order Details'
        }}
      />
      <Tabs.Screen
        name="business"
        options={{
          href: null,
          title: 'Business Profile'
        }}
      />
      <Tabs.Screen
        name="pricing"
        options={{
          href: null,
          title: 'Pricing & Catalog'
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          href: null,
          title: 'Ledger Reports'
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          title: 'Settings'
        }}
      />
    </Tabs>
  );
}

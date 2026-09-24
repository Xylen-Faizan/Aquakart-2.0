import { Tabs } from "expo-router";
import { theme } from "../../constants/theme";
import { Ionicons } from "@expo/vector-icons";

export default function SupplierLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "Today",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Ionicons name="home-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: "Customers",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Ionicons name="people-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="fleet"
        options={{
          title: "Live Fleet",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Ionicons name="car-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="jars"
        options={{
          title: "Jars",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Ionicons name="water-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Ionicons name="menu-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="order/[id]"
        options={{
          href: null,
          title: "Order Details",
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          href: null,
          title: "Routes",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="more/team"
        options={{
          href: null,
          title: "Team & Crew",
        }}
      />
      <Tabs.Screen
        name="khata/[id]"
        options={{
          href: null,
          title: "Khata",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="more/marketplace-history"
        options={{
          href: null,
          title: "Marketplace History",
          headerShown: false,
        }}
      />
    </Tabs>
  );
}

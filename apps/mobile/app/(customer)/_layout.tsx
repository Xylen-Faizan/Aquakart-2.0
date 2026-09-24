import { Tabs } from "expo-router";
import { theme } from "../../constants/theme";
import { Ionicons } from "@expo/vector-icons";

export default function CustomerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Ionicons name="home-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          headerShown: true,
          tabBarIcon: ({ color }) => (
            <Ionicons name="receipt-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="khata"
        options={{
          title: "Khata",
          headerShown: true,
          tabBarIcon: ({ color }) => (
            <Ionicons name="book-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reorder"
        options={{
          title: "Repeat",
          headerShown: true,
          tabBarIcon: ({ color }) => (
            <Ionicons name="refresh-outline" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-outline" size={24} color={color} />
          ),
        }}
      />

      {/* Hidden Screens */}
      <Tabs.Screen
        name="addresses"
        options={{
          href: null,
          title: "Addresses",
        }}
      />
      <Tabs.Screen
        name="checkout"
        options={{
          href: null,
          title: "Checkout",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="suppliers"
        options={{
          href: null,
          title: "Suppliers",
        }}
      />
      <Tabs.Screen
        name="supplier/[id]"
        options={{
          href: null,
          title: "Supplier Details",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="product/[id]"
        options={{
          href: null,
          title: "Product Details",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="order/[id]"
        options={{
          href: null,
          title: "Order Tracking",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="arrival-alert"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="track-order"
        options={{
          href: null,
          title: "Track Order",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="bulk-orders"
        options={{
          href: null,
          headerShown: false,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          href: null,
          title: "Search",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="brand/[name]"
        options={{
          href: null,
          title: "Brand Products",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          href: null,
          title: "Catalog",
          headerShown: false,
        }}
      />
    </Tabs>
  );
}

import { Stack } from "expo-router";
import { theme } from "../../constants/theme";

export default function CustomerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="delete-account"
        options={{
          title: "Delete Account",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="addresses"
        options={{
          title: "Addresses",
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="checkout"
        options={{
          title: "Checkout",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="suppliers"
        options={{
          title: "Suppliers",
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="supplier/[id]"
        options={{
          title: "Supplier Details",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="product/[id]"
        options={{
          title: "Product Details",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="order/[id]"
        options={{
          title: "Order Tracking",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="arrival-alert"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="track-order"
        options={{
          title: "Track Order",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="bulk-orders"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="search"
        options={{
          title: "Search",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="brand/[name]"
        options={{
          title: "Brand Products",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="catalog"
        options={{
          title: "Catalog",
          headerShown: false,
        }}
      />
    </Stack>
  );
}

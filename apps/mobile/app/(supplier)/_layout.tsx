import { Stack } from "expo-router";
import { theme } from "../../constants/theme";

export default function SupplierLayout() {
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
        name="order/[id]"
        options={{
          title: "Order Details",
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="routes"
        options={{
          title: "Routes",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="khata/[id]"
        options={{
          title: "Khata",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="more"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}

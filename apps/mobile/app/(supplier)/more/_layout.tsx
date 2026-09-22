import { Stack } from "expo-router";
import { theme } from "../../../constants/theme";

export default function MoreStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.textPrimary,
        headerBackTitle: "",
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="business" options={{ title: "Business Profile" }} />
      <Stack.Screen name="pricing" options={{ title: "Pricing & Catalog" }} />
      <Stack.Screen name="ledger" options={{ title: "Ledger Reports" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
    </Stack>
  );
}

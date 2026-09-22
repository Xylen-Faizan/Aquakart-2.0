import { Stack, Redirect } from "expo-router";
import { useAuth } from "../../features/auth/AuthProvider";
import { ActivityIndicator, View } from "react-native";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase/client";

export default function DriverLayout() {
  const { session, loading } = useAuth();
  const [isDriver, setIsDriver] = useState<boolean | null>(null);

  useEffect(() => {
    if (session?.user) {
      checkDriverRole();
    }
  }, [session]);

  const checkDriverRole = async () => {
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select("id")
        .eq("profile_id", session?.user.id)
        .eq("is_active", true)
        .single();

      setIsDriver(!!data);
    } catch (e) {
      setIsDriver(false);
    }
  };

  if (loading || isDriver === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href={"/(auth)/customer-auth" as any} />;
  }

  if (!isDriver) {
    // If not a driver, redirect back to root or customer/supplier depending on main logic
    return <Redirect href="/" />;
  }

  return (
    <Stack>
      <Stack.Screen
        name="route"
        options={{ title: "Today's Route", headerShown: true }}
      />
    </Stack>
  );
}

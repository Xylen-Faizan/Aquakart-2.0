import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { useRouter } from "expo-router";

/**
 * Custom hook that fixes the Android hardware back button behavior.
 *
 * In Expo Router's Tabs navigator, hidden screens (href: null) still behave
 * like tab screens for back navigation — pressing the hardware back button
 * jumps to the initial tab (Home) instead of going back to the previous screen.
 *
 * This hook intercepts the Android hardware back button and calls router.back()
 * so the user is taken to the actual previous screen in the navigation stack.
 *
 * Usage: Call `useAndroidBack()` at the top of any screen component that should
 * have proper "go back" behavior on Android hardware back press.
 */
export function useAndroidBack() {
  const router = useRouter();

  useEffect(() => {
    // Only needed on Android
    if (Platform.OS !== "android") return;

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (router.canGoBack()) {
          router.back();
          return true; // Prevent default tab-switching behavior
        }
        return false; // Allow default (exit app) if can't go back
      },
    );

    return () => backHandler.remove();
  }, [router]);
}

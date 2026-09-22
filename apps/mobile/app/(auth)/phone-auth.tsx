import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "../../features/auth/AuthProvider";
import { Input, Button } from "../../components/ui";
import { theme } from "../../constants/theme";

export default function PhoneAuthScreen() {
  const { signInWithPhone, verifyPhoneOtp } = useAuth();

  const [step, setStep] = useState<"PHONE" | "OTP">("PHONE");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOtp = async () => {
    if (!phone || phone.length < 10) {
      setError(
        "Please enter a valid phone number with country code (e.g., +919876543210)",
      );
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;

      const { error } = await signInWithPhone(formattedPhone);

      if (error) {
        setError(error.message);
      } else {
        setPhone(formattedPhone);
        setStep("OTP");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      setError("Please enter a valid 6-digit OTP");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { error } = await verifyPhoneOtp(phone, otp);

      if (error) {
        setError(error.message);
      } else {
        router.replace("/");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => (step === "OTP" ? setStep("PHONE") : router.back())}
            style={styles.backButton}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={theme.colors.textPrimary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Image
            source={require("../../assets/images/logo.png")}
            style={{ width: 120, height: 120, marginBottom: theme.spacing.lg }}
            resizeMode="contain"
          />
          <Text style={styles.title}>
            {step === "PHONE" ? "Enter Phone" : "Verify OTP"}
          </Text>
          <Text style={styles.subtitle}>
            {step === "PHONE"
              ? "We will send a 6-digit code to verify your number."
              : `Enter the code sent to ${phone}`}
          </Text>
        </View>

        <View style={styles.form}>
          {step === "PHONE" ? (
            <>
              <Input
                label="Phone Number"
                placeholder="+91 98765 43210"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                leftElement={
                  <Ionicons
                    name="call-outline"
                    size={20}
                    color={theme.colors.textTertiary}
                  />
                }
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <Button
                title="Send Code"
                onPress={handleSendOtp}
                loading={loading}
                size="lg"
                style={{ marginTop: 16 }}
              />
            </>
          ) : (
            <>
              <Input
                label="6-Digit OTP"
                placeholder="123456"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                leftElement={
                  <Ionicons
                    name="keypad-outline"
                    size={20}
                    color={theme.colors.textTertiary}
                  />
                }
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <Button
                title="Verify & Login"
                onPress={handleVerifyOtp}
                loading={loading}
                size="lg"
                style={{ marginTop: 16 }}
              />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flexGrow: 1,
    padding: theme.spacing.xl,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.xl,
    marginTop: Platform.OS === "ios" ? theme.spacing.xl : theme.spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    marginBottom: theme.spacing.xl,
    alignItems: "flex-start",
  },
  title: {
    fontSize: 32,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    lineHeight: 24,
  },
  form: {
    width: "100%",
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing.md,
    textAlign: "center",
  },
});

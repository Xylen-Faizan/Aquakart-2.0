import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAndroidBack } from "../../hooks/useAndroidBack";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../features/auth/AuthProvider";
import { supabase } from "../../lib/supabase/client";
import { theme } from "../../constants/theme";
import { Card, Button, Input } from "../../components/ui";
import { useLanguage } from "../../features/i18n/LanguageProvider";
import { LedgerService } from "../../services/ledger";

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();
  useAndroidBack();

  const [confirmText, setConfirmText] = useState("");
  const [checkingBalance, setCheckingBalance] = useState(true);
  const [outstandingBalances, setOutstandingBalances] = useState<{supplier: string, amount: number}[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    checkBalances();
  }, []);

  const checkBalances = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('supplier_customers')
        .select(`id, suppliers(business_name)`)
        .eq('user_id', user.id);
        
      if (!data || data.length === 0) {
        setCheckingBalance(false);
        return;
      }

      const now = new Date();
      const currentMonth = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().substring(0, 7);
      
      const balances = [];
      for (const sc of data) {
        try {
          const sumData = await LedgerService.getCustomerKhataSummary(sc.id, currentMonth);
          if (sumData && sumData.outstanding > 0) {
            const suppliers = sc.suppliers as any;
            const businessName = Array.isArray(suppliers) ? suppliers[0]?.business_name : suppliers?.business_name;
            balances.push({
              supplier: businessName || 'Supplier',
              amount: sumData.outstanding
            });
          }
        } catch (e) {
          console.error(e);
        }
      }
      setOutstandingBalances(balances);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingBalance(false);
    }
  };

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;

    setIsDeleting(true);
    try {
      const { error } = await supabase.rpc('request_account_deletion');
      if (error) throw error;
      
      Alert.alert(
        "Account Deletion Requested",
        "Your account will be permanently deleted in 30 days. You can cancel this request by logging in before the 30-day period ends.",
        [
          { 
            text: "OK", 
            onPress: () => signOut()
          }
        ]
      );
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to request account deletion");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.textPrimary}
          />
        </Pressable>
        <Text style={styles.title}>Delete Account</Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: theme.spacing.lg }}
      >
        <Card style={styles.warningCard}>
          <View style={styles.cardHeader}>
            <Ionicons name="warning" size={24} color={theme.colors.error} />
            <Text style={styles.warningTitle}>Warning</Text>
          </View>
          <Text style={styles.cardText}>
            Deleting your account will result in the permanent loss of:
          </Text>
          <Text style={styles.listItem}>• Your profile and personal data</Text>
          <Text style={styles.listItem}>• Order history and active subscriptions</Text>
          <Text style={styles.listItem}>• Saved addresses and payment methods</Text>
        </Card>

        <Card style={styles.retentionCard}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle" size={24} color={theme.colors.primary || '#3b82f6'} />
            <Text style={styles.retentionTitle}>Legal Retention</Text>
          </View>
          <Text style={styles.cardText}>
            For legal and compliance reasons, we will retain:
          </Text>
          <Text style={styles.listItem}>• Past transaction records</Text>
          <Text style={styles.listItem}>• Outstanding Khata balances</Text>
          <Text style={styles.listItem}>• Details of empty jars pending return</Text>
        </Card>

        {checkingBalance ? (
          <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 20 }} />
        ) : outstandingBalances.length > 0 ? (
          <Card style={styles.balanceCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="wallet" size={24} color={theme.colors.warning} />
              <Text style={styles.balanceTitle}>Outstanding Balance</Text>
            </View>
            <Text style={styles.cardText}>
              You have outstanding balances with the following suppliers. Please clear them directly with the supplier.
            </Text>
            {outstandingBalances.map((bal, idx) => (
              <View key={idx} style={styles.balanceItem}>
                <Text style={styles.balanceSupplier}>{bal.supplier}</Text>
                <Text style={styles.balanceAmount}>₹{bal.amount}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        <View style={styles.confirmSection}>
          <Text style={styles.confirmLabel}>
            Type <Text style={{ fontWeight: "bold" }}>DELETE</Text> to confirm
          </Text>
          <Input
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="DELETE"
            autoCapitalize="characters"
          />
        </View>

        <View style={{ height: 40 }} />

        <Button
          title="Delete Account"
          variant="danger"
          onPress={handleDelete}
          disabled={confirmText !== "DELETE" || isDeleting}
          loading={isDeleting}
        />
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { marginRight: theme.spacing.md },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  container: { flex: 1 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  warningCard: {
    marginBottom: theme.spacing.xl,
    backgroundColor: theme.colors.error + "10",
    borderColor: theme.colors.error + "30",
    borderWidth: 1,
  },
  warningTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: "bold",
    color: theme.colors.error,
    marginLeft: theme.spacing.sm,
  },
  retentionCard: {
    marginBottom: theme.spacing.xl,
    backgroundColor: (theme.colors.primary || '#3b82f6') + "10",
    borderColor: (theme.colors.primary || '#3b82f6') + "30",
    borderWidth: 1,
  },
  retentionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: "bold",
    color: theme.colors.primary || '#3b82f6',
    marginLeft: theme.spacing.sm,
  },
  balanceCard: {
    marginBottom: theme.spacing.xl,
    backgroundColor: theme.colors.warning + "10",
    borderColor: theme.colors.warning + "30",
    borderWidth: 1,
  },
  balanceTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: "bold",
    color: theme.colors.warning,
    marginLeft: theme.spacing.sm,
  },
  balanceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing.sm,
  },
  balanceSupplier: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: "500",
  },
  balanceAmount: {
    fontSize: theme.fontSize.md,
    color: theme.colors.error,
    fontWeight: "bold",
  },
  cardText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    lineHeight: 22,
  },
  listItem: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    marginLeft: theme.spacing.sm,
    marginBottom: 4,
  },
  confirmSection: {
    marginTop: theme.spacing.md,
  },
  confirmLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
});

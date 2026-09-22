import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SupplierService } from "../../services/supplier";
import type { AvailableSupplier } from "@aquakart/types";
import { theme } from "../../constants/theme";
import { Card, Button, Badge, Input } from "../../components/ui";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/feedback";

export default function SuppliersScreen() {
  const [suppliers, setSuppliers] = useState<AvailableSupplier[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      setError(null);
      // In a real app, we'd get the user's location here
      const data = await SupplierService.getAvailableSuppliers();
      setSuppliers(data);
    } catch (err: any) {
      setError(err.message || "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSupplier = (id: string) => {
    router.push(`/(customer)/supplier/${id}`);
  };

  const filteredSuppliers = suppliers.filter((s) =>
    s.business_name?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={theme.colors.textPrimary}
          />
        </TouchableOpacity>
        <Text style={styles.title}>Find Suppliers</Text>
        <View style={{ width: 40 }} /> {/* For centering balance */}
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Input
            placeholder="Search suppliers..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftElement={
              <Ionicons
                name="search"
                size={20}
                color={theme.colors.textTertiary}
              />
            }
            style={styles.searchInput}
          />
        </View>
        <TouchableOpacity style={styles.filterButton}>
          <Ionicons
            name="options-outline"
            size={24}
            color={theme.colors.primary}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingState message="Finding nearby suppliers..." />
      ) : error ? (
        <ErrorState title="Error" message={error} onRetry={fetchSuppliers} />
      ) : (
        <FlatList
          data={filteredSuppliers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isLowCapacity = (item.available_quantity || 0) < 20;
            return (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => handleSelectSupplier(item.id)}
              >
                <Card elevated style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardTitleContainer}>
                      <Text style={styles.businessName} numberOfLines={1}>
                        {item.business_name}
                      </Text>
                      <View style={styles.distanceContainer}>
                        <Ionicons
                          name="location"
                          size={12}
                          color={theme.colors.textSecondary}
                        />
                        <Text style={styles.distanceText}>
                          {item.distance != null
                            ? `${item.distance.toFixed(1)} km away`
                            : "Nearby"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.priceContainer}>
                      <Text style={styles.priceSymbol}>₹</Text>
                      <Text style={styles.priceValue}>{item.price || 0}</Text>
                      <Text style={styles.priceUnit}>/can</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.cardBottomRow}>
                    <Badge
                      label={isLowCapacity ? "Low Capacity" : "Available"}
                      variant={isLowCapacity ? "warning" : "success"}
                    />
                    <Text style={styles.capacityText}>
                      Capacity: {item.available_quantity || 0} cans
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title="No suppliers found"
              message={
                searchQuery
                  ? "No suppliers match your search."
                  : "There are no active suppliers accepting orders in your area right now."
              }
              actionLabel="Refresh"
              onAction={fetchSuppliers}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.lg,
    paddingTop: Platform.OS === "ios" ? theme.spacing.xl : theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  searchInputWrapper: {
    flex: 1,
  },
  searchInput: {
    backgroundColor: theme.colors.background,
  },
  filterButton: {
    width: 52,
    height: 52,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(26, 86, 219, 0.1)",
  },
  list: {
    padding: theme.spacing.lg,
  },
  card: {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing.md,
  },
  cardTitleContainer: {
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  businessName: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: 6,
  },
  distanceContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  distanceText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  priceSymbol: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.primary,
    marginTop: 2,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.primary,
  },
  priceUnit: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 10,
    marginLeft: 2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  capacityText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium as any,
    color: theme.colors.textSecondary,
  },
});

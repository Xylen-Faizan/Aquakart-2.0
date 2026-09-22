import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../../constants/theme";
import { supabase } from "../../lib/supabase/client";
import { LoadingState } from "../../components/feedback";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; type: "supplier" | "product"; image?: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [addressId, setAddressId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("selectedAddressId").then(setAddressId);
  }, []);

  useEffect(() => {
    if (query.trim().length > 1) {
      const delayDebounceFn = setTimeout(() => {
        performSearch(query.trim());
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setResults([]);
    }
  }, [query]);

  const performSearch = async (searchTerm: string) => {
    setLoading(true);
    try {
      const formattedTerm = `%${searchTerm}%`;

      // Search suppliers
      const { data: suppliers } = await supabase
        .from("suppliers")
        .select("id, business_name")
        .ilike("business_name", formattedTerm)
        .limit(5);

      // Search products
      const { data: products } = await supabase
        .from("products")
        .select("id, name, image_url")
        .ilike("name", formattedTerm)
        .limit(10);

      const combined: any[] = [];
      if (suppliers) {
        combined.push(
          ...suppliers.map((s) => ({
            id: s.id,
            name: s.business_name,
            type: "supplier",
          })),
        );
      }
      if (products) {
        combined.push(
          ...products.map((p) => ({
            id: p.id,
            name: p.name,
            type: "product",
            image: p.image_url,
          })),
        );
      }

      setResults(combined);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (item: any) => {
    if (item.type === "supplier") {
      router.push(`/(customer)/supplier/${item.id}` as any);
    } else {
      // For products, usually we route to supplier list filtered by product, but here we can route to suppliers page with search param
      router.push({
        pathname: "/(customer)/suppliers",
        params: { search: item.name },
      } as any);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.textPrimary}
          />
        </Pressable>
        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={20}
            color={theme.colors.textTertiary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search water, jars, suppliers..."
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholderTextColor={theme.colors.textTertiary}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")}>
              <Ionicons
                name="close-circle"
                size={20}
                color={theme.colors.textTertiary}
              />
            </Pressable>
          )}
        </View>
      </View>

      {loading && query.length > 1 ? (
        <View style={{ marginTop: 40 }}>
          <LoadingState message="Searching..." />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.type + "-" + item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.resultItem}
              onPress={() => handleSelect(item)}
            >
              <View style={styles.iconContainer}>
                {item.type === "supplier" ? (
                  <Text style={styles.emoji}>🏪</Text>
                ) : item.image ? (
                  <Image
                    source={{ uri: item.image }}
                    style={styles.productImage}
                  />
                ) : (
                  <Text style={styles.emoji}>💧</Text>
                )}
              </View>
              <View style={styles.resultInfo}>
                <Text style={styles.resultName}>{item.name}</Text>
                <Text style={styles.resultType}>
                  {item.type === "supplier" ? "Supplier" : "Product"}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.border}
              />
            </Pressable>
          )}
          ListEmptyComponent={
            query.length > 1 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="search-outline"
                  size={48}
                  color={theme.colors.border}
                />
                <Text style={styles.emptyText}>
                  No results found for "{query}"
                </Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons
                  name="water-outline"
                  size={48}
                  color={theme.colors.primaryLight}
                />
                <Text style={styles.emptyText}>
                  Search for your favorite brands and local suppliers.
                </Text>
              </View>
            )
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    padding: theme.spacing.xs,
    marginRight: theme.spacing.sm,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    height: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
  },
  list: {
    padding: theme.spacing.md,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryLight + "30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.md,
    overflow: "hidden",
  },
  emoji: {
    fontSize: 24,
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  resultType: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textTransform: "capitalize",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xl,
    marginTop: 40,
  },
  emptyText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
});

import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../../../constants/theme';
import { Card } from '../../../components/ui';

export default function LedgerScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ledger Reports</Text>
      </View>
      <View style={styles.container}>
        <Card style={styles.card}>
          <Ionicons name="document-text" size={48} color={theme.colors.border} style={styles.icon} />
          <Text style={styles.title}>Coming Soon</Text>
          <Text style={styles.description}>
            Detailed financial reporting and monthly ledger statements will be available in V2 of AquaKart.
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  container: {
    flex: 1,
    padding: theme.spacing.lg,
    justifyContent: 'center',
  },
  card: {
    padding: 32,
    alignItems: 'center',
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  }
});

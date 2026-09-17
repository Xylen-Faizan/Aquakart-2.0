import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card } from '../../components/ui';

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App Settings</Text>
      </View>
      <View style={styles.container}>
        <Card style={styles.card}>
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingTitle}>Push Notifications</Text>
              <Text style={styles.settingDesc}>Get alerts for new orders</Text>
            </View>
            <Switch value={true} onValueChange={() => {}} trackColor={{ false: theme.colors.border, true: theme.colors.primary }} />
          </View>
          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <View>
              <Text style={styles.settingTitle}>SMS Alerts</Text>
              <Text style={styles.settingDesc}>Receive critical alerts via SMS</Text>
            </View>
            <Switch value={false} onValueChange={() => {}} trackColor={{ false: theme.colors.border, true: theme.colors.primary }} />
          </View>
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
  },
  card: {
    padding: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.background,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  }
});

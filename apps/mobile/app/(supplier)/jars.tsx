import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { Card, Badge, Button } from '../../components/ui';

export default function JarsScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Jars Inventory</Text>
        <Text style={styles.headerSubtitle}>Manage your 20L can circulation</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* Overview Stats */}
        <Card style={styles.overviewCard}>
          <Text style={styles.sectionTitle}>Current Status</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>180</Text>
              <Text style={styles.statLabel}>Available (Warehouse)</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.colors.warning }]}>270</Text>
              <Text style={styles.statLabel}>Out with Customers</Text>
            </View>
          </View>
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: '40%', backgroundColor: theme.colors.primary }]} />
            <View style={[styles.progressBar, { width: '60%', backgroundColor: theme.colors.warning }]} />
          </View>
          <Text style={styles.totalText}>Total Inventory: 450 Jars</Text>
        </Card>

        {/* Record Return */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Record Empty Returns</Text>
          <Card style={styles.actionCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Customer</Text>
              <View style={styles.pickerContainer}>
                <Text style={styles.pickerText}>Select Customer...</Text>
                <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Number of Empty Jars Returned</Text>
              <View style={styles.counterRow}>
                <TouchableOpacity style={styles.counterBtn}>
                  <Ionicons name="remove" size={24} color={theme.colors.primary} />
                </TouchableOpacity>
                <Text style={styles.counterValue}>0</Text>
                <TouchableOpacity style={styles.counterBtn}>
                  <Ionicons name="add" size={24} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <Button title="Confirm Return" variant="primary" style={{ marginTop: 8 }} />
          </Card>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Jar Activity</Text>
          
          <Card style={styles.activityCard}>
            <View style={styles.activityRow}>
              <View style={styles.activityIconWrapper}>
                <Ionicons name="arrow-down-circle" size={24} color={theme.colors.success} />
              </View>
              <View style={styles.activityDetails}>
                <Text style={styles.activityTitle}>Returned 2 Jars</Text>
                <Text style={styles.activitySubtitle}>Raj Kumar • Today, 10:30 AM</Text>
              </View>
            </View>
          </Card>

          <Card style={styles.activityCard}>
            <View style={styles.activityRow}>
              <View style={[styles.activityIconWrapper, { backgroundColor: theme.colors.warning + '10' }]}>
                <Ionicons name="arrow-up-circle" size={24} color={theme.colors.warning} />
              </View>
              <View style={styles.activityDetails}>
                <Text style={styles.activityTitle}>Dispatched 4 Jars</Text>
                <Text style={styles.activitySubtitle}>Sharma • Today, 09:15 AM</Text>
              </View>
            </View>
          </Card>
          
          <Card style={styles.activityCard}>
            <View style={styles.activityRow}>
              <View style={styles.activityIconWrapper}>
                <Ionicons name="arrow-down-circle" size={24} color={theme.colors.success} />
              </View>
              <View style={styles.activityDetails}>
                <Text style={styles.activityTitle}>Returned 12 Jars</Text>
                <Text style={styles.activitySubtitle}>ABC Office • Yesterday, 4:00 PM</Text>
              </View>
            </View>
          </Card>

        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  overviewCard: {
    padding: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.border,
    marginHorizontal: 16,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  progressContainer: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
  },
  totalText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  actionCard: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: theme.colors.background,
  },
  pickerText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  counterBtn: {
    padding: 8,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 24,
  },
  counterValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.text,
    minWidth: 40,
    textAlign: 'center',
  },
  activityCard: {
    padding: 16,
    marginBottom: 12,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activityIconWrapper: {
    padding: 8,
    backgroundColor: theme.colors.success + '10',
    borderRadius: 24,
  },
  activityDetails: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 2,
  },
  activitySubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  }
});

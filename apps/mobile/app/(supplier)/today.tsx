import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { theme } from '../../constants/theme';
import { Card, Badge, Button } from '../../components/ui';
import { SupplierService } from '../../services/supplier';
import { useAuth } from '../../features/auth/AuthProvider';

export default function TodayScreen() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>({
    deliveries_due: 0,
    deliveries_done: 0,
    jars_with_customers: 0,
    revenue_today: 0,
    collected_today: 0,
    outstanding_today: 0
  });

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      const data = await SupplierService.getTodayOverview();
      if (data) {
        setOverview(data);
      }
    } catch (err) {
      console.error("Error fetching overview", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchOverview();
    }, [fetchOverview])
  );

  const pending = Math.max(0, overview.deliveries_due - overview.deliveries_done);
  const completionPercent = overview.deliveries_due > 0 
    ? Math.round((overview.deliveries_done / overview.deliveries_due) * 100) 
    : 100;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerBrand}>AQUAKART PARTNER</Text>
          <Text style={styles.headerSub}>{profile?.name || 'Water Supplier'}</Text>
        </View>
        <View style={styles.headerActions}>
          <Badge variant="success" text="Online" />
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="notifications-outline" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* TODAY SUMMARY */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TODAY OVERVIEW</Text>
          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{overview.deliveries_due}</Text>
              <Text style={styles.summaryLabel}>Due</Text>
            </Card>
            <Card style={[styles.summaryCard, { backgroundColor: theme.colors.success + '10' }]}>
              <Text style={[styles.summaryValue, { color: theme.colors.success }]}>{overview.deliveries_done}</Text>
              <Text style={styles.summaryLabel}>Done</Text>
            </Card>
            <Card style={[styles.summaryCard, { backgroundColor: theme.colors.warning + '10' }]}>
              <Text style={[styles.summaryValue, { color: theme.colors.warning }]}>{pending}</Text>
              <Text style={styles.summaryLabel}>Pending</Text>
            </Card>
          </View>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${completionPercent}%` }]} />
          </View>
          <Text style={styles.progressText}>{completionPercent}% Completed</Text>
        </View>

        {/* DELIVERIES */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today's Deliveries</Text>
            <TouchableOpacity>
              <Text style={styles.linkText}>View All</Text>
            </TouchableOpacity>
          </View>
          
          <Card style={styles.deliveryCard}>
            <View style={styles.deliveryRow}>
              <View style={styles.deliveryInfo}>
                <Text style={styles.customerName}>Raj Kumar</Text>
                <Text style={styles.deliveryDetails}>1× 20L Standard RO Jar</Text>
                <Text style={styles.deliveryAddress}>Flat 302, Green Glen</Text>
                <Badge variant="warning" text="Cash on Delivery" style={styles.paymentBadge} />
              </View>
              <View style={styles.deliveryActions}>
                <Text style={styles.amount}>₹25</Text>
                <TouchableOpacity style={styles.actionIcon}>
                  <Ionicons name="call-outline" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
            <Button title="Mark Delivered" size="small" style={styles.deliverButton} />
          </Card>

          <Card style={styles.deliveryCard}>
            <View style={styles.deliveryRow}>
              <View style={styles.deliveryInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.customerName}>ABC Office</Text>
                  <Badge variant="error" text="Priority" />
                </View>
                <Text style={styles.deliveryDetails}>4× 20L Mineral Cans</Text>
                <Text style={styles.deliveryAddress}>2nd Floor Tech Park</Text>
                <Badge variant="default" text="Corporate Account" style={styles.paymentBadge} />
              </View>
              <View style={styles.deliveryActions}>
                <Text style={styles.amount}>₹100</Text>
                <TouchableOpacity style={styles.actionIcon}>
                  <Ionicons name="call-outline" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
            <Button title="Mark Delivered" size="small" style={styles.deliverButton} />
          </Card>

          <Card style={styles.deliveryCard}>
            <View style={styles.deliveryRow}>
              <View style={styles.deliveryInfo}>
                <Text style={styles.customerName}>Sharma</Text>
                <Text style={styles.deliveryDetails}>2× 20L Purified Jars</Text>
                <Text style={styles.deliveryAddress}>House 14, 5th Main</Text>
                <Badge variant="success" text="UPI on Delivery" style={styles.paymentBadge} />
              </View>
              <View style={styles.deliveryActions}>
                <Text style={styles.amount}>₹50</Text>
                <TouchableOpacity style={styles.actionIcon}>
                  <Ionicons name="call-outline" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
            <Button title="Mark Delivered" size="small" style={styles.deliverButton} />
          </Card>
        </View>

        {/* JARS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Jars Inventory</Text>
          <Card style={styles.jarsCard}>
            <View style={styles.jarsRow}>
              <View style={styles.jarStat}>
                <Ionicons name="water" size={32} color={theme.colors.primary} />
                <Text style={styles.jarValue}>180</Text>
                <Text style={styles.jarLabel}>Available</Text>
              </View>
              <View style={styles.jarDivider} />
              <View style={styles.jarStat}>
                <Ionicons name="people" size={32} color={theme.colors.warning} />
                <Text style={styles.jarValue}>{overview.jars_with_customers}</Text>
                <Text style={styles.jarLabel}>With Customers</Text>
              </View>
            </View>
            <View style={styles.jarProgressContainer}>
              <View style={[styles.jarProgressBar, { width: '40%', backgroundColor: theme.colors.primary }]} />
              <View style={[styles.jarProgressBar, { width: '60%', backgroundColor: theme.colors.warning }]} />
            </View>
            <Button title="Record Jar Return" variant="outline" style={{ marginTop: 16 }} />
          </Card>
        </View>

        {/* REVENUE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Revenue</Text>
          <Card style={styles.revenueCard}>
            <View style={styles.revenueRow}>
              <View>
                <Text style={styles.revenueLabel}>Today's Collection</Text>
                <Text style={styles.revenueValue}>₹{overview.collected_today}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.revenueLabel}>Outstanding</Text>
                <Text style={[styles.revenueValue, { color: theme.colors.error, fontSize: 20 }]}>₹{overview.outstanding_today}</Text>
              </View>
            </View>
            <Button title="Settle Accounts" variant="primary" style={{ marginTop: 16 }} />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerBrand: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  headerSub: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    padding: 4,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  linkText: {
    color: theme.colors.primary,
    fontWeight: '600',
    marginBottom: theme.spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  summaryLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.success,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'right',
  },
  deliveryCard: {
    marginBottom: 12,
    padding: 16,
  },
  deliveryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  deliveryInfo: {
    flex: 1,
    paddingRight: 16,
  },
  customerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  deliveryDetails: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  deliveryAddress: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: 8,
  },
  paymentBadge: {
    alignSelf: 'flex-start',
  },
  deliveryActions: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  actionIcon: {
    padding: 8,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 20,
  },
  deliverButton: {
    width: '100%',
  },
  jarsCard: {
    padding: 20,
  },
  jarsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  jarStat: {
    flex: 1,
    alignItems: 'center',
  },
  jarDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.border,
  },
  jarValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 8,
  },
  jarLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  jarProgressContainer: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  jarProgressBar: {
    height: '100%',
  },
  revenueCard: {
    padding: 20,
  },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  revenueLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  revenueValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
  }
});

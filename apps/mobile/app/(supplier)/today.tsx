import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { Card, Badge, Button } from '../../components/ui';
import { DashboardService, TodayStats, TodayManifestItem } from '../../services/dashboard';
import { useFocusEffect } from 'expo-router';

export default function SupplierTodayScreen() {
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [manifest, setManifest] = useState<TodayManifestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const [statsData, manifestData] = await Promise.all([
        DashboardService.getTodayStats(),
        DashboardService.getTodayManifest()
      ]);
      setStats(statsData);
      setManifest(manifestData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchDashboardData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  if (loading && !stats) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  // Format the date header
  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>Supplier Operations</Text>
        <Text style={styles.headerTitle}>{dateString}</Text>
      </View>

      <ScrollView 
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        
        {/* TODAY'S METRICS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TODAY</Text>
          <View style={styles.statsGrid}>
            <Card style={[styles.statCard, { backgroundColor: theme.colors.primary + '10' }]}>
              <Text style={styles.statValue}>{stats?.deliveries_due || 0}</Text>
              <Text style={styles.statLabel}>Deliveries Due</Text>
            </Card>
            <Card style={[styles.statCard, { backgroundColor: theme.colors.warning + '10' }]}>
              <Text style={styles.statValue}>{stats?.jars_required || 0}</Text>
              <Text style={styles.statLabel}>Jars Required</Text>
            </Card>
            <Card style={[styles.statCard, { backgroundColor: theme.colors.success + '10' }]}>
              <Text style={styles.statValue}>₹{stats?.expected_revenue || 0}</Text>
              <Text style={styles.statLabel}>Expected Revenue</Text>
            </Card>
            <Card style={[styles.statCard, { backgroundColor: theme.colors.error + '10' }]}>
              <Text style={styles.statValue}>₹{stats?.outstanding_total || 0}</Text>
              <Text style={styles.statLabel}>Total Outstanding</Text>
            </Card>
          </View>

          <View style={styles.progressRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.progressLabel}>Deliveries Completed</Text>
              <Text style={styles.progressValue}>{stats?.deliveries_done || 0} / {(stats?.deliveries_due || 0) + (stats?.deliveries_done || 0)}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.progressLabel}>Cash Collected</Text>
              <Text style={styles.progressValue}>₹{stats?.collected_today || 0}</Text>
            </View>
          </View>
        </View>

        {/* TODAY'S MANIFEST */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TODAY'S WORK</Text>
          
          {manifest.length === 0 ? (
            <Card style={{ padding: 24, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle-outline" size={48} color={theme.colors.success} style={{ marginBottom: 12 }} />
              <Text style={{ fontSize: 16, color: theme.colors.textPrimary, fontWeight: '600' }}>All Caught Up!</Text>
              <Text style={{ textAlign: 'center', color: theme.colors.textSecondary, marginTop: 4 }}>
                No pending deliveries remaining for today.
              </Text>
            </Card>
          ) : (
            manifest.map((item, index) => (
              <Card key={`${item.customer_id}-${index}`} style={styles.manifestCard}>
                <View style={styles.manifestHeader}>
                  <View>
                    <Text style={styles.customerName}>{item.customer_name}</Text>
                    <Text style={styles.customerLocation}>
                      {item.sector ? `${item.sector}` : 'No Area'} {item.address ? `• ${item.address}` : ''}
                    </Text>
                  </View>
                  <Badge label="Pending" variant="warning" />
                </View>
                
                <View style={styles.manifestDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="water-outline" size={16} color={theme.colors.primary} />
                    <Text style={styles.detailText}>{item.quantity} × 20L</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="pricetag-outline" size={16} color={theme.colors.success} />
                    <Text style={styles.detailText}>@ ₹{item.effective_unit_price} (Total: ₹{item.expected_amount})</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="call-outline" size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.detailText}>{item.phone}</Text>
                  </View>
                </View>
              </Card>
            ))
          )}
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
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    backgroundColor: theme.colors.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 4,
  },
  container: {
    flex: 1,
  },
  section: {
    padding: theme.spacing.lg,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    marginBottom: 16,
    letterSpacing: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    padding: 16,
    marginBottom: 0,
    borderWidth: 0,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  progressLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  progressValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  manifestCard: {
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.warning,
  },
  manifestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  customerLocation: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  manifestDetails: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  }
});

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../constants/theme';
import { Card, Button } from '../../../components/ui';
import { supabase } from '../../../lib/supabase/client';
import { useRouter } from 'expo-router';

interface SubscriptionData {
  supplier_customer_id: string;
  supplier_id: string;
  business_name: string;
  business_phone: string;
  jar_balance: number;
  outstanding_balance: number;
}

interface MonthlyLedger {
  jars_consumed: number;
  bill_generated: number;
  amount_paid: number;
  entries: {
    id: string;
    type: 'delivery' | 'payment';
    entry_type: 'debit' | 'credit';
    amount: number;
    created_at: string;
    jars?: { delivered: number; returned: number };
    payment_method?: string;
  }[];
}

interface SubscribedHomeProps {
  subscription: SubscriptionData;
}

export default function SubscribedHome({ subscription }: SubscribedHomeProps) {
  const router = useRouter();
  const [ledger, setLedger] = useState<MonthlyLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Current month logic
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(now.getFullYear());

  const fetchLedger = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_customer_monthly_ledger', {
        p_month: currentMonth,
        p_year: currentYear
      });
      if (error) throw error;
      setLedger(data as unknown as MonthlyLedger);
    } catch (err) {
      console.error('Failed to fetch ledger:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [currentMonth, currentYear]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLedger();
  };

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const displayMonth = `${monthNames[currentMonth - 1]} ${currentYear}`;

  const handlePreviousMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    const isCurrentMonth = currentMonth === now.getMonth() + 1 && currentYear === now.getFullYear();
    if (isCurrentMonth) return;
    
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const isCurrentMonth = currentMonth === now.getMonth() + 1 && currentYear === now.getFullYear();

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Your Khata</Text>
          <Text style={styles.supplierName}>{subscription.business_name}</Text>
        </View>
        <TouchableOpacity style={styles.callButton} onPress={() => Alert.alert('Call', `Calling ${subscription.business_phone}...`)}>
          <Ionicons name="call" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        
        {/* Month Selector */}
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={handlePreviousMonth} style={styles.monthBtn}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          <Text style={styles.monthText}>{displayMonth} Bill</Text>
          <TouchableOpacity onPress={handleNextMonth} style={[styles.monthBtn, isCurrentMonth && { opacity: 0.3 }]} disabled={isCurrentMonth}>
            <Ionicons name="chevron-forward" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Analytics Card */}
        <Card style={styles.analyticsCard}>
          <View style={styles.analyticsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{ledger?.jars_consumed || 0}</Text>
              <Text style={styles.statLabel}>Jars This Month</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: theme.colors.error }]}>₹{ledger?.bill_generated || 0}</Text>
              <Text style={styles.statLabel}>Bill Generated</Text>
            </View>
          </View>
          
          <View style={styles.bottomStatsRow}>
            <View>
              <Text style={styles.bottomStatLabel}>Paid This Month</Text>
              <Text style={[styles.bottomStatValue, { color: theme.colors.success }]}>₹{ledger?.amount_paid || 0}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.bottomStatLabel}>Empty Jars With You</Text>
              <Text style={styles.bottomStatValue}>{subscription.jar_balance} Jars</Text>
            </View>
          </View>
        </Card>

        {/* Order Extra Button */}
        {isCurrentMonth && (
          <Button 
            title="Order Extra Jars Now" 
            variant="primary" 
            leftElement={<Ionicons name="add-circle-outline" size={20} color="white" style={{ marginRight: 8 }} />}
            onPress={() => router.push(`/(customer)/catalog?supplier_id=${subscription.supplier_id}` as any)}
            style={{ marginBottom: 24 }}
          />
        )}

        {/* Transactions List */}
        <Text style={styles.sectionTitle}>Daily Record</Text>
        
        {loading && !refreshing ? (
          <Text style={{ textAlign: 'center', marginTop: 20, color: theme.colors.textSecondary }}>Loading ledger...</Text>
        ) : ledger?.entries && ledger.entries.length > 0 ? (
          <View style={styles.ledgerList}>
            {ledger.entries.map((entry) => (
              <View key={entry.id} style={styles.entryRow}>
                <View style={styles.entryIcon}>
                  {entry.type === 'delivery' ? (
                    <Ionicons name="water" size={20} color={theme.colors.primary} />
                  ) : (
                    <Ionicons name="cash" size={20} color={theme.colors.success} />
                  )}
                </View>
                <View style={styles.entryDetails}>
                  <Text style={styles.entryTitle}>
                    {entry.type === 'delivery' ? 'Delivery Received' : 'Payment Made'}
                  </Text>
                  <Text style={styles.entrySub}>
                    {new Date(entry.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {entry.type === 'delivery' && entry.jars && (
                    <Text style={styles.jarSub}>
                      +{entry.jars.delivered} Delivered | -{entry.jars.returned} Returned
                    </Text>
                  )}
                  {entry.type === 'payment' && (
                    <Text style={styles.jarSub}>via {entry.payment_method?.toUpperCase() || 'CASH'}</Text>
                  )}
                </View>
                <View style={styles.entryAmountBox}>
                  <Text style={[
                    styles.entryAmount, 
                    { color: entry.type === 'payment' ? theme.colors.success : theme.colors.error }
                  ]}>
                    {entry.type === 'payment' ? '-' : '+'}₹{entry.amount}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={theme.colors.border} />
            <Text style={styles.emptyText}>No records found for this month.</Text>
          </View>
        )}

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.xl,
    paddingTop: 60, // for notch
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  greeting: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  supplierName: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 4,
  },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: theme.spacing.lg,
    marginTop: -20, // Pull up over the rounded header
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  monthBtn: {
    padding: 8,
  },
  monthText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  analyticsCard: {
    padding: 0,
    marginBottom: 24,
    overflow: 'hidden',
  },
  analyticsGrid: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  statBox: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  bottomStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f8fafc',
  },
  bottomStatLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  bottomStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 16,
  },
  ledgerList: {
    gap: 12,
  },
  entryRow: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  entryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  entryDetails: {
    flex: 1,
  },
  entryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  entrySub: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  jarSub: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 4,
    fontWeight: '500',
  },
  entryAmountBox: {
    alignItems: 'flex-end',
  },
  entryAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  emptyText: {
    marginTop: 12,
    color: theme.colors.textSecondary,
    fontSize: 14,
  }
});

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SupplierCapacityService } from '../../services/supplier-capacity';
import { theme } from '../../constants/theme';
import { Button, Card, Input } from '../../components/ui';
import { LoadingState } from '../../components/feedback';

export default function CapacityScreen() {
  const router = useRouter();
  const [capacity, setCapacity] = useState<any>(null);
  const [maxCapacityStr, setMaxCapacityStr] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const capData = await SupplierCapacityService.getTodayCapacity();
      if (capData) {
        setCapacity(capData);
        setMaxCapacityStr(capData.max_capacity.toString());
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCapacity = async () => {
    const max = parseInt(maxCapacityStr, 10);
    if (isNaN(max) || max < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid positive number.');
      return;
    }

    try {
      setSaving(true);
      await SupplierCapacityService.setCapacity(max);
      Alert.alert('Success', 'Capacity updated successfully.');
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleIncrement = () => {
    const current = parseInt(maxCapacityStr, 10) || 0;
    setMaxCapacityStr((current + 1).toString());
  };

  const handleDecrement = () => {
    const current = parseInt(maxCapacityStr, 10) || 0;
    setMaxCapacityStr(Math.max(0, current - 1).toString());
  };

  if (loading) return <LoadingState message="Loading capacity..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Capacity</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        
        {/* Update Capacity Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Set Daily Limit</Text>
          <Card style={styles.card}>
            <View style={styles.stepperContainer}>
              <Text style={styles.stepperLabel}>Max Cans (20L)</Text>
              <View style={styles.stepperControls}>
                <TouchableOpacity style={styles.stepperBtn} onPress={handleDecrement}>
                  <Ionicons name="remove" size={24} color={theme.colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{maxCapacityStr || '0'}</Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={handleIncrement}>
                  <Ionicons name="add" size={24} color={theme.colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.helpText}>
              Update your daily capacity to control how many orders you can receive today.
            </Text>
            
            <Button 
              title="Update Capacity" 
              onPress={handleSaveCapacity} 
              disabled={saving}
              style={styles.saveButton}
            />
          </Card>
        </View>

        {/* Metrics Section */}
        {capacity && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Metrics</Text>
            <View style={styles.metricsGrid}>
              <Card style={styles.metricCard}>
                <Text style={styles.metricValue}>{capacity.reserved_quantity}</Text>
                <Text style={styles.metricLabel}>Reserved</Text>
              </Card>
              <Card style={styles.metricCard}>
                <Text style={styles.metricValue}>{capacity.fulfilled_quantity}</Text>
                <Text style={styles.metricLabel}>Delivered</Text>
              </Card>
              <Card style={[styles.metricCard, { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primaryLight }]}>
                <Text style={[styles.metricValue, { color: theme.colors.primary }]}>{capacity.available_quantity}</Text>
                <Text style={[styles.metricLabel, { color: theme.colors.primary }]}>Available</Text>
              </Card>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: theme.colors.background 
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    paddingTop: Platform.OS === 'ios' ? theme.spacing.xl : theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  container: { 
    flex: 1 
  },
  section: { 
    padding: theme.spacing.lg, 
    paddingBottom: 0 
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  card: { 
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  stepperLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 4,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
  },
  stepperValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    width: 40,
    textAlign: 'center',
  },
  helpText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  saveButton: {
    width: '100%',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  metricCard: {
    flex: 1,
    padding: theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: theme.fontWeight.medium as any,
  },
});

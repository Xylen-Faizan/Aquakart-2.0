import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { Card, Badge, Button } from '../../components/ui';

export default function CustomersScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const filters = ['All', 'Residential', 'Commercial', 'Credit Due'];

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.headerTitle}>Customers</Text>
            <Text style={styles.headerSubtitle}>Koramangala Hub 04 • 148 Total Accounts</Text>
          </View>
          <Badge variant="success" text="Active (142)" />
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={theme.colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search customer name, flat, or phone..."
              placeholderTextColor={theme.colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          <Button title="+ Add Customer" size="small" style={styles.addButton} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <View style={styles.filterContainer}>
            {filters.map(f => (
              <TouchableOpacity 
                key={f} 
                style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
                onPress={() => setActiveFilter(f)}
              >
                <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* Quick Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>148</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>270</Text>
            <Text style={styles.summaryLabel}>Jars Out</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>3,400</Text>
            <Text style={styles.summaryLabel}>Monthly Vol</Text>
          </View>
        </View>

        {/* Customer List */}
        <View style={styles.customerList}>
          
          {/* Raj Kumar */}
          <Card style={styles.customerCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.customerName}>Raj Kumar</Text>
                <Text style={styles.customerAddress}>Flat 302, Green Glen Layout, Bellandur</Text>
              </View>
              <TouchableOpacity style={styles.callButton}>
                <Ionicons name="call" size={18} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.tagsRow}>
              <Badge variant="default" text="Residential" />
              <Badge variant="success" text="₹25 / 20L jar" />
            </View>
            
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>2</Text>
                <Text style={styles.statLabel}>Jars Out</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: theme.colors.success }]}>₹0</Text>
                <Text style={styles.statLabel}>Balance</Text>
              </View>
            </View>

            <View style={styles.cardActions}>
              <Button title="Edit Price" variant="outline" size="small" style={styles.actionBtn} />
              <Button title="View Ledger" variant="primary" size="small" style={styles.actionBtn} />
            </View>
          </Card>

          {/* ABC Office */}
          <Card style={styles.customerCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.customerName}>ABC Office</Text>
                <Text style={styles.customerAddress}>2nd Floor, Tech Park, Tower B</Text>
              </View>
              <TouchableOpacity style={styles.callButton}>
                <Ionicons name="call" size={18} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.tagsRow}>
              <Badge variant="warning" text="Corporate" />
              <Badge variant="primary" text="₹100 / 20L jar" />
            </View>
            
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>12</Text>
                <Text style={styles.statLabel}>Jars Out</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: theme.colors.error }]}>₹4,200</Text>
                <Text style={styles.statLabel}>Credit Due</Text>
              </View>
            </View>

            <View style={styles.cardActions}>
              <Button title="Edit Price" variant="outline" size="small" style={styles.actionBtn} />
              <Button title="View Ledger" variant="primary" size="small" style={styles.actionBtn} />
            </View>
          </Card>

          {/* Sharma */}
          <Card style={styles.customerCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.customerName}>Sharma</Text>
                <Text style={styles.customerAddress}>House 14, 5th Main, Koramangala 4th Block</Text>
              </View>
              <TouchableOpacity style={styles.callButton}>
                <Ionicons name="call" size={18} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.tagsRow}>
              <Badge variant="default" text="Residential" />
              <Badge variant="success" text="₹50 / 20L jar" />
            </View>
            
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>4</Text>
                <Text style={styles.statLabel}>Jars Out</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: theme.colors.warning }]}>₹150</Text>
                <Text style={styles.statLabel}>Pending Due</Text>
              </View>
            </View>

            <View style={styles.cardActions}>
              <Button title="Edit Price" variant="outline" size="small" style={styles.actionBtn} />
              <Button title="View Ledger" variant="primary" size="small" style={styles.actionBtn} />
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
    paddingTop: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    gap: 12,
    marginBottom: 16,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: theme.colors.text,
  },
  addButton: {
    height: 40,
    paddingHorizontal: 16,
  },
  filterScroll: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary + '10',
    borderColor: theme.colors.primary,
  },
  filterText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  summaryLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  customerList: {
    gap: 16,
  },
  customerCard: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 2,
  },
  customerAddress: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    width: 250,
  },
  callButton: {
    padding: 8,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 20,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 16,
  },
  statBox: {
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
  }
});

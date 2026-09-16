import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { Card, Badge, Button } from '../../components/ui';

export default function DeliveriesScreen() {
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.headerTitle}>Deliveries</Text>
            <Text style={styles.headerSubtitle}>Today, 16 Sep • Route 1</Text>
          </View>
          <Button 
            title="Optimize Route" 
            variant="outline" 
            size="small" 
            icon={<Ionicons name="git-merge-outline" size={16} color={theme.colors.primary} />}
          />
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
            onPress={() => setActiveTab('pending')}
          >
            <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>Pending (4)</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
            onPress={() => setActiveTab('completed')}
          >
            <Text style={[styles.tabText, activeTab === 'completed' && styles.activeTabText]}>Completed (8)</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* Map Placeholder */}
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map-outline" size={32} color={theme.colors.primary} style={{ opacity: 0.5 }} />
          <Text style={styles.mapText}>Live Route Tracking (Preview)</Text>
        </View>

        <View style={styles.stopsList}>
          
          {/* Stop 1 */}
          <View style={styles.stopContainer}>
            <View style={styles.stopTimeline}>
              <View style={styles.stopDot} />
              <View style={styles.stopLine} />
            </View>
            <Card style={styles.stopCard}>
              <View style={styles.stopHeader}>
                <Badge variant="warning" text="Stop 1 • 0.5 km away" />
                <TouchableOpacity style={styles.iconBtn}>
                  <Ionicons name="navigate" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.customerName}>CloudNine Tech Hub</Text>
              <Text style={styles.customerAddress}>Ground Floor, Cyber Arcade, HSR Sector 2</Text>

              <View style={styles.deliveryDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="water" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.detailText}>8x 20L Standard Jars</Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="cash" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.detailText}>₹720 • UPI Preferred</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <Button title="Call" variant="outline" size="small" style={{ flex: 1 }} icon={<Ionicons name="call-outline" size={16} color={theme.colors.primary} />} />
                <Button title="Mark Delivered" variant="primary" size="small" style={{ flex: 2 }} />
              </View>
            </Card>
          </View>

          {/* Stop 2 */}
          <View style={styles.stopContainer}>
            <View style={styles.stopTimeline}>
              <View style={styles.stopDot} />
              <View style={styles.stopLine} />
            </View>
            <Card style={styles.stopCard}>
              <View style={styles.stopHeader}>
                <Badge variant="default" text="Stop 2 • 1.2 km away" />
                <TouchableOpacity style={styles.iconBtn}>
                  <Ionicons name="navigate" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.customerName}>Priya Verma</Text>
              <Text style={styles.customerAddress}>Villa 22, Palm Meadows</Text>

              <View style={styles.deliveryDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="water" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.detailText}>1x 20L Purified Jar</Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="cash" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.detailText}>₹45 • Cash on Delivery</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <Button title="Call" variant="outline" size="small" style={{ flex: 1 }} icon={<Ionicons name="call-outline" size={16} color={theme.colors.primary} />} />
                <Button title="Mark Delivered" variant="primary" size="small" style={{ flex: 2 }} />
              </View>
            </Card>
          </View>

          {/* Stop 3 - Completed */}
          <View style={styles.stopContainer}>
            <View style={styles.stopTimeline}>
              <View style={[styles.stopDot, { backgroundColor: theme.colors.success }]} />
              <View style={[styles.stopLine, { backgroundColor: theme.colors.success + '40' }]} />
            </View>
            <Card style={[styles.stopCard, { opacity: 0.8 }]}>
              <View style={styles.stopHeader}>
                <Badge variant="success" text="Delivered at 09:15 AM" />
              </View>

              <Text style={[styles.customerName, { textDecorationLine: 'line-through', color: theme.colors.textSecondary }]}>Raj Kumar</Text>
              <Text style={styles.customerAddress}>Flat 302, Green Glen Layout</Text>

              <View style={styles.deliveryDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                  <Text style={[styles.detailText, { color: theme.colors.success }]}>Delivered 2x 20L Jars</Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                  <Text style={[styles.detailText, { color: theme.colors.success }]}>Collected ₹50</Text>
                </View>
              </View>
            </Card>
          </View>

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
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  mapPlaceholder: {
    height: 120,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  mapText: {
    color: theme.colors.primary,
    fontWeight: '600',
    marginTop: 8,
  },
  stopsList: {
    gap: 0,
  },
  stopContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  stopTimeline: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
  },
  stopDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
    marginTop: 24,
    zIndex: 1,
  },
  stopLine: {
    width: 2,
    flex: 1,
    backgroundColor: theme.colors.primary + '40',
    position: 'absolute',
    top: 36,
    bottom: -40,
  },
  stopCard: {
    flex: 1,
    padding: 16,
  },
  stopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconBtn: {
    padding: 6,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 16,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  customerAddress: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  deliveryDetails: {
    backgroundColor: theme.colors.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  }
});

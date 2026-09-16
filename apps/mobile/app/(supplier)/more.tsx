import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { Card, Button } from '../../components/ui';
import { useAuth } from '../../features/auth/AuthProvider';

export default function MoreScreen() {
  const { profile, signOut } = useAuth();

  const menuItems = [
    { icon: 'business-outline', title: 'Business Profile', subtitle: 'Manage details & coverage' },
    { icon: 'pricetag-outline', title: 'Pricing & Catalog', subtitle: 'Update default product rates' },
    { icon: 'document-text-outline', title: 'Ledger Reports', subtitle: 'Download monthly statements' },
    { icon: 'settings-outline', title: 'App Settings', subtitle: 'Notifications & preferences' },
    { icon: 'help-circle-outline', title: 'Help & Support', subtitle: 'Contact AquaKart ops team' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* Profile Summary */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{profile?.name?.charAt(0) || 'S'}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.businessName}>{profile?.name || 'Water Supplier'}</Text>
              <Text style={styles.phoneText}>{profile?.phone}</Text>
              <Text style={styles.badgeText}>Verified Partner</Text>
            </View>
          </View>
        </Card>

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => (
            <TouchableOpacity key={index} style={styles.menuItem}>
              <View style={styles.menuIconWrapper}>
                <Ionicons name={item.icon as any} size={24} color={theme.colors.primary} />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.border} />
            </TouchableOpacity>
          ))}
        </View>

        <Button 
          title="Sign Out" 
          variant="outline" 
          style={styles.signOutBtn}
          onPress={signOut}
        />

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
    color: theme.colors.textPrimary,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
  },
  profileCard: {
    padding: 20,
    marginBottom: 24,
    backgroundColor: theme.colors.primary,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  phoneText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  menuContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.background,
  },
  menuIconWrapper: {
    padding: 10,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 12,
    marginRight: 16,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  menuSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  signOutBtn: {
    borderColor: theme.colors.error,
  }
});

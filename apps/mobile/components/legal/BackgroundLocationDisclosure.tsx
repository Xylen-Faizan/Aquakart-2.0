import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';

interface Props {
  visible: boolean;
  onContinue: () => void;
  onDismiss: () => void;
}

export const BackgroundLocationDisclosure: React.FC<Props> = ({ visible, onContinue, onDismiss }) => {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet">
      <View style={styles.container}>
        <View style={styles.iconContainer}>
          <Ionicons name="location" size={48} color={theme.colors.primary} />
        </View>
        
        <Text style={styles.title}>Why AquaKart needs background location</Text>
        
        <Text style={styles.body}>
          AquaKart collects location data to enable active delivery-run tracking, vehicle position updates, route coordination, and estimated arrival information even when the app is closed or not in use.
        </Text>
        
        <Text style={styles.body}>
          Location data is sent to AquaKart's delivery system and may be shared with authorized operational users who need it to coordinate the active delivery run.
        </Text>
        
        <View style={styles.featuresList}>
          <View style={styles.featureItem}>
            <Ionicons name="navigate-outline" size={24} color={theme.colors.textSecondary} />
            <Text style={styles.featureText}>Real-time route tracking</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="time-outline" size={24} color={theme.colors.textSecondary} />
            <Text style={styles.featureText}>Customer arrival estimates</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="car-outline" size={24} color={theme.colors.textSecondary} />
            <Text style={styles.featureText}>Vehicle position updates</Text>
          </View>
        </View>
        
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            Note: Location tracking is only active during delivery runs and stops automatically when the run is completed.
          </Text>
        </View>
        
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryBtn} onPress={onContinue}>
            <Text style={styles.primaryBtnText}>Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onDismiss}>
            <Text style={styles.secondaryBtnText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.background,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  body: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: 24,
  },
  featuresList: {
    marginVertical: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  featureText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
  },
  noteBox: {
    backgroundColor: theme.colors.primaryLight,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    marginBottom: 'auto',
  },
  noteText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primaryDark,
    fontStyle: 'italic',
  },
  footer: {
    marginTop: 'auto',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  secondaryBtn: {
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
});

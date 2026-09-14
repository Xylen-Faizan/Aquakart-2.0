import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

interface BadgeProps {
  variant?: 'success' | 'error' | 'warning' | 'info' | 'neutral';
  label: string;
  style?: any;
}

export const Badge = ({ variant = 'neutral', label, style }: BadgeProps) => {
  return (
    <View style={[styles.badge, styles[`${variant}Bg`], style]}>
      <Text style={[styles.text, styles[`${variant}Text`]]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold as any,
  },
  successBg: {
    backgroundColor: '#E8F5E9',
  },
  successText: {
    color: theme.colors.success,
  },
  errorBg: {
    backgroundColor: '#FFEBEE',
  },
  errorText: {
    color: theme.colors.error,
  },
  warningBg: {
    backgroundColor: '#FFFDE7',
  },
  warningText: {
    color: theme.colors.warning,
  },
  infoBg: {
    backgroundColor: theme.colors.primaryLight,
  },
  infoText: {
    color: theme.colors.primary,
  },
  neutralBg: {
    backgroundColor: theme.colors.background,
  },
  neutralText: {
    color: theme.colors.textSecondary,
  },
});

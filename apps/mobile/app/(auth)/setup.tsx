import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui';
import { theme } from '../../constants/theme';
import { useAuth } from '../../features/auth/AuthProvider';
import { useRouter } from 'expo-router';

export default function SetupScreen() {
  const { user, role, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (role === 'customer') {
      router.replace('/(customer)/home' as any);
    } else if (role === 'supplier') {
      router.replace('/(supplier)/today' as any);
    }
  }, [role]);

  const handleRetry = async () => {
    setRetrying(true);
    await refreshProfile();
    setRetrying(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Account Setup</Text>
          <Text style={styles.subtitle}>
            We're setting up your profile. This usually takes just a moment.
          </Text>
          
          <View style={styles.loaderContainer}>
            {retrying ? (
              <ActivityIndicator size="large" color={theme.colors.primary} />
            ) : (
              <Button 
                title="Refresh Status" 
                onPress={handleRetry} 
                variant="outline" 
              />
            )}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.helpText}>Taking too long?</Text>
          <Button 
            title="Sign Out" 
            onPress={signOut} 
            variant="outline" 
          />
        </View>

        {!role && (
          <View style={styles.inviteContainer}>
            <Text style={styles.helpText}>Joining a supplier's team?</Text>
            <Button 
              title="Enter Invite Code" 
              onPress={() => router.push('/(auth)/join' as any)} 
              variant="outline"
              style={{ marginTop: 8 }}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  container: {
    flex: 1,
    padding: theme.spacing.xl,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: theme.fontWeight.bold as any,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: theme.spacing.xl,
  },
  loaderContainer: {
    height: 60,
    justifyContent: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: theme.spacing.lg,
  },
  helpText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  inviteContainer: {
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing.lg,
  }
});

import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable, Image, ImageBackground, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../../constants/theme';

export default function WelcomeScreen() {
  return (
    <ImageBackground 
      source={require('../../assets/images/water_splash_bg.jpg')} 
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <View style={styles.container}>
          <View style={styles.heroSection}>
            <Image source={require('../../assets/images/logo.png')} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.title}>AQUAKART</Text>
            <Text style={styles.subtitle}>Pure Water.{'\n'}Better Life.</Text>
          </View>

          <View style={styles.actionsContainer}>
            <Text style={styles.questionText}>How would you like{'\n'}to continue?</Text>
            
            <Pressable 
              style={({ pressed }) => [styles.roleCard, pressed && styles.roleCardPressed]}
              onPress={() => router.push('/(auth)/customer-auth')}
            >
              <Text style={styles.cardIcon}>👤</Text>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>Order Water</Text>
                <Text style={styles.cardDescription}>Find water suppliers near you</Text>
              </View>
            </Pressable>

            <Pressable 
              style={({ pressed }) => [styles.roleCard, pressed && styles.roleCardPressed]}
              onPress={() => router.push('/(auth)/supplier-auth')}
            >
              <Text style={styles.cardIcon}>🚰</Text>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>I'm a Water Supplier</Text>
                <Text style={styles.cardDescription}>Manage orders & grow your business</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    padding: theme.spacing.xl,
    justifyContent: 'space-between',
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: theme.spacing.xxl,
  },
  logoImage: {
    width: 100,
    height: 100,
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: 36,
    fontWeight: theme.fontWeight.bold as any,
    color: '#FFFFFF',
    letterSpacing: 3,
    marginBottom: theme.spacing.lg,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: theme.fontSize.xl,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 34,
    fontWeight: theme.fontWeight.medium as any,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionsContainer: {
    width: '100%',
    paddingBottom: theme.spacing.xl,
  },
  questionText: {
    fontSize: theme.fontSize.lg,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    fontWeight: theme.fontWeight.medium as any,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  roleCardPressed: {
    transform: [{ scale: 0.98 }],
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  cardIcon: {
    fontSize: 32,
    marginRight: theme.spacing.md,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold as any,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.7)',
  },
});

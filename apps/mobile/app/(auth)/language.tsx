import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage, Language } from '../../features/i18n/LanguageProvider';
import { theme } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function LanguageSelectionScreen() {
  const router = useRouter();
  const { setLanguage } = useLanguage();

  const handleSelectLanguage = async (lang: Language) => {
    await setLanguage(lang);
    // After setting the language, the router's ProtectedLayout will automatically
    // detect `language !== null` and route the user to `/welcome` or their dashboard.
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        
        <View style={styles.header}>
          <Ionicons name="water" size={64} color={theme.colors.primary} />
          <Text style={styles.title}>Welcome to AquaKart</Text>
          <Text style={styles.subtitle}>What language would you prefer?</Text>
          <Text style={styles.subtitleHindi}>आप कौन सी भाषा पसंद करेंगे?</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.langButton}
            activeOpacity={0.8}
            onPress={() => handleSelectLanguage('en')}
          >
            <View style={styles.langButtonInner}>
              <Text style={styles.langTitle}>English</Text>
              <Ionicons name="chevron-forward" size={24} color={theme.colors.textSecondary} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.langButton}
            activeOpacity={0.8}
            onPress={() => handleSelectLanguage('hi')}
          >
            <View style={styles.langButtonInner}>
              <Text style={styles.langTitleHindi}>हिंदी (Hindi)</Text>
              <Ionicons name="chevron-forward" size={24} color={theme.colors.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginTop: 24,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: theme.colors.textSecondary,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitleHindi: {
    fontSize: 18,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  buttonContainer: {
    gap: 16,
  },
  langButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  langButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  langTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  langTitleHindi: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  }
});

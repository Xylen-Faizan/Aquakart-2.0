import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations, type Language } from './translations';

interface LanguageContextType {
  language: Language | null;
  loading: boolean;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: null,
  loading: true,
  setLanguage: async () => {},
  t: (key) => key,
});

export type { Language };
export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const stored = await AsyncStorage.getItem('app_language');
      if (stored === 'en' || stored === 'hi') {
        setLanguageState(stored as Language);
      }
    } catch (e) {
      console.error('Failed to load language', e);
    } finally {
      setLoading(false);
    }
  };

  const setLanguage = async (lang: Language) => {
    try {
      await AsyncStorage.setItem('app_language', lang);
      setLanguageState(lang);
    } catch (e) {
      console.error('Failed to save language', e);
    }
  };

  const t = (key: string): string => {
    // Default to English if no language selected
    const lang = language || 'en';
    const dict = translations[lang] as Record<string, string>;
    return dict[key] || translations['en'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, loading, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

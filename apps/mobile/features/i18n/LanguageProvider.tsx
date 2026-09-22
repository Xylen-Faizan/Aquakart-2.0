import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'hi';

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

export const useLanguage = () => useContext(LanguageContext);

// Extremely simple dictionary for the proof of concept
const dictionary = {
  en: {
    'welcome.subtitle': 'Pure Water.\nBetter Life.',
    'welcome.question': 'How would you like\nto continue?',
    'welcome.customer': 'Order Water',
    'welcome.customer_desc': 'Find water suppliers near you',
    'welcome.supplier': "I'm a Water Supplier",
    'welcome.supplier_desc': 'Manage orders & grow your business',
    'welcome.staff': 'Staff Login',
    'welcome.staff_desc': 'For drivers, helpers & operations team',
  },
  hi: {
    'welcome.subtitle': 'शुद्ध जल।\nबेहतर जीवन।',
    'welcome.question': 'आप कैसे जारी रखना\nचाहेंगे?',
    'welcome.customer': 'पानी ऑर्डर करें',
    'welcome.customer_desc': 'अपने आस-पास पानी के आपूर्तिकर्ता खोजें',
    'welcome.supplier': 'मैं जल आपूर्तिकर्ता हूँ',
    'welcome.supplier_desc': 'ऑर्डर प्रबंधित करें और अपना व्यवसाय बढ़ाएं',
    'welcome.staff': 'स्टाफ लॉगिन',
    'welcome.staff_desc': 'ड्राइवर, हेल्पर और ऑपरेशंस टीम के लिए',
  }
};

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
    if (!language) return key;
    const dict = dictionary[language] as Record<string, string>;
    return dict[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, loading, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

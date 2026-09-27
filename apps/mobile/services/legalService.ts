import { supabase } from '../lib/supabase/client';

export const CURRENT_VERSIONS = {
  privacyPolicy: '1.0.0',
  termsOfService: '1.0.0'
};

export const LEGAL_URLS = {
  privacy: 'https://aquakart.in/privacy',
  terms: 'https://aquakart.in/terms'
};

export const legalService = {
  async recordConsent(context: string) {
    return supabase.rpc('record_legal_consent', {
      p_context: context,
      p_privacy_version: CURRENT_VERSIONS.privacyPolicy,
      p_terms_version: CURRENT_VERSIONS.termsOfService
    });
  },

  async hasValidConsent(userId: string) {
    const { data, error } = await supabase
      .from('legal_consents')
      .select('*')
      .eq('user_id', userId)
      .eq('privacy_policy_version', CURRENT_VERSIONS.privacyPolicy)
      .eq('terms_of_service_version', CURRENT_VERSIONS.termsOfService)
      .single();
      
    if (error || !data) return false;
    return true;
  }
};

import { LEGAL_VERSION } from "@aquakart/config";
import { supabase } from "../lib/supabase/client";

export const legalService = {
  async recordConsent(source: string = "mobile") {
    const { error } = await supabase.rpc("record_legal_consent", {
      p_terms_version: LEGAL_VERSION,
      p_privacy_version: LEGAL_VERSION,
      p_source: source,
    });
    if (error) throw error;
  },

  async attachConsentMetadata() {
    const { error } = await supabase.auth.updateUser({
      data: {
        legal_terms_version: LEGAL_VERSION,
        legal_privacy_version: LEGAL_VERSION,
      },
    });
    if (error) throw error;
  },

  async persistForCurrentUser(source: string = "mobile") {
    try {
      await this.attachConsentMetadata();
      await this.recordConsent(source);
    } catch (error) {
      console.error("Failed to persist legal consent:", error);
    }
  },
};

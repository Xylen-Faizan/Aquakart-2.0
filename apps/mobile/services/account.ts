import { supabase } from "../lib/supabase/client";

export const accountService = {
  async requestDeletion(source: string = "mobile"): Promise<string> {
    const { data, error } = await supabase.rpc("request_account_deletion", {
      p_source: source,
    });

    if (error) throw error;
    if (!data) throw new Error("Unable to create account deletion request.");

    return data as string;
  },
};

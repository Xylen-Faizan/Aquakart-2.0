import { supabase } from '../lib/supabase/client';
import type { Address, AddressInput } from '@aquakart/types';

export const AddressService = {
  async getAddresses() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Address[];
  },

  async addAddress(address: AddressInput) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('addresses')
      .insert({
        user_id: user.id,
        label: address.label,
        address: address.address,
        lat: address.lat,
        lng: address.lng,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Address;
  },

  async deleteAddress(id: string) {
    const { error } = await supabase
      .from('addresses')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

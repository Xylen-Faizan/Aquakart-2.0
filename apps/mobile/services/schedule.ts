import { supabase } from '../lib/supabase/client';

export const ScheduleService = {
  async getMySchedules() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('customer_delivery_schedules')
      .select(`
        *,
        supplier_customer:supplier_customer_id(
          supplier:supplier_id(business_name, phone)
        ),
        product:supplier_product_id(
          products:product_id(name)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async updateScheduleStatus(scheduleId: string, isActive: boolean) {
    const { error } = await supabase
      .from('customer_delivery_schedules')
      .update({ is_active: isActive })
      .eq('id', scheduleId);

    if (error) throw error;
  }
};

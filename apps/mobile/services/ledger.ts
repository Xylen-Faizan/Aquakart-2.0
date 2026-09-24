import { supabase } from '../lib/supabase/client';

export interface LedgerEntry {
  id: string;
  reference_type: string;
  entry_type: 'debit' | 'credit';
  amount: number;
  created_at: string;
}

export interface CustomerLedger {
  outstanding_balance: number;
  entries: LedgerEntry[];
}

export interface KhataSummary {
  total_jars: number;
  total_billed: number;
  total_paid: number;
  outstanding: number;
}

export interface KhataEvent {
  event_type: 'delivery' | 'payment';
  event_timestamp: string;
  quantity?: number;
  amount: number;
  payment_method?: string;
  delivery_id?: string;
  payment_id?: string;
}

export const LedgerService = {
  async getCustomerLedger(customerId: string): Promise<CustomerLedger> {
    const { data, error } = await supabase.rpc('get_customer_ledger', {
      p_customer_id: customerId,
    });
    if (error) throw error;
    return data as CustomerLedger;
  },

  async recordPayment(params: {
    customerId: string;
    amount: number;
    paymentMethod?: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('record_ledger_payment', {
      p_customer_id: params.customerId,
      p_amount: params.amount,
      p_payment_method: params.paymentMethod || 'cash',
    });
    if (error) throw error;
  },

  async getCustomerKhataSummary(supplierCustomerId: string, month: string): Promise<KhataSummary> {
    const { data, error } = await supabase.rpc('get_customer_khata_summary', {
      p_supplier_customer_id: supplierCustomerId,
      p_month: month,
    });
    if (error) throw error;
    return data as KhataSummary;
  },

  async getCustomerKhataTimeline(supplierCustomerId: string, month: string | null): Promise<KhataEvent[]> {
    const { data, error } = await supabase.rpc('get_customer_khata_timeline', {
      p_supplier_customer_id: supplierCustomerId,
      p_month: month,
    });
    if (error) throw error;
    return data as KhataEvent[];
  }
};

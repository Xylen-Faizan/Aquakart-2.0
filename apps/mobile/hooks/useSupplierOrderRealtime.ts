import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase/client';

export function useSupplierOrderRealtime(supplierId: string | undefined, onRefetch: () => void) {
  const [status, setStatus] = useState<'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'>('CLOSED');

  useEffect(() => {
    if (!supplierId) return;

    let subscription: any;

    const setupSubscription = () => {
      subscription = supabase
        .channel(`supplier-orders-${supplierId}`)
        .on(
          'postgres_changes',
          { 
            event: '*', 
            schema: 'public', 
            table: 'orders', 
            filter: `supplier_id=eq.${supplierId}` 
          },
          (payload) => {
            console.log('Realtime order change received:', payload);
            onRefetch();
          }
        )
        .subscribe((status, err) => {
          setStatus(status);
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('Realtime subscription error:', err);
            // Attempt to reconnect after a delay
            setTimeout(() => {
              if (subscription) {
                supabase.removeChannel(subscription);
              }
              setupSubscription();
            }, 5000);
          }
        });
    };

    setupSubscription();

    const appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground, force a refetch and ensure subscription is active
        onRefetch();
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
           if (subscription) supabase.removeChannel(subscription);
           setupSubscription();
        }
      }
    });

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
      appStateSubscription.remove();
      setStatus('CLOSED');
    };
  }, [supplierId, onRefetch]);

  return status;
}

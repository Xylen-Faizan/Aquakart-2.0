import { useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase/client';

export function useSupplierOrderRealtime(supplierId: string | undefined, onRefetch: () => void) {
  const [status, setStatus] = useState<'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'>('CLOSED');
  const timerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!supplierId) return;

    let subscription: any;

    const uniqueSuffix = Math.random().toString(36).substring(2, 9);
    const channelName = `supplier-orders-${supplierId}-${uniqueSuffix}`;

    const setupSubscription = () => {
      subscription = supabase
        .channel(channelName)
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
        .subscribe((subStatus, err) => {
          setStatus(subStatus);
          if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
            console.error('Realtime subscription error:', err);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
              if (subscription) supabase.removeChannel(subscription);
              setupSubscription();
            }, 5000);
          }
        });
    };

    setupSubscription();

    const appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        onRefetch();
        if (timerRef.current) clearTimeout(timerRef.current);
        if (subscription) supabase.removeChannel(subscription);
        setupSubscription();
      }
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (subscription) supabase.removeChannel(subscription);
      appStateSubscription.remove();
      setStatus('CLOSED');
    };
  }, [supplierId, onRefetch]);

  return status;
}

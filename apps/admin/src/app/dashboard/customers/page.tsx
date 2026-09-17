'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './customers.module.css';

export default function CustomersPage() {
  const [networkData, setNetworkData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const loadNetworkData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_admin_customer_network_view');
      if (rpcError) throw rpcError;
      
      setNetworkData(data || []);
    } catch (err: any) {
      console.error('Error loading customer network:', err);
      setError(err.message || 'Unable to load customer network data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNetworkData();
  }, [supabase]);

  if (isLoading && networkData.length === 0) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading network intelligence...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <h3>Could not load network view.</h3>
        <p>{error}</p>
        <button onClick={loadNetworkData} className={styles.retryBtn}>Retry</button>
      </div>
    );
  }

  // Calculate the max value for relative bar sizing
  const maxCustomers = networkData.length > 0 
    ? Math.max(...networkData.map(d => d.customer_count)) 
    : 1;

  const totalNetworkCustomers = networkData.reduce((sum, d) => sum + d.customer_count, 0);

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h2 className={styles.pageTitle}>BOKARO CUSTOMER NETWORK</h2>
        <p className={styles.pageSubtitle}>Total Network Customers: {totalNetworkCustomers}</p>
        
        <div className={styles.densitySection}>
          <h3 className={styles.densityHeader}>Customer Density</h3>
          
          {networkData.length === 0 ? (
            <div className={styles.emptyState}>No network data available.</div>
          ) : (
            <div className={styles.densityList}>
              {networkData.map((sectorData, index) => {
                const percentage = Math.round((sectorData.customer_count / maxCustomers) * 100);
                const blockCount = Math.round(percentage / 5); // 1 block per 5% relative density
                const blocks = '█'.repeat(blockCount);

                return (
                  <div key={index} className={styles.densityRow}>
                    <div className={styles.densityInfo}>
                      <span className={styles.sectorName}>{sectorData.sector || 'Unassigned Area'}</span>
                      <span className={styles.customerCount}>
                        {sectorData.customer_count} customers
                      </span>
                    </div>
                    <div className={styles.densityBarContainer}>
                      <div 
                        className={styles.densityBar} 
                        style={{ width: `${Math.max(percentage, 2)}%` }} // Ensure at least 2% width so block text doesn't overflow entirely immediately
                      >
                        <span className={styles.densityBlocks}>{blocks}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

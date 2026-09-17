'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './customers.module.css';

export default function CustomersPage() {
  const [networkData, setNetworkData] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: densityData, error: rpcError } = await supabase.rpc('get_admin_customer_network_view');
      if (rpcError) throw rpcError;

      const { data: customerList, error: custError } = await supabase
        .from('supplier_customers')
        .select('*, suppliers(business_name)')
        .order('created_at', { ascending: false });

      if (custError) console.warn('Could not fetch supplier_customers list:', custError);

      setNetworkData(densityData || []);
      setCustomers(customerList || []);
    } catch (err: any) {
      console.error('Error loading customer network:', err);
      setError(err.message || 'Unable to load customer network data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [supabase]);

  const filteredCustomers = customers.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.sector || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.suppliers?.business_name || '').toLowerCase().includes(q)
    );
  });

  const maxCustomers = networkData.length > 0 
    ? Math.max(...networkData.map(d => d.customer_count)) 
    : 1;

  const totalNetworkCustomers = customers.length || networkData.reduce((sum, d) => sum + d.customer_count, 0);

  if (isLoading && networkData.length === 0) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading customer network intelligence...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <h3>Could not load network view.</h3>
        <p>{error}</p>
        <button onClick={loadData} className={styles.retryBtn}>Retry</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h2 className={styles.pageTitle}>BOKARO CUSTOMER NETWORK</h2>
        <p className={styles.pageSubtitle}>
          Real-time intelligence on customer distribution across Bokaro water supply sectors • Total Registered Customers: <strong>{totalNetworkCustomers}</strong>
        </p>

        {/* Customer Density Chart */}
        <div className={styles.densitySection}>
          <h3 className={styles.densityHeader}>Customer Density by Sector / Area</h3>
          
          {networkData.length === 0 ? (
            <div className={styles.emptyState}>No sector density data available.</div>
          ) : (
            <div className={styles.densityList}>
              {networkData.map((sectorData, index) => {
                const percentage = Math.round((sectorData.customer_count / maxCustomers) * 100);

                return (
                  <div key={index} className={styles.densityRow}>
                    <div className={styles.densityInfo}>
                      <span className={styles.sectorName}>{sectorData.sector || 'Unassigned Area'}</span>
                      <span className={styles.customerCount}>
                        {sectorData.customer_count} customers ({percentage}% of max)
                      </span>
                    </div>
                    <div className={styles.densityBarContainer}>
                      <div 
                        className={styles.densityBar} 
                        style={{ width: `${Math.max(percentage, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Customer Directory Table */}
        <div className={styles.directorySection}>
          <div className={styles.tableHeaderRow}>
            <h3 className={styles.tableTitle}>Customer Directory & Assigned Suppliers</h3>
            <input 
              type="text" 
              placeholder="Search by name, sector, phone..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          {filteredCustomers.length === 0 ? (
            <div className={styles.emptyState}>
              {searchQuery ? 'No customers matching your search.' : 'No customer accounts registered yet.'}
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Sector / Area</th>
                    <th>Type</th>
                    <th>Assigned Supplier</th>
                    <th>Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name || 'Unnamed Customer'}</td>
                      <td>{c.sector || 'Unassigned'}</td>
                      <td>
                        <span className={`${styles.typeBadge} ${c.customer_type === 'commercial' ? styles.commercial : styles.residential}`}>
                          {c.customer_type || 'residential'}
                        </span>
                      </td>
                      <td>{c.suppliers?.business_name || 'Unassigned'}</td>
                      <td>{c.phone || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


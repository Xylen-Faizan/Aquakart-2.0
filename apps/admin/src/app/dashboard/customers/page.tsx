'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import styles from '../dashboard.module.css';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    const fetchCustomers = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'customer');
      
      setCustomers(data || []);
      setIsLoading(false);
    };

    fetchCustomers();
  }, [supabase]);

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h2 className={styles.pageTitle}>Manage Customers</h2>
        
        {isLoading ? (
          <p className={styles.emptyState}>Loading customers...</p>
        ) : (
          <div className={styles.ordersSection}>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Joined Date</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 ? (
                    <tr><td colSpan={4} className={styles.emptyState}>No customers found.</td></tr>
                  ) : (
                    customers.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.name || 'Unnamed'}</td>
                        <td style={{ color: '#64748b' }}>{c.email}</td>
                        <td>{c.phone || '-'}</td>
                        <td style={{ color: '#64748b' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import styles from '../dashboard.module.css';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    const fetchSuppliers = async () => {
      const { data } = await supabase
        .from('suppliers')
        .select('*, profiles(name, email)');
      
      setSuppliers(data || []);
      setIsLoading(false);
    };

    fetchSuppliers();
  }, [supabase]);

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h2 className={styles.pageTitle}>Manage Suppliers</h2>
        
        {isLoading ? (
          <p className={styles.emptyState}>Loading suppliers...</p>
        ) : (
          <div className={styles.ordersSection}>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Business Name</th>
                    <th>Owner</th>
                    <th>Phone</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.length === 0 ? (
                    <tr><td colSpan={4} className={styles.emptyState}>No suppliers found.</td></tr>
                  ) : (
                    suppliers.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.business_name}</td>
                        <td>{s.profiles?.name} <br/><span style={{ fontSize: '0.8rem', color: '#64748b' }}>{s.profiles?.email}</span></td>
                        <td>{s.phone}</td>
                        <td>
                          <span className={`${styles.statusBadge} ${s.is_active ? styles.delivered : styles.cancelled}`}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
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

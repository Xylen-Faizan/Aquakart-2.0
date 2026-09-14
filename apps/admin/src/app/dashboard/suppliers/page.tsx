'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import styles from '../dashboard.module.css';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

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
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logoWrapper}>
            <Image src="/logo.png" alt="AquaKart Logo" width={40} height={40} className={styles.headerLogo} />
            <h1 className={styles.logo}>AquaKart Admin</h1>
          </div>
          <nav className={styles.nav}>
            <Link href="/dashboard" className={styles.navLink}>Dashboard</Link>
            <Link href="/dashboard/customers" className={styles.navLink}>Customers</Link>
            <Link href="/dashboard/orders" className={styles.navLink}>Orders</Link>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        <h2 className={styles.pageTitle}>Manage Suppliers</h2>
        
        {isLoading ? (
          <p>Loading suppliers...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
              <tr>
                <th style={{ padding: '1rem' }}>Business Name</th>
                <th style={{ padding: '1rem' }}>Owner</th>
                <th style={{ padding: '1rem' }}>Phone</th>
                <th style={{ padding: '1rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No suppliers found.</td></tr>
              ) : (
                suppliers.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '1rem' }}>{s.business_name}</td>
                    <td style={{ padding: '1rem' }}>{s.profiles?.name} <br/><span style={{ fontSize: '0.8rem', color: '#64748b' }}>{s.profiles?.email}</span></td>
                    <td style={{ padding: '1rem' }}>{s.phone}</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ 
                        padding: '0.25rem 0.75rem', 
                        borderRadius: '9999px', 
                        fontSize: '0.875rem',
                        backgroundColor: s.is_active ? '#dcfce7' : '#fee2e2',
                        color: s.is_active ? '#166534' : '#991b1b'
                      }}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}

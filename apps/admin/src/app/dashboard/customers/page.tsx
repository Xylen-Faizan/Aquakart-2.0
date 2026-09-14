'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import styles from '../dashboard.module.css';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

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
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logoWrapper}>
            <Image src="/logo.png" alt="AquaKart Logo" width={40} height={40} className={styles.headerLogo} />
            <h1 className={styles.logo}>AquaKart Admin</h1>
          </div>
          <nav className={styles.nav}>
            <Link href="/dashboard" className={styles.navLink}>Dashboard</Link>
            <Link href="/dashboard/suppliers" className={styles.navLink}>Suppliers</Link>
            <Link href="/dashboard/orders" className={styles.navLink}>Orders</Link>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        <h2 className={styles.pageTitle}>Manage Customers</h2>
        
        {isLoading ? (
          <p>Loading customers...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
              <tr>
                <th style={{ padding: '1rem' }}>Name</th>
                <th style={{ padding: '1rem' }}>Email</th>
                <th style={{ padding: '1rem' }}>Phone</th>
                <th style={{ padding: '1rem' }}>Joined Date</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No customers found.</td></tr>
              ) : (
                customers.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>{c.name || 'Unnamed'}</td>
                    <td style={{ padding: '1rem', color: '#64748b' }}>{c.email}</td>
                    <td style={{ padding: '1rem' }}>{c.phone || '-'}</td>
                    <td style={{ padding: '1rem', color: '#64748b' }}>{new Date(c.created_at).toLocaleDateString()}</td>
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

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import styles from '../dashboard.module.css';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select(`
          *,
          customer:profiles!customer_id(name, email),
          supplier:suppliers!supplier_id(business_name)
        `)
        .order('created_at', { ascending: false });
      
      setOrders(data || []);
      setIsLoading(false);
    };

    fetchOrders();
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
            <Link href="/dashboard/customers" className={styles.navLink}>Customers</Link>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        <h2 className={styles.pageTitle}>Manage Orders</h2>
        
        {isLoading ? (
          <p>Loading orders...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
              <tr>
                <th style={{ padding: '1rem' }}>Order ID</th>
                <th style={{ padding: '1rem' }}>Customer</th>
                <th style={{ padding: '1rem' }}>Supplier</th>
                <th style={{ padding: '1rem' }}>Total</th>
                <th style={{ padding: '1rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No orders found.</td></tr>
              ) : (
                orders.map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>{o.display_id}</td>
                    <td style={{ padding: '1rem' }}>{o.customer?.name}</td>
                    <td style={{ padding: '1rem' }}>{o.supplier?.business_name || 'Unassigned'}</td>
                    <td style={{ padding: '1rem' }}>₹{o.total}</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ 
                        padding: '0.25rem 0.75rem', 
                        borderRadius: '9999px', 
                        fontSize: '0.875rem',
                        textTransform: 'capitalize',
                        backgroundColor: o.status === 'delivered' ? '#dcfce7' : (o.status === 'cancelled' || o.status === 'rejected') ? '#fee2e2' : '#fef9c3',
                        color: o.status === 'delivered' ? '#166534' : (o.status === 'cancelled' || o.status === 'rejected') ? '#991b1b' : '#854d0e'
                      }}>
                        {o.status.replace('_', ' ')}
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

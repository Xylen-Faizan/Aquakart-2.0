'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import styles from '../dashboard.module.css';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [supabase] = useState(() => createClient());

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
      <main className={styles.main}>
        <h2 className={styles.pageTitle}>Manage Orders</h2>
        
        {isLoading ? (
          <p className={styles.emptyState}>Loading orders...</p>
        ) : (
          <div className={styles.ordersSection}>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Supplier</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr><td colSpan={5} className={styles.emptyState}>No orders found.</td></tr>
                  ) : (
                    orders.map(o => (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 600 }}>{o.display_id}</td>
                        <td>{o.customer?.name}</td>
                        <td>{o.supplier?.business_name || 'Unassigned'}</td>
                        <td style={{ fontWeight: 600 }}>₹{o.total}</td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles[o.status] || ''}`}>
                            {o.status.replace('_', ' ')}
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

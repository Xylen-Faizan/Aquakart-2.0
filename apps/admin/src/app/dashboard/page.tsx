'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import styles from './dashboard.module.css';

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [metrics, setMetrics] = useState({
    customers: 0,
    totalSuppliers: 0,
    activeSuppliers: 0,
    totalOrders: 0,
    activeOrders: 0,
    completedOrders: 0,
  });

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push('/login');
        return;
      }
      
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (profile?.role !== 'admin') {
        await supabase.auth.signOut();
        router.push('/login');
        return;
      }
      
      // Fetch metrics
      const [
        { count: customers },
        { count: totalSuppliers },
        { count: activeSuppliers },
        { count: totalOrders },
        { count: activeOrders },
        { count: completedOrders },
        { data: recentOrders }
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
        supabase.from('suppliers').select('*', { count: 'exact', head: true }),
        supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['placed', 'accepted', 'preparing', 'out_for_delivery']),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'delivered'),
        supabase.from('orders').select(`
          id,
          display_id,
          status,
          created_at,
          profiles:customer_id(name),
          suppliers:supplier_id(business_name)
        `).order('created_at', { ascending: false }).limit(10)
      ]);
      
      setMetrics({
        customers: customers || 0,
        totalSuppliers: totalSuppliers || 0,
        activeSuppliers: activeSuppliers || 0,
        totalOrders: totalOrders || 0,
        activeOrders: activeOrders || 0,
        completedOrders: completedOrders || 0,
      });

      setOrders(recentOrders || []);
      setIsLoading(false);
    };

    checkAuth();
  }, [router, supabase]);



  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading dashboard...</div>;
  }

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h2 className={styles.pageTitle}>Dashboard Overview</h2>
        
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Total Customers</h3>
            <p className={styles.metricValue}>{metrics.customers}</p>
          </div>
          
          <div className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Total Suppliers</h3>
            <p className={styles.metricValue}>{metrics.totalSuppliers}</p>
          </div>
          
          <div className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Active Suppliers</h3>
            <p className={styles.metricValue}>{metrics.activeSuppliers}</p>
          </div>
          
          <div className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Total Orders</h3>
            <p className={styles.metricValue}>{metrics.totalOrders}</p>
          </div>
          
          <div className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Active Orders</h3>
            <p className={styles.metricValue}>{metrics.activeOrders}</p>
          </div>
          
          <div className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Completed Orders</h3>
            <p className={styles.metricValue}>{metrics.completedOrders}</p>
          </div>
        </div>

        <div className={styles.ordersSection}>
          <h2 className={styles.sectionTitle}>Recent Orders</h2>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order: any) => (
                  <tr key={order.id}>
                    <td>{order.display_id}</td>
                    <td>{order.profiles?.name || 'Unknown'}</td>
                    <td>{order.suppliers?.business_name || 'Unassigned'}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[order.status]}`}>
                        {order.status}
                      </span>
                    </td>
                    <td>{formatDate(order.created_at)}</td>
                    <td className={styles.actionsCell}>
                      <Link href={`/dashboard/orders/${order.id}`} className={styles.actionBtn}>
                        View
                      </Link>
                      {order.status === 'placed' && (
                        <Link href={`/dashboard/orders/${order.id}/reassign`} className={styles.actionBtnSecondary}>
                          Reassign
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>No recent orders</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

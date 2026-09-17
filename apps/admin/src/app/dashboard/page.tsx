'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import styles from './dashboard.module.css';

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [metrics, setMetrics] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [capacities, setCapacities] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  
  const loadDashboard = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push('/login');
        return;
      }
      
      const { data: overviewData, error: overviewError } = await supabase.rpc('get_admin_network_overview');
      if (overviewError) throw overviewError;

      const { data: alertsData, error: alertsError } = await supabase.rpc('get_admin_operational_alerts');
      if (alertsError) throw alertsError;

      const { data: capacityData, error: capacityError } = await supabase.rpc('get_admin_network_capacity');
      if (capacityError) throw capacityError;

      const { data: risksData, error: risksError } = await supabase.rpc('get_network_health_risks');
      if (risksError) throw risksError;

      if (overviewData && overviewData.length > 0) {
        setMetrics(overviewData[0]);
      }
      setAlerts(alertsData || []);
      setCapacities((capacityData || []).slice(0, 5)); // Show top 5
      setRisks(risksData || []);

    } catch (err: any) {
      console.error('Error loading dashboard:', err);
      setError(err.message || 'Unable to load network metrics.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [router, supabase]);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading network data...</p>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className={styles.errorState}>
        <h3>Unable to load network metrics.</h3>
        <p>{error}</p>
        <button onClick={loadDashboard} className={styles.retryBtn}>Retry</button>
      </div>
    );
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning, Admin';
    if (hour < 17) return 'Good afternoon, Admin';
    return 'Good evening, Admin';
  };

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className={styles.header}>
          <p className={styles.greeting}>{getGreeting()}</p>
          <h2 className={styles.pageTitle}>Bokaro Water Network</h2>
        </div>
        
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Suppliers</h3>
            <p className={styles.metricValue}>{metrics.total_suppliers}</p>
            <div className={styles.subMetrics}>
              <div className={styles.subMetric}>
                <span className={styles.subMetricLabel}>Active</span>
                <span className={styles.subMetricValue}>{metrics.active_suppliers}</span>
              </div>
            </div>
          </div>
          
          <div className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Customers</h3>
            <p className={styles.metricValue}>{metrics.total_customers}</p>
            <div className={styles.subMetrics}>
              <div className={styles.subMetric}>
                <span className={styles.subMetricLabel}>Total Registered</span>
                <span className={styles.subMetricValue}>{metrics.total_customers}</span>
              </div>
            </div>
          </div>
          
          <div className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Active Orders</h3>
            <p className={styles.metricValue}>{metrics.orders_today}</p>
            <div className={styles.subMetrics}>
              <div className={styles.subMetric}>
                <span className={styles.subMetricLabel}>Pending</span>
                <span className={styles.subMetricValue} style={{ color: metrics.pending_orders > 0 ? '#fbbf24' : '#cbd5e1' }}>
                  {metrics.pending_orders}
                </span>
              </div>
            </div>
          </div>
          
          <div className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Today's Deliveries</h3>
            <p className={styles.metricValue}>{metrics.deliveries_today}</p>
            <div className={styles.subMetrics}>
              <div className={styles.subMetric}>
                <span className={styles.subMetricLabel}>Float (Jars)</span>
                <span className={styles.subMetricValue}>{metrics.jars_in_network}</span>
              </div>
            </div>
          </div>
        </div>

        <h2 className={styles.sectionTitle} style={{ marginBottom: '1.5rem', marginTop: '2rem' }}>Network Activity</h2>
        
        <div className={styles.sectionsGrid}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Operational Alerts</h3>
            {alerts.length === 0 ? (
              <div className={styles.emptyState}>No active alerts on the network.</div>
            ) : (
              <div className={styles.alertsList}>
                {alerts.map((alert: any, idx: number) => {
                  let actionText = "View";
                  let actionUrl = "/dashboard";
                  
                  if (alert.alert_type === 'supplier_inactive' || alert.alert_type === 'supplier_capacity') {
                    actionText = "Manage Supplier";
                    actionUrl = `/dashboard/suppliers?id=${alert.entity_id}`;
                  } else if (alert.alert_type === 'pending_orders') {
                    actionText = "Review Orders";
                    actionUrl = `/dashboard/orders?supplier_id=${alert.entity_id}`;
                  }

                  return (
                    <div key={idx} className={`${styles.alertCard} ${alert.severity === 'high' ? styles.high : styles.medium}`}>
                      <div className={styles.alertContent}>
                        <span className={styles.alertMessage}>⚠️ {alert.message}</span>
                        <span className={styles.alertEntity}>{alert.entity_name}</span>
                      </div>
                      <Link href={actionUrl} className={styles.alertAction}>
                        [{actionText}]
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Network Health & Risk</h3>
            {risks.length === 0 ? (
              <div className={styles.emptyState}>All suppliers have healthy inventory forecasts.</div>
            ) : (
              <div className={styles.alertsList}>
                {risks.map((risk: any) => (
                  <div key={risk.supplier_id} className={`${styles.alertCard} ${styles.high}`}>
                    <div className={styles.alertContent}>
                      <span className={styles.alertMessage}>
                        🚨 Shortfall: Needs {risk.total_forecast} jars tomorrow, but only has {risk.current_inventory} (Shortfall: {risk.shortfall})
                      </span>
                      <span className={styles.alertEntity}>{risk.business_name}</span>
                    </div>
                    <Link href={`/dashboard/suppliers?id=${risk.supplier_id}`} className={styles.alertAction}>
                      [Reassign]
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Network Capacity</h3>
            {capacities.length === 0 ? (
              <div className={styles.emptyState}>No capacity data available.</div>
            ) : (
              <div className={styles.capacityList}>
                {capacities.map((cap: any) => {
                  const percentage = cap.max_capacity > 0 
                    ? Math.round((cap.fulfilled_quantity / cap.max_capacity) * 100) 
                    : 0;
                  
                  let barClass = styles.safe;
                  if (percentage >= 90) barClass = styles.danger;
                  else if (percentage >= 75) barClass = styles.warning;

                  return (
                    <div key={cap.supplier_id} className={styles.capacityItem}>
                      <div className={styles.capacityHeader}>
                        <span className={styles.capacityName}>{cap.business_name}</span>
                        <span className={styles.capacityValue}>{percentage}%</span>
                      </div>
                      <div className={styles.progressBarContainer}>
                        <div 
                          className={`${styles.progressBar} ${barClass}`} 
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './coverage.module.css';

export default function OpportunityCoveragePage() {
  const [supabase] = useState(() => createClient());
  const [coverageData, setCoverageData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCoverage = useCallback(async () => {
    setLoading(true);
    // Fetch from opportunity_coverage_live view
    const { data, error } = await supabase
      .from('opportunity_coverage_live')
      .select('*')
      .order('sector_name');

    if (!error && data) {
      setCoverageData(data);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchCoverage();
    
    // In a real app we'd want to subscribe to updates or poll since views aren't natively realtime,
    // but for the pilot, polling every 30 seconds is a simple approach.
    const interval = setInterval(fetchCoverage, 30000);
    return () => clearInterval(interval);
  }, [fetchCoverage]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Opportunity Coverage</h1>
          <p className={styles.subtitle}>Real-time Demand vs Supply by Sector</p>
        </div>
        <button onClick={fetchCoverage} className={styles.refreshBtn} disabled={loading}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? styles.spin : ''}><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
          Refresh
        </button>
      </header>

      <div className={styles.grid}>
        {coverageData.map((sector) => {
          const supply = Number(sector.supply_jars) || 0;
          const demand = Number(sector.demand_jars) || 0;
          const vehicles = Number(sector.active_vehicles) || 0;
          
          let statusClass = styles.statusGood;
          let statusText = 'Optimal';
          
          if (demand > supply) {
            statusClass = styles.statusCritical;
            statusText = 'Under-supplied';
          } else if (supply > 0 && demand === 0) {
            statusClass = styles.statusWarning;
            statusText = 'Over-supplied';
          } else if (supply === 0 && demand === 0) {
            statusClass = styles.statusNeutral;
            statusText = 'Inactive';
          }

          return (
            <div key={sector.sector_id} className={styles.sectorCard}>
              <div className={styles.cardHeader}>
                <h3 className={styles.sectorName}>{sector.sector_name}</h3>
                <span className={`${styles.badge} ${statusClass}`}>{statusText}</span>
              </div>
              
              <div className={styles.statsContainer}>
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>Active Vehicles</span>
                  <span className={styles.statValue}>{vehicles}</span>
                </div>
                
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>Supply (Jars)</span>
                  <span className={`${styles.statValue} ${styles.textPrimary}`}>{supply}</span>
                </div>

                <div className={styles.statBox}>
                  <span className={styles.statLabel}>Demand (Jars)</span>
                  <span className={`${styles.statValue} ${demand > 0 ? styles.textError : ''}`}>{demand}</span>
                </div>
              </div>
              
              <div className={styles.barContainer}>
                <div className={styles.barLabels}>
                  <span>Supply vs Demand</span>
                </div>
                <div className={styles.barTrack}>
                  {supply > 0 && (
                    <div 
                      className={styles.supplyFill} 
                      style={{ width: `${Math.min(100, (supply / Math.max(supply, demand)) * 100)}%` }} 
                    />
                  )}
                  {demand > 0 && (
                    <div 
                      className={styles.demandMarker} 
                      style={{ left: `${Math.min(100, (demand / Math.max(supply, demand)) * 100)}%` }}
                      title={`Demand: ${demand}`}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {coverageData.length === 0 && !loading && (
          <div className={styles.emptyState}>No sectors configured or no data available.</div>
        )}
      </div>
    </div>
  );
}

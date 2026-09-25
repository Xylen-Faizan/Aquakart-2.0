'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './exceptions.module.css';

export default function DispatchExceptionsPage() {
  const [supabase] = useState(() => createClient());
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExceptions = useCallback(async () => {
    setLoading(true);
    // Fetch from dispatch_exceptions view
    const { data, error } = await supabase
      .from('dispatch_exceptions')
      .select(`
        *,
        customers:customer_id (
          profile_id,
          profiles:profile_id (
            name
          )
        )
      `)
      .order('request_created_at', { ascending: false });

    if (!error && data) {
      setExceptions(data);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchExceptions();
  }, [fetchExceptions]);

  const getStatusBadgeClass = (status: string) => {
    if (status === 'failed') return styles.badgeError;
    if (status === 'completed') return styles.badgeSuccess;
    if (status === 'searching') return styles.badgeWarning;
    return styles.badgeNeutral;
  };

  const getOfferStatusBadge = (status: string) => {
    if (status === 'declined') return styles.badgeError;
    if (status === 'expired') return styles.badgeWarning;
    if (status === 'accepted') return styles.badgeSuccess;
    return styles.badgeNeutral;
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dispatch Exceptions</h1>
        <p className={styles.subtitle}>Audit Trail of Request Dispatch Decisions</p>
      </header>

      {loading ? (
        <div className={styles.loading}>Loading audit trail...</div>
      ) : (
        <div className={styles.listContainer}>
          {exceptions.map(exc => (
            <div key={exc.request_id} className={styles.exceptionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.requestInfo}>
                  <h3 className={styles.customerName}>
                    {exc.customers?.profiles?.name || 'Unknown Customer'}
                  </h3>
                  <span className={styles.requestDetails}>
                    Requested: <strong>{exc.quantity} jars</strong> • {new Date(exc.request_created_at).toLocaleString()}
                  </span>
                </div>
                <div className={styles.requestMeta}>
                  <span className={`${styles.badge} ${getStatusBadgeClass(exc.request_status)}`}>
                    {exc.request_status.toUpperCase()}
                  </span>
                </div>
              </div>
              
              <div className={styles.statsRow}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Total Offers</span>
                  <span className={styles.statValue}>{exc.offer_count}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Declined</span>
                  <span className={`${styles.statValue} ${exc.declined_count > 0 ? styles.textError : ''}`}>{exc.declined_count}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Expired</span>
                  <span className={`${styles.statValue} ${exc.expired_count > 0 ? styles.textWarning : ''}`}>{exc.expired_count}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Accepted</span>
                  <span className={`${styles.statValue} ${exc.accepted_count > 0 ? styles.textSuccess : ''}`}>{exc.accepted_count}</span>
                </div>
              </div>

              {exc.offers && exc.offers.length > 0 && (
                <div className={styles.offersContainer}>
                  <h4 className={styles.offersTitle}>Offer History (Audit Trail)</h4>
                  <div className={styles.offersList}>
                    {exc.offers.map((offer: any) => (
                      <div key={offer.offer_id} className={styles.offerItem}>
                        <div className={styles.offerMain}>
                          <span className={`${styles.badge} ${getOfferStatusBadge(offer.status)}`}>
                            {offer.status.toUpperCase()}
                          </span>
                          <span className={styles.offerTime}>
                            {new Date(offer.offered_at).toLocaleTimeString()}
                          </span>
                          <span className={styles.offerSupplier}>
                            Supplier ID: {offer.supplier_id.substring(0,8)}
                          </span>
                        </div>
                        <div className={styles.offerDetails}>
                          Snapshot: {offer.distance_snapshot_km}km • ETA: {offer.eta_snapshot_minutes}m • Capacity: {offer.capacity_snapshot_opportunity}
                        </div>
                        {(offer.decline_reason_code || offer.decline_reason_note) && (
                          <div className={styles.offerReason}>
                            Reason: <strong>{offer.decline_reason_code}</strong> {offer.decline_reason_note ? `- ${offer.decline_reason_note}` : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {exceptions.length === 0 && (
            <div className={styles.emptyState}>No dispatch exceptions found.</div>
          )}
        </div>
      )}
    </div>
  );
}

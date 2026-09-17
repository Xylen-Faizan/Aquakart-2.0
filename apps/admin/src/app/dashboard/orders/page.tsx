'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import styles from './orders.module.css';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [reassignModal, setReassignModal] = useState<{
    isOpen: boolean;
    orderId: string;
    displayId: string;
  }>({ isOpen: false, orderId: '', displayId: '' });

  const [candidates, setCandidates] = useState<any[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);
  
  const [toast, setToast] = useState<{show: boolean, message: string}>({show: false, message: ''});
  
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const loadOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_admin_orders');
      if (rpcError) throw rpcError;
      
      setOrders(data || []);
    } catch (err: any) {
      console.error('Error loading orders:', err);
      setError(err.message || 'Unable to load network orders.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [supabase]);

  const showToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 3000);
  };

  const openReassignModal = async (orderId: string, displayId: string) => {
    setReassignModal({ isOpen: true, orderId, displayId });
    setCandidatesLoading(true);
    setReassignError(null);
    setCandidates([]);
    
    try {
      const { data, error: rpcError } = await supabase.rpc('get_reassignment_candidates', {
        p_order_id: orderId
      });
      
      if (rpcError) throw rpcError;
      setCandidates(data || []);
    } catch (err: any) {
      console.error('Failed to get candidates:', err);
      setReassignError('Could not load supplier candidates: ' + err.message);
    } finally {
      setCandidatesLoading(false);
    }
  };

  const executeReassignment = async (supplierId: string) => {
    try {
      setIsReassigning(true);
      const { error: rpcError } = await supabase.rpc('admin_reassign_order', {
        p_order_id: reassignModal.orderId,
        p_new_supplier_id: supplierId,
        p_reason: 'Admin manual reassignment'
      });

      if (rpcError) throw rpcError;

      showToast('Order successfully reassigned.');
      setReassignModal({ isOpen: false, orderId: '', displayId: '' });
      await loadOrders(); // Refresh orders list
      
    } catch (err: any) {
      console.error('Failed to reassign:', err);
      alert('Failed to reassign order: ' + err.message);
    } finally {
      setIsReassigning(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading network orders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <h3>Could not load network orders.</h3>
        <p>{error}</p>
        <button onClick={loadOrders} className={styles.retryBtn}>Retry</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h2 className={styles.pageTitle}>Network Orders</h2>
        
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer / Area</th>
                <th>Supplier</th>
                <th>Time</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyState}>No orders found in the network.</td>
                </tr>
              ) : (
                orders.map(order => (
                  <tr key={order.order_id}>
                    <td style={{ fontWeight: 600 }}>{order.display_id}</td>
                    <td>
                      {order.customer_name}
                      <br/>
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{order.sector}</span>
                    </td>
                    <td>{order.supplier_name || <span style={{ color: '#94a3b8' }}>Unassigned</span>}</td>
                    <td>{formatDate(order.created_at)}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[order.status]}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className={styles.actionsCell}>
                      <button className={styles.actionBtn}>Manage</button>
                      
                      {(order.status === 'pending' || order.status === 'placed') && (
                        <button 
                          className={`${styles.actionBtn} ${styles.reassignBtn}`}
                          onClick={() => openReassignModal(order.order_id, order.display_id)}
                        >
                          Reassign
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Reassignment Modal */}
      {reassignModal.isOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Reassign Order</h3>
            <p className={styles.modalSubtitle}>Order #{reassignModal.displayId}</p>

            {candidatesLoading ? (
              <div className={styles.loading} style={{ minHeight: '20vh' }}>
                <div className={styles.spinner} style={{ width: '30px', height: '30px' }}></div>
                <p>Finding eligible candidates...</p>
              </div>
            ) : reassignError ? (
              <div className={styles.errorState} style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <p>{reassignError}</p>
                <button className={styles.retryBtn} onClick={() => openReassignModal(reassignModal.orderId, reassignModal.displayId)}>Retry</button>
              </div>
            ) : candidates.length === 0 ? (
              <div className={styles.emptyState} style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                No eligible alternate suppliers found for this order.
              </div>
            ) : (
              <div className={styles.candidatesList}>
                <p style={{ color: '#e2e8f0', margin: '0 0 0.5rem 0', fontWeight: 500 }}>Eligible Suppliers:</p>
                {candidates.map(candidate => (
                  <div key={candidate.supplier_id} className={styles.candidateCard}>
                    <div className={styles.candidateInfo}>
                      <span className={styles.candidateName}>{candidate.business_name}</span>
                      <div className={styles.candidateMetrics}>
                        <span>Capacity remaining: {candidate.remaining_capacity}</span>
                        <span>Distance: {candidate.distance_km} km</span>
                      </div>
                    </div>
                    <button 
                      className={styles.selectBtn}
                      disabled={isReassigning}
                      onClick={() => executeReassignment(candidate.supplier_id)}
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.modalActions}>
              <button 
                className={styles.cancelBtn} 
                disabled={isReassigning}
                onClick={() => setReassignModal({ isOpen: false, orderId: '', displayId: '' })}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast.show && (
        <div className={styles.toast}>
          ✓ {toast.message}
        </div>
      )}
    </div>
  );
}

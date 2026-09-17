'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './suppliers.module.css';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [supplierDetails, setSupplierDetails] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({ isOpen: false, title: '', message: '', action: () => {} });

  const [toast, setToast] = useState<{show: boolean, message: string}>({show: false, message: ''});
  
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const loadSuppliers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_admin_suppliers_list');
      if (rpcError) throw rpcError;
      
      setSuppliers(data || []);
    } catch (err: any) {
      console.error('Error loading suppliers:', err);
      setError(err.message || 'Unable to load supplier directory.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [supabase]);

  const showToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 3000);
  };

  const loadSupplierDetails = async (supplierId: string) => {
    if (expandedSupplier === supplierId) {
      setExpandedSupplier(null);
      return;
    }
    
    setExpandedSupplier(supplierId);
    setDetailsLoading(true);
    
    try {
      // Load specific details using regular queries since RPC only returns list aggregates
      const [
        { data: details },
        { data: collections }
      ] = await Promise.all([
        supabase.from('suppliers').select('*, profiles(name, email, phone)').eq('id', supplierId).single(),
        supabase.from('customer_ledger').select('amount').eq('supplier_id', supplierId).eq('type', 'charge') // Mock calculation base
      ]);

      setSupplierDetails(details);
    } catch (err) {
      console.error('Failed to load details', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleUpdateStatus = async (supplierId: string, newStatus: string) => {
    try {
      setIsLoading(true);
      const isVerified = newStatus === 'verified';
      const isActive = newStatus !== 'inactive';
      
      const { error: updateError } = await supabase.rpc('admin_update_supplier_status', {
        p_supplier_id: supplierId,
        p_is_active: isActive,
        p_is_verified: isVerified
      });

      if (updateError) throw updateError;
      
      showToast(`Supplier status updated to ${newStatus}`);
      await loadSuppliers();
      
      if (expandedSupplier === supplierId) {
        setExpandedSupplier(null);
      }
    } catch (err: any) {
      console.error('Error updating supplier status:', err);
      alert('Failed to update status: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmDeactivate = (supplierId: string, businessName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Deactivate supplier?',
      message: `This will prevent ${businessName} from receiving new AquaKart orders.\nAre you sure you want to deactivate?`,
      action: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        handleUpdateStatus(supplierId, 'inactive');
      }
    });
  };

  if (isLoading && suppliers.length === 0) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading supplier directory...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <h3>Could not load supplier candidates.</h3>
        <p>{error}</p>
        <button onClick={loadSuppliers} className={styles.retryBtn}>Retry</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h2 className={styles.pageTitle}>Supplier Directory</h2>
        
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Status</th>
                <th>Capacity</th>
                <th>Customers</th>
                <th>Orders Today</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyState}>No suppliers found in the network.</td>
                </tr>
              ) : (
                suppliers.map(s => (
                  <tr key={s.supplier_id}>
                    <td 
                      style={{ fontWeight: 600, cursor: 'pointer', color: '#38bdf8' }}
                      onClick={() => loadSupplierDetails(s.supplier_id)}
                    >
                      {s.business_name}
                      <br/>
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 400 }}>{s.area}</span>
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[s.status]}`}>
                        {s.status}
                      </span>
                    </td>
                    <td>{s.capacity}</td>
                    <td>{s.active_customers}</td>
                    <td>{s.orders_today}</td>
                    <td className={styles.actionsCell}>
                      {s.status === 'pending' && (
                        <button onClick={() => handleUpdateStatus(s.supplier_id, 'verified')} className={`${styles.actionBtn} ${styles.verifyBtn}`}>
                          Verify
                        </button>
                      )}
                      
                      {s.status === 'verified' && (
                        <button onClick={() => confirmDeactivate(s.supplier_id, s.business_name)} className={styles.actionBtn}>
                          Deactivate
                        </button>
                      )}
                      
                      {s.status === 'inactive' && (
                        <button onClick={() => handleUpdateStatus(s.supplier_id, 'verified')} className={styles.actionBtn}>
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {expandedSupplier && (
          <div className={styles.detailsPanel}>
            {detailsLoading ? (
              <div className={styles.loading} style={{ gridColumn: '1 / -1', minHeight: '20vh' }}>
                <div className={styles.spinner} style={{ width: '30px', height: '30px' }}></div>
              </div>
            ) : supplierDetails ? (
              <>
                <div className={styles.detailsHeader}>
                  <h4>{supplierDetails.business_name} Overview</h4>
                  <button className={styles.actionBtn} onClick={() => setExpandedSupplier(null)}>Close</button>
                </div>
                
                <div className={styles.detailsSection}>
                  <h5>Business Profile</h5>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Status</span>
                    <span className={styles.detailValue}>
                       {suppliers.find(s => s.supplier_id === expandedSupplier)?.status || 'Unknown'}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Owner</span>
                    <span className={styles.detailValue}>{supplierDetails.profiles?.name}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Contact</span>
                    <span className={styles.detailValue}>{supplierDetails.profiles?.phone || supplierDetails.phone}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Active Customers</span>
                    <span className={styles.detailValue}>{suppliers.find(s => s.supplier_id === expandedSupplier)?.active_customers || 0}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Address</span>
                    <span className={styles.detailValue}>{supplierDetails.area}</span>
                  </div>
                </div>

                <div className={styles.detailsSection}>
                  <h5>Operations & Capacity</h5>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Max Capacity</span>
                    <span className={styles.detailValue}>{suppliers.find(s => s.supplier_id === expandedSupplier)?.capacity || 0} Jars</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Today's Orders</span>
                    <span className={styles.detailValue}>{suppliers.find(s => s.supplier_id === expandedSupplier)?.orders_today || 0}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Fulfillment Rate</span>
                    <span className={styles.detailValue}>
                      {suppliers.find(s => s.supplier_id === expandedSupplier)?.fulfillment_rate || 0}%
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Platform Fees Outstanding</span>
                    <span className={styles.detailValue} style={{ color: '#fbbf24' }}>₹0</span>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>{confirmModal.title}</h3>
            <p className={styles.modalText} style={{ whiteSpace: 'pre-line' }}>{confirmModal.message}</p>
            <div className={styles.modalActions}>
              <button 
                className={styles.cancelBtn} 
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
              >
                Cancel
              </button>
              <button 
                className={styles.dangerBtn} 
                onClick={confirmModal.action}
              >
                Deactivate
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

'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import styles from './layout.module.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isMainDashboard = pathname === '/dashboard';

  return (
    <div className={styles.layoutContainer}>
      {/* Sidebar Navigation */}
      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.logoWrapper}>
          <Image 
            src="/logo.png" 
            alt="AquaKart Logo" 
            width={36} 
            height={36} 
          />
          <span className={styles.logoText}>AquaKart</span>
        </Link>
        
        <nav className={styles.nav}>
          <Link 
            href="/dashboard" 
            className={`${styles.navLink} ${pathname === '/dashboard' ? styles.navLinkActive : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>
            Overview
          </Link>
          <Link 
            href="/dashboard/suppliers" 
            className={`${styles.navLink} ${pathname.startsWith('/dashboard/suppliers') ? styles.navLinkActive : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            Suppliers
          </Link>
          <Link 
            href="/dashboard/customers" 
            className={`${styles.navLink} ${pathname.startsWith('/dashboard/customers') ? styles.navLinkActive : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            Customers
          </Link>
          <Link 
            href="/dashboard/orders" 
            className={`${styles.navLink} ${pathname.startsWith('/dashboard/orders') ? styles.navLinkActive : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            Orders
          </Link>
        </nav>

        <div className={styles.signOutWrapper}>
          <button onClick={handleSignOut} className={styles.signOutBtn}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={styles.mainContent}>
        {/* Top Navbar */}
        <header className={styles.topBar}>
          {!isMainDashboard ? (
            <button onClick={() => router.back()} className={styles.backBtn}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Go Back
            </button>
          ) : (
            <div style={{ width: '100px' }} /> /* Spacer to keep alignment */
          )}
        </header>

        {/* Page Content */}
        {children}
      </main>
    </div>
  );
}

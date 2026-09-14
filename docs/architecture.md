# AquaKart 2.0 — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    AquaKart 2.0                         │
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │ Mobile App │  │ Admin App  │  │   Supabase       │  │
│  │ (Expo/RN)  │  │ (Next.js)  │  │                  │  │
│  │            │  │            │  │  PostgreSQL       │  │
│  │ Customer   │  │ Dashboard  │  │  Auth             │  │
│  │ Supplier   │  │ Management │  │  RLS              │  │
│  │            │  │            │  │  Realtime          │  │
│  └──────┬─────┘  └──────┬─────┘  │  Functions (RPC) │  │
│         │               │        └────────┬─────────┘  │
│         │               │                 │             │
│         └───────────────┴─────────────────┘             │
│              Supabase JS Client (publishable key)       │
└─────────────────────────────────────────────────────────┘
```

## Mobile App (apps/mobile/)

- **Framework**: Expo SDK 52, React Native 0.76, TypeScript
- **Navigation**: Expo Router v4 (file-based)
- **State**: React Context (AuthProvider)
- **Supabase**: `@supabase/supabase-js` with AsyncStorage for session persistence
- **Validation**: Zod schemas from `@aquakart/validation`

### Feature-Oriented Structure
```
app/              # Expo Router screens
  (auth)/         # Welcome, login, register
  (customer)/     # Customer screens
  (supplier)/     # Supplier screens
components/       # Reusable UI
features/         # Feature logic (auth, etc.)
lib/supabase/     # Supabase client
services/         # API service layer
constants/        # Theme, config
```

## Admin App (apps/admin/)

- **Framework**: Next.js 14.2 (React 18 compatibility), TypeScript
- **Styling**: CSS Modules
- **Auth**: `@supabase/ssr` with cookie-based sessions
- **Client Architecture**:
  - Browser client: publishable key + RLS (normal operations)
  - Server client: cookie forwarding (user's RLS context)
  - Admin client: service-role key (server-only, explicit privileged ops)

## Supabase Backend

### PostgreSQL
- 9 tables with proper foreign keys and constraints
- CHECK constraints for data integrity
- Indexes on common query patterns
- Sequence for human-readable order IDs (AK-YYYY-NNNNNN)

### Authentication
- Email + password via Supabase Auth
- Profile auto-created on signup (always `role = customer`)
- Supplier/admin accounts provisioned by admin

### Row Level Security (Hardened)
- **All tables have RLS enabled**
- **Orders**: SELECT only — no direct client INSERT/UPDATE/DELETE
- **Order items**: SELECT only — created by `place_order()` RPC
- **Supplier capacity**: SELECT for all, direct writes admin-only. Suppliers use `set_supplier_capacity()` RPC
- **Protected fields**: Suppliers cannot change `is_active` or `profile_id`; users cannot change `role`
- **No anonymous access**: All read policies require `auth.uid() IS NOT NULL`

### Business Functions (SECURITY DEFINER)
All critical operations are transactional PostgreSQL functions:

| Function | Purpose | Capacity Effect |
|---|---|---|
| `place_order()` | Create order, validate everything | None |
| `accept_order()` | Accept + reserve capacity (FOR UPDATE) | +reserved |
| `reject_order()` | Reject with reason | None |
| `update_order_status()` | Advance status with transition rules | Cancel: -reserved; Deliver: reserved→fulfilled |
| `admin_reassign_order()` | Reassign placed orders only | None |
| `set_supplier_capacity()` | Supplier sets max_capacity only | Sets max (validates ≥ committed) |
| `update_supplier_profile()` | Supplier edits allowed fields only | None |
| `get_available_suppliers()` | Discovery with Haversine distance | None (read-only) |

### Realtime
- Enabled on `orders` table via `supabase_realtime` publication
- Customers subscribe to active order status changes
- Subscriptions cleaned up on screen unmount

## Shared Packages (packages/)

| Package | Purpose |
|---|---|
| `@aquakart/config` | Constants (statuses, roles, payment methods), transition rules |
| `@aquakart/types` | TypeScript interfaces for all database entities |
| `@aquakart/validation` | Zod schemas, capacity calculation functions |

## Capacity Model

```
available = max_capacity - reserved_quantity - fulfilled_quantity

Events:
  Order placed     → no change
  Order accepted   → reserved += quantity
  Order rejected   → no change
  Order cancelled  → reserved -= quantity (if was accepted/preparing)
  Order delivered   → reserved -= quantity, fulfilled += quantity

Constraint: reserved + fulfilled <= max_capacity (enforced at DB level)
Concurrency: SELECT FOR UPDATE on capacity row during accept_order()
```

## Security Architecture

1. **No secrets in client code** — publishable key only in mobile/admin browser
2. **Service-role key isolated** — server-only `lib/supabase/admin.ts`, documented usage
3. **Role hardcoded at signup** — trigger always creates `customer`, ignores metadata
4. **RPC-only mutations** — orders, order_items, capacity system fields
5. **Auth required everywhere** — no anonymous read/write access
6. **Transition validation** — database functions enforce allowed status changes

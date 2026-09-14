# AquaKart 2.0

> Local Water Supply Network Platform — Bokaro Steel City & Chas, Jharkhand, India

## What is AquaKart?

AquaKart connects local water suppliers with customers who need reliable water delivery. Customers discover nearby suppliers, place orders, and track delivery status. Suppliers manage orders, capacity, and availability digitally.

## Architecture

```
┌──────────────┐    ┌──────────────┐    ┌─────────────────┐
│  Mobile App  │    │  Admin App   │    │    Supabase      │
│  (Expo/RN)   │───▶│  (Next.js)   │───▶│  (PostgreSQL)    │
│  Customer +  │    │  Dashboard   │    │  Auth + RLS      │
│  Supplier    │    │              │    │  Realtime        │
└──────────────┘    └──────────────┘    └─────────────────┘
```

### Monorepo Structure

```
aquakart-2/
├── apps/
│   ├── mobile/          # Expo + React Native + TypeScript
│   └── admin/           # Next.js 14 + TypeScript
├── packages/
│   ├── types/           # Shared TypeScript types
│   ├── validation/      # Zod schemas + business logic
│   └── config/          # Constants + status transitions
├── supabase/
│   └── migrations/      # PostgreSQL migrations (001-012)
├── docs/                # Documentation
└── .env.example         # Environment variable template
```

## Quick Start

### Prerequisites

- Node.js >= 18.18
- npm
- A [Supabase](https://supabase.com) project (free tier)
- Expo Go app (for mobile testing)

### Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd aquakart-2
npm install

# 2. Configure environment
cp .env.example .env
# Fill in your Supabase URL and keys

# 3. Apply database migrations
# Run each file in supabase/migrations/ in order via Supabase SQL editor

# 4. Run mobile app
cd apps/mobile
npx expo start

# 5. Run admin dashboard (separate terminal)
cd apps/admin
npm run dev
```

See [docs/setup.md](docs/setup.md) for detailed instructions.

## Environment Variables

| Variable | Used By | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Mobile | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Mobile | Supabase anon/publishable key |
| `NEXT_PUBLIC_SUPABASE_URL` | Admin | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Admin | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin (server only) | Service role key — **NEVER** expose to client |

## Development Commands

| Command | Description |
|---|---|
| `npm run mobile` | Start Expo dev server |
| `npm run admin` | Start Next.js dev server |
| `npm run typecheck` | TypeScript check all workspaces |
| `npm test` | Run tests in all workspaces |

## Database

13 migrations in `supabase/migrations/`:

1. **profiles** — User profiles linked to Supabase Auth
2. **suppliers** — Supplier business information
3. **products** — Product catalog (V1: 20L Water Jar)
4. **supplier_products** — Supplier-specific pricing
5. **supplier_capacity** — Daily capacity tracking (max / reserved / fulfilled)
6. **addresses** — Customer delivery addresses
7. **orders** — Order records with status tracking
8. **order_items** — Line items per order
9. **order_status_history** — Audit trail of status changes
10. **rls** — Row Level Security policies (hardened)
11. **functions** — Business logic RPCs (place_order, accept_order, etc.)
12. **seed** — Development seed data
13. **supplier_updates** — Capacity crossover fix and supplier product RPC

### Security

- **RLS on all tables** — no public write access
- **Order mutations via RPCs only** — no direct client writes to orders
- **Capacity fields system-controlled** — reserved/fulfilled modified only by transactional functions
- **Role assignment hardcoded** — signup always creates `customer` role
- **Service-role key isolated** — server-only, never in client bundles

## V1 Scope

### Included
- Customer registration & login
- Address management
- Supplier discovery (active, accepting, with capacity)
- Order placement, tracking, and history
- Supplier order management (accept/reject/status updates)
- Supplier capacity management
- Admin dashboard with metrics
- Admin supplier/customer/order management
- Manual order reassignment (placed orders only)
- Realtime order status updates

### Not Included (Future)
- Online payment gateway
- Live GPS tracking
- AI/chatbot features
- Subscriptions
- Delivery agent management
- Route optimization

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native, Expo SDK 52, Expo Router, TypeScript |
| Admin | Next.js 14, TypeScript, CSS Modules |
| Backend | Supabase (PostgreSQL, Auth, RLS, Realtime) |
| Validation | Zod |
| Monorepo | npm workspaces |

## License

Private — All rights reserved.

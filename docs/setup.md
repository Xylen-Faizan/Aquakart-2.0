# AquaKart 2.0 — Setup Guide

This guide covers setting up the AquaKart 2.0 monorepo for local development.

## Prerequisites

- Node.js (v18.18 or newer recommended)
- npm (v9+)
- Expo CLI (`npm install -g expo-cli`)
- A Supabase account (free tier is sufficient)
- Expo Go app on your physical device (or iOS Simulator / Android Emulator)

## 1. Supabase Local Development (Recommended)

AquaKart 2.0 uses the Supabase CLI for local database development, testing, and migrations.

1. Ensure Docker Desktop is installed and running.
2. Initialize and start the local Supabase instance:
   ```bash
   npx supabase start
   ```
3. Run database tests to ensure everything is correct:
   ```bash
   npx supabase test db
   ```
4. The local Supabase dashboard will be available (usually at http://127.0.0.1:54323).
5. The `.env.example` file is pre-configured with the default local Supabase credentials.

Alternatively, for a hosted Supabase project, run `npx supabase link --project-ref your-ref` and `npx supabase db push`.

## 2. Local Environment Setup

1. Clone the repository and navigate to the root directory.
2. Install all monorepo dependencies:
   ```bash
   npm install
   ```
3. Copy the `.env.example` file to `.env` in the root folder:
   ```bash
   cp .env.example .env
   ```
4. Fill in the `.env` file with your Supabase credentials:
   ```env
   # Mobile App (Expo)
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key

   # Admin App (Next.js)
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

## 3. Running the Applications

The project uses npm workspaces. You can run the apps from their respective directories.

### Admin Dashboard (Next.js)

```bash
cd apps/admin
npm run dev
```
The admin panel will be available at `http://localhost:3000`.

### Mobile App (Expo)

In a new terminal window:
```bash
cd apps/mobile
npm run dev
# or: npx expo start
```
Use the Expo Go app on your phone to scan the QR code, or press 'i' for iOS simulator / 'a' for Android emulator.

## 4. Seeding Demo Users

By default, any user who signs up via the app is given the `customer` role. To test supplier and admin workflows, you need to manually provision users in your Supabase database.

### Creating an Admin User
1. Sign up a new user via the mobile app or admin login page (e.g., `admin@aquakart.local`).
2. Go to the Supabase SQL Editor and run:
   ```sql
   UPDATE public.profiles
   SET role = 'admin'
   WHERE email = 'admin@aquakart.local';
   ```

### Creating a Supplier User
1. Sign up a new user via the mobile app (e.g., `supplier@aquakart.local`).
2. Go to the Supabase SQL Editor and run:
   ```sql
   -- Set role
   UPDATE public.profiles
   SET role = 'supplier'
   WHERE email = 'supplier@aquakart.local';

   -- Create supplier record
   INSERT INTO public.suppliers (profile_id, business_name, latitude, longitude, is_active, is_accepting_orders)
   SELECT id, 'Demo Water Co.', 23.6693, 86.1511, true, true
   FROM public.profiles WHERE email = 'supplier@aquakart.local';

   -- Link product and set price
   INSERT INTO public.supplier_products (supplier_id, product_id, price, available)
   SELECT s.id, '00000000-0000-0000-0000-000000000001', 40.00, true
   FROM public.suppliers s
   JOIN public.profiles p ON p.id = s.profile_id
   WHERE p.email = 'supplier@aquakart.local';
   ```

After provisioning, the supplier can log into the app, set their daily capacity, and begin receiving orders.

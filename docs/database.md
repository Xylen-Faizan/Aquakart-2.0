# AquaKart 2.0 — Database Design

This document details the Supabase PostgreSQL database schema, RLS policies, and core functions for AquaKart 2.0.

## Schema Overview

The database is built on a relational model prioritizing data integrity, with strict checks and trigger-based constraints.

### 1. `profiles`
Extends `auth.users` with application-specific user data.
- **`id`**: UUID (Primary Key, references `auth.users.id`)
- **`name`**: Text
- **`email`**: Text
- **`phone`**: Text
- **`role`**: Text (Constraint: 'customer', 'supplier', 'admin')

*Security Note*: `role` is hardcoded to 'customer' upon signup via the `handle_new_user()` trigger. Admin escalation is a manual DB operation to prevent privilege escalation via client metadata spoofing.

### 2. `suppliers`
Supplier business details, tied 1:1 to a profile.
- **`id`**: UUID (Primary Key)
- **`profile_id`**: UUID (Unique, references `profiles.id`)
- **`business_name`**: Text
- **`latitude` / `longitude`**: Double Precision (for discovery)
- **`is_active`**: Boolean (Admin controls access)
- **`is_accepting_orders`**: Boolean (Supplier toggle for temporary pausing)

### 3. `products` & `supplier_products`
Centralized product catalog with supplier-specific pricing and availability.
- **`products`**: `id`, `name`, `unit` (e.g., 'jar').
- **`supplier_products`**: Maps suppliers to products with custom `price` and `available` toggle.

### 4. `supplier_capacity`
Tracks daily capacity to prevent supplier overload.
- **`id`**: UUID (Primary Key)
- **`supplier_id`**: UUID (references `suppliers.id`)
- **`date`**: Date
- **`max_capacity`**: Integer (Maximum orders supplier can handle today)
- **`reserved_quantity`**: Integer (Accepted orders, awaiting delivery)
- **`fulfilled_quantity`**: Integer (Delivered orders)

*Constraint*: `reserved_quantity + fulfilled_quantity <= max_capacity` is enforced at the database level.
*View*: `supplier_capacity_view` provides a computed `available_quantity`.

### 5. `addresses`
Customer delivery addresses with coordinates.

### 6. `orders` & `order_items`
Core transactional records.
- **`orders`**: Contains aggregate totals, status (`placed`, `accepted`, `rejected`, `preparing`, `out_for_delivery`, `delivered`, `cancelled`), and relationships (customer, supplier, address).
- **`order_items`**: Line items for the order.

### 7. `order_status_history`
Audit trail of status changes, tracking who made the change (`changed_by`) and when.

## Row Level Security (RLS)

AquaKart 2.0 employs a strict "deny-by-default" RLS model, augmented by Security Definer RPCs for mutations.

- **No direct client writes to `orders`, `order_items`, `order_status_history`, or `supplier_capacity`.**
- **Profiles**: Users can read/update their own profile. Only admins can change roles.
- **Suppliers**: Anyone authenticated can read active suppliers. Suppliers can edit non-critical fields (name, location, accepting orders). Admins control `is_active`.
- **Products**: Read-only for all authenticated users. Admin writes.

## RPCs (Remote Procedure Calls)

All critical mutations go through these PostgreSQL functions, running with elevated privileges (`SECURITY DEFINER`), ensuring complex validations are met atomically.

1.  **`place_order(...)`**
    - Validates supplier is active and accepting orders.
    - Validates product availability and pricing.
    - Creates `orders`, `order_items`, and initial `order_status_history`.
    - *Does not reserve capacity yet.*
2.  **`accept_order(p_order_id)`**
    - Verifies caller is the assigned supplier (or admin).
    - Checks order status is 'placed'.
    - Performs `SELECT FOR UPDATE` on `supplier_capacity` to prevent race conditions.
    - Validates sufficient available capacity.
    - Increments `reserved_quantity` and updates status to 'accepted'.
3.  **`reject_order(p_order_id, p_reason)`**
    - Verifies caller is supplier/admin and order is 'placed'.
    - Updates status and logs `rejection_reason`.
4.  **`update_order_status(p_order_id, p_new_status)`**
    - Enforces valid state machine transitions (e.g., 'accepted' -> 'preparing' -> 'out_for_delivery' -> 'delivered').
    - Handles capacity adjustments on cancellation (releases `reserved_quantity`) and delivery (moves from `reserved` to `fulfilled`).
5.  **`admin_reassign_order(p_order_id, p_new_supplier_id)`**
    - Allows admin to reroute a 'placed' order to a new supplier.
6.  **`set_supplier_capacity(p_date, p_max_capacity)`**
    - Upserts daily capacity. Validates new `max_capacity` isn't lower than already committed orders (`reserved + fulfilled`).
7.  **`get_available_suppliers(p_latitude, p_longitude)`**
    - Search endpoint. Filters for active, accepting suppliers with >0 `available_capacity`. Calculates Haversine distance.

# AquaKart 2.0 — Testing Strategy

This document outlines the testing approach for the AquaKart 2.0 monorepo. The focus for V1 is on high-value business logic and security validations.

## 1. Business Logic Testing (Jest)

The core business rules are extracted into pure functions in the `@aquakart/validation` and `@aquakart/config` packages. This allows for fast, reliable unit testing without requiring a database connection or UI rendering.

**Location**: `packages/validation/__tests__/`

### Coverage Areas
- **Capacity Calculations**: Ensuring `available_capacity` never drops below zero and correctly accounts for reserved and fulfilled quantities.
- **Order Acceptance Rules**: Validating edge cases around order quantity vs. available capacity.
- **State Machine Transitions**: Ensuring orders can only follow allowed status paths (e.g., a 'delivered' order cannot go back to 'preparing').

**Command to Run**:
```bash
npm test -w @aquakart/validation
```

## 2. Type Checking

TypeScript is the first line of defense. The monorepo uses strict TypeScript configurations across all workspaces.

**Command to Run**:
```bash
# From root directory
npm run typecheck --workspaces --if-present
```

## 3. Database & Security Testing (pgTAP)

Because RLS and RPCs handle critical security and transactional integrity, these must be verified against a live database instance. We use pgTAP via Supabase CLI for this.

**Location**: `supabase/tests/`

### Test Suites
- **01_orders.sql**: Order state machine and validation
- **02_security.sql**: User roles and escalation prevention
- **03_capacity.sql**: Concurrency and capacity locking
- **04_supplier_profile.sql**: Supplier profile and product updates (RLS and RPCs)
- **05_capacity_midnight.sql**: Order capacity adjustments crossing midnight boundaries

**Command to Run**:
```bash
npx supabase test db
```

## 4. End-to-End (E2E) UI Testing (Future Phase)

E2E testing is not prioritized for the MVP scaffold but is recommended before production rollout.

- **Mobile App**: Detox or Maestro for critical paths (Registration -> Discovery -> Order Placement).
- **Admin App**: Playwright for validating dashboard metrics and order reassignment flows.

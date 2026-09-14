# AquaKart 2.0 — Product Overview

## What is AquaKart?

AquaKart is a local water supply network platform that connects water suppliers with customers in Bokaro Steel City and Chas, Jharkhand, India.

## Who does it serve?

### Customers
People who need reliable water delivery. They can discover nearby suppliers, see prices and availability, place orders, and track delivery status.

### Suppliers
Local water suppliers who want to receive new customers and manage orders digitally while maintaining control over what orders they accept.

### AquaKart (Platform)
Builds the digital network connecting local water suppliers and customers, accumulating operational data for future intelligence.

## V1 Scope

The MVP validates this core workflow:

1. Customer creates account
2. Customer adds delivery address
3. Customer discovers nearby suppliers
4. Customer sees supplier/product/price/availability
5. Customer places an order
6. Supplier receives order
7. Supplier accepts or rejects
8. Supplier updates order status
9. Customer sees status updates in realtime
10. Supplier completes delivery
11. Order becomes completed
12. Customer can reorder

### Payment (V1)
- Cash or UPI (directly to supplier)
- AquaKart does not process payments in V1

### Location (V1)
- Haversine distance on stored coordinates
- No external map/geocoding API required
- Location/geocoding abstracted for future provider integration

## Future Roadmap

### Phase 2 — Supplier Network
- Automatic supplier fallback/matching
- Capacity sharing between suppliers
- Supplier-to-supplier order transfer

### Phase 3 — Operations
- Delivery agents
- Route optimization
- Live GPS tracking
- Jar inventory and lifecycle tracking

### Phase 4 — Intelligence
- Demand forecasting
- Supplier performance analytics
- Supply/demand heatmaps
- Customer retention analysis

### Phase 5 — Expansion
- Subscriptions and scheduled delivery
- WhatsApp/voice ordering
- B2B (offices, hostels, restaurants)
- Multi-city expansion
- Online payment gateway

## Product Principle

AquaKart V1 is NOT "Blinkit for water." The long-term product is a Local Water Supply Network + Supplier Operating System + Demand/Capacity Intelligence Platform. V1 remains intentionally simple.

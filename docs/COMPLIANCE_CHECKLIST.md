# AquaKart Compliance & Launch Checklist

This document tracks the compliance, legal, security, and product-integrity requirements for launching AquaKart on the Google Play Store.

## Status Summary

| Workstream | Status | Details |
|---|---|---|
| WS1: In-App Account Deletion | **COMPLETE** | In-app screen, DB function, 30-day grace period, financial retention |
| WS2: Background Location Disclosure | **COMPLETE** | Prominent disclosure modal shown before Android system permission |
| WS3: Legal Consent Capture | **COMPLETE** | Checkbox on registration, links on auth screens, DB logging |
| WS4: Security Hardening | **COMPLETE** | Removed Firebase admin SDK, rotated keys, fixed package name |
| WS5: Notification Privacy | **COMPLETE** | No PII in lock-screen notifications (verified generic text) |
| WS6: Form Validation | **COMPLETE** | Zod schemas hardened with `.max()` length constraints |
| WS7: Compliance Documentation | **COMPLETE** | Asset register updated, generic images used |

## Pending Business / Operational Tasks (Owner: Business)

- [ ] Provide legal entity name, address, and grievance officer details for web/app configs
- [ ] Ensure `aquakart.in` domain is active and hosting legal policies
- [ ] Configure `support@aquakart.in` email inbox
- [ ] Submit Data Safety form in Play Console
- [ ] Submit Background Location declaration (with video) in Play Console
- [ ] Complete 14-day closed testing with 12+ testers
- [ ] Restrict Google Maps API key to Android package + production SHA-1 in Google Cloud
- [ ] Enroll in Play App Signing

*Note: The unverified branded product images (Bisleri, etc.) have been permanently removed from the database via migration 100 to ensure intellectual property compliance.*

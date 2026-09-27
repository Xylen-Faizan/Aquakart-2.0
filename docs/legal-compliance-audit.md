# AquaKart Legal / Privacy Release Audit

Audit date: 25 September 2026
Legal version: 2026-09-25-v1

## Reviewed
The repository contains an Expo/React Native mobile application and a Next.js administrative web dashboard. No separate public marketing-site application was found in this repository.

## Implemented
- Public Privacy Policy, Terms of Service, Cookie Policy, and Refund & Cancellation pages.
- In-app Legal & Privacy screen.
- Explicit Terms/Privacy acknowledgement before customer email/Google signup.
- Versioned consent records in Supabase.
- Necessary-cookie-only position for the current web implementation.
- No first-party analytics SDK or advertising pixel found in the reviewed dependency/code paths.
- Accessibility improvements: skip link, visible focus styles, labelled controls, keyboard-friendly login fields, and image accessibility labels.
- Removed the hard-coded 4.8 supplier rating and unsupported “verified partner” wording.
- Replaced “Fresh & Pure Water” marketing wording with neutral delivery wording.

## Risks that remain
1. The exact registered legal entity name, registered office address, GSTIN/CIN and named grievance officer are not established by this repository. These must be supplied from official business records before full commercial launch.
2. Branded product images for Bisleri, Aquafina, Kinley and Aquacia are present. The repository does not document image licences. Use owned, supplier-authorised, or commercially licensed images.
3. Google Maps, Google OAuth, Supabase and Expo are third-party services. Confirm their current contracts/privacy terms and reflect any material data processing accurately.
4. Mobile authentication state is persisted with AsyncStorage. Review protected credential storage for production.
5. Keep Google Maps API restrictions tied to the Android package and signing certificate; an EAS environment variable does not make a mobile API key secret.
6. Verify supplier/product disclosures and applicable packaged-water/product licences before commercial launch.
7. Run a real refund/complaint operational process; a policy alone is not a functioning redress mechanism.
8. Any future analytics, advertising, personalisation or marketing cookies should be blocked until the required consent choice is obtained and the Cookie/Privacy Policies are updated.
9. A separate public website, if hosted outside this repository, must receive the same legal, tracking, accessibility, claims and image-licensing review.

## Important
This document is an engineering compliance audit, not legal advice or a guarantee against claims. Indian counsel should review the final entity details, supplier model, payment flow and consumer terms before full commercial launch.

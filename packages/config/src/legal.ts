export const LEGAL_VERSION = "2026-09-25-v1";
export const LEGAL_EFFECTIVE_DATE = "25 September 2026";

export const BUSINESS_DETAILS = {
  displayName: "AquaKart 2.0",
  serviceArea: "Bokaro Steel City & Chas, Jharkhand, India",
  supportEmail: "",
  supportPhone: "+91 74888 30394",
};

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocumentData = {
  title: string;
  summary: string;
  sections: LegalSection[];
};

export const LEGAL_DOCUMENTS: Record<"privacy" | "terms" | "cookies" | "refunds", LegalDocumentData> = {
  privacy: {
    title: "Privacy Policy",
    summary:
      "How AquaKart 2.0 collects, uses, shares, stores, and protects personal data for water ordering and delivery services.",
    sections: [
      {
        heading: "1. Who this policy covers",
        paragraphs: [
          "This policy applies to AquaKart 2.0 customer, supplier, driver, helper, and administrative experiences, including the mobile application and web dashboard operated for AquaKart.",
          "Service area: Bokaro Steel City & Chas, Jharkhand, India.",
        ],
      },
      {
        heading: "2. Data we collect",
        bullets: [
          "Account data: name, email address and/or mobile number, authentication identifiers, and account role.",
          "Delivery data: saved delivery address, sector/area details, and address coordinates when coordinates are available or needed to locate a delivery.",
          "Order and account history: products, quantities, prices, order status, delivery records, payment method and amount actually collected, jar/accounting records, and support communications.",
          "Operational data: device platform, push-notification token, timestamps, security/audit logs, and limited technical information needed to keep the service secure and reliable.",
          "Optional profile information is only collected when you choose to provide it.",
        ],
      },
      {
        heading: "3. Data minimisation",
        paragraphs: [
          "AquaKart is designed to collect only information reasonably needed to provide the requested service, deliver orders, maintain supplier/customer records, process payments or payment records, send operational notifications, prevent abuse, and meet legal obligations.",
          "We do not ask for identity documents, contacts, microphone access, camera access, or continuous location unless a feature specifically requires it. Background location in the driver workflow is active only while an operational delivery run is being tracked.",
        ],
      },
      {
        heading: "4. Why we use personal data",
        bullets: [
          "To create and secure accounts.",
          "To match customers with water suppliers and vehicles for delivery.",
          "To provide delivery tracking, route operations, arrival notifications, and customer support.",
          "To maintain order, inventory, jar, payment, and Khata records.",
          "To detect abuse, protect the platform, troubleshoot incidents, and comply with applicable law.",
        ],
      },
      {
        heading: "5. Sharing and service providers",
        paragraphs: [
          "We share only the information reasonably necessary for the requested service. For example, a supplier or assigned delivery crew may receive the customer name, contact details, delivery address/area, order details, and operational location information needed to complete a delivery.",
          "The current implementation uses Supabase for authentication/database/realtime infrastructure, Expo services for push notifications, and Google services for Google sign-in and maps. These providers may process information on AquaKart's behalf under their own terms and privacy policies.",
          "We do not use the current codebase to sell personal data or to run targeted advertising based on customer data.",
        ],
      },
      {
        heading: "6. Analytics and tracking",
        paragraphs: [
          "The current repository does not include a first-party analytics SDK or advertising pixel such as Google Analytics, Meta Pixel, Mixpanel, Amplitude, or PostHog. We therefore do not currently operate non-essential analytics cookies.",
          "Operational telemetry such as delivery GPS, server logs, push tokens, and error logs is different from advertising analytics and is used for service operation and security.",
        ],
      },
      {
        heading: "7. Cookies and third-party resources",
        paragraphs: [
          "The web dashboard may use strictly necessary authentication cookies through Supabase SSR so that authenticated sessions work. The mobile application persists its authentication session in app storage rather than browser cookies.",
          "The web dashboard includes Google Maps on network map screens. Google may process information and use its own technical storage or cookies when its services are loaded; this is disclosed as a third-party service rather than AquaKart advertising.",
        ],
      },
      {
        heading: "8. Retention",
        paragraphs: [
          "We retain personal data only for as long as reasonably necessary for account operation, delivery and transaction records, fraud and security investigations, customer support, dispute resolution, backups, and legal or accounting requirements. When data is no longer required, it should be deleted or anonymised subject to legitimate retention requirements.",
        ],
      },
      {
        heading: "9. Your choices and rights",
        paragraphs: [
          "You may request access to information about your personal data, correction of inaccurate data, deletion where legally appropriate, and withdrawal of consent where processing is based on consent. Withdrawal does not make prior lawful processing unlawful.",
          "You can make a privacy request using the support contact below. We will verify the requester's account before disclosing or changing personal data.",
        ],
      },
      {
        heading: "10. Children",
        paragraphs: [
          "AquaKart is intended for people who are 18 years of age or older. Please do not create or use an account if you are under 18. If we learn that a child has provided personal data in violation of this policy, we will take reasonable steps to address it.",
        ],
      },
      {
        heading: "11. Security",
        paragraphs: [
          "We use access controls, database row-level security, authentication, encrypted network connections, and audit records as part of the current platform design. No internet service can guarantee absolute security, so users should protect their credentials and devices.",
        ],
      },
      {
        heading: "12. Complaints and privacy requests",
        paragraphs: [
          "Privacy requests and complaints can be sent to mukulkumarofficially@gmail.com or +91 74888 30394 with the subject line “Privacy Request”. Please include enough information for us to identify the relevant account without sending passwords, OTPs, or authentication tokens.",
          "Grievance contact: AquaKart Grievance Desk via the same contact details. A named legal grievance officer should be formally appointed and added before full commercial launch.",
        ],
      },
      {
        heading: "13. India DPDP readiness",
        paragraphs: [
          "This policy is drafted to support readiness for the Digital Personal Data Protection Act, 2023 and Digital Personal Data Protection Rules, 2025. The Government has provided a phased commencement timeline, so individual statutory provisions become operative on the dates notified by the Central Government. AquaKart is adopting the notice, consent, minimisation, security, rights, and grievance principles in advance of the full applicable regime.",
        ],
      },
      {
        heading: "14. Changes",
        paragraphs: [
          "We may update this policy when our services, processing activities, or applicable law change. The effective date and version at the top of this policy will be updated when material changes are made.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    summary:
      "Rules for using AquaKart 2.0 to discover suppliers, place water orders, manage supplier operations, and receive delivery services.",
    sections: [
      {
        heading: "1. Acceptance",
        paragraphs: [
          "By creating an account or using AquaKart, you agree to these Terms of Service and the Privacy Policy. If you do not agree, do not use the service.",
        ],
      },
      {
        heading: "2. Eligibility and accounts",
        bullets: [
          "You must be at least 18 years old.",
          "Provide accurate information needed for account, delivery, and support operations.",
          "Keep authentication credentials and one-time passwords confidential.",
          "You are responsible for activity performed through your account unless caused by AquaKart's security failure.",
        ],
      },
      {
        heading: "3. What AquaKart does",
        paragraphs: [
          "AquaKart provides software that helps customers discover water suppliers, place orders, and receive delivery updates. Suppliers and their delivery teams perform the underlying supply and delivery activities.",
          "AquaKart does not manufacture bottled water or water jars. Where a supplier or brand is identified, the supplier/brand remains responsible for the product, packaging, required licences, and legally required product information to the extent applicable.",
        ],
      },
      {
        heading: "4. Products, pricing, and availability",
        paragraphs: [
          "Displayed prices, stock, supplier availability, delivery estimates, and supplier details may change. An order is accepted only when the system or supplier confirms it. AquaKart may correct obvious display errors.",
        ],
      },
      {
        heading: "5. Delivery",
        paragraphs: [
          "Delivery timing is an estimate and can be affected by traffic, supplier capacity, vehicle availability, weather, customer availability, network conditions, and other operational factors.",
          "Customers should provide an accurate delivery address and be reasonably available to receive the order.",
        ],
      },
      {
        heading: "6. Payments and records",
        paragraphs: [
          "The available payment methods are shown in the app. A selected payment method is not itself proof that payment has been completed. For supplier-collected payments, the amount recorded as actually collected is the amount used for the payment record and Khata.",
        ],
      },
      {
        heading: "7. Customer conduct",
        bullets: [
          "Do not use AquaKart for unlawful activity, fraud, harassment, abuse, or attempts to access another user's account.",
          "Do not interfere with delivery staff, vehicle tracking, database security, or service availability.",
          "Do not submit false reviews, false complaints, or misleading supplier information.",
        ],
      },
      {
        heading: "8. Supplier and crew obligations",
        paragraphs: [
          "Suppliers are responsible for maintaining accurate business details, pricing, product availability, lawful operation, safe delivery practices, and appropriate personnel/vehicle permissions. Supplier access may be suspended where required for security, compliance, fraud prevention, or material misuse.",
        ],
      },
      {
        heading: "9. Intellectual property",
        paragraphs: [
          "AquaKart software, branding, original copy, and original design elements are owned by or licensed to AquaKart unless otherwise stated. Third-party brand names, product names, trademarks, and images belong to their respective owners. Use of a third-party brand in the catalog does not by itself imply endorsement or affiliation.",
        ],
      },
      {
        heading: "10. Disclaimer and liability",
        paragraphs: [
          "AquaKart provides software and coordination services on an “as available” basis. We do not promise uninterrupted service, exact delivery times, or that every supplier or product will always be available.",
          "Nothing in these Terms excludes or limits liability that cannot lawfully be excluded under applicable Indian law. Consumer rights provided by applicable law remain unaffected.",
        ],
      },
      {
        heading: "11. Suspension and termination",
        paragraphs: [
          "We may suspend or terminate accounts where necessary for security, fraud prevention, legal compliance, serious misuse, or material breach of these Terms. Customers may stop using the service and may request account deletion through support.",
        ],
      },
      {
        heading: "12. Governing law",
        paragraphs: [
          "These Terms are governed by applicable laws of India. Consumer protections and mandatory rights available under applicable Indian law continue to apply.",
        ],
      },
      {
        heading: "13. Contact",
        paragraphs: [
          "AquaKart 2.0 support: mukulkumarofficially@gmail.com and +91 74888 30394. Service area: Bokaro Steel City & Chas, Jharkhand, India.",
        ],
      },
    ],
  },
  cookies: {
    title: "Cookie Policy",
    summary:
      "What cookies and similar technical storage AquaKart currently uses on its web dashboard and mobile app.",
    sections: [
      {
        heading: "1. Current cookie status",
        paragraphs: [
          "The current AquaKart web code uses strictly necessary authentication cookies through Supabase SSR for login/session handling. The mobile app uses app storage for its Supabase session and does not rely on browser cookies.",
          "The current repository does not include non-essential analytics or advertising pixels/SDKs. Because there are currently no non-essential cookies that require a consent choice in the web application, AquaKart does not display a cookie-consent banner at this time.",
        ],
      },
      {
        heading: "2. Necessary cookies",
        bullets: [
          "Authentication/session cookies: used only to keep an authorised admin web session working.",
          "Security-related technical state: may be used to maintain secure session behaviour and protect the service.",
        ],
      },
      {
        heading: "3. Third-party services",
        paragraphs: [
          "Google Maps is loaded on the authenticated network-map pages. Google may use technical storage/cookies and collect technical information according to Google's own policies.",
          "Supabase provides authentication, database, and realtime infrastructure. Expo services support mobile notifications. Google OAuth may be used for customer sign-in.",
        ],
      },
      {
        heading: "4. Future analytics",
        paragraphs: [
          "If AquaKart adds analytics, advertising, marketing pixels, or other non-essential tracking, those technologies should be disabled until the relevant consent choice has been collected, and this policy should be updated to identify the provider, purpose, data, retention, and controls.",
        ],
      },
      {
        heading: "5. Contact",
        paragraphs: [
          "Questions about cookies or privacy: mukulkumarofficially@gmail.com or +91 74888 30394.",
        ],
      },
    ],
  },
  refunds: {
    title: "Refund & Cancellation Policy",
    summary:
      "How AquaKart handles cancellations, failed deliveries, duplicate payments, and verified order problems.",
    sections: [
      {
        heading: "1. Cancellation",
        paragraphs: [
          "A customer may cancel an order through the available in-app cancellation option while the order is still cancellable. Once a supplier or delivery vehicle has committed to fulfilment, cancellation may no longer be available through the app; contact support promptly for assistance.",
        ],
      },
      {
        heading: "2. Situations that may qualify for a refund or credit",
        bullets: [
          "An order was paid for but was not delivered.",
          "A customer was charged twice for the same order.",
          "The delivered item or quantity materially differs from the confirmed order.",
          "A container or product arrives damaged, leaking, contaminated, or otherwise unsafe.",
          "Another verified service failure makes a refund or credit appropriate under applicable law.",
        ],
      },
      {
        heading: "3. Consumable goods",
        paragraphs: [
          "Water is a consumable product. For hygiene and safety reasons, successful deliveries that have already been accepted by the customer are generally not returnable merely because the customer changed their mind. This does not limit statutory consumer rights or refunds for defective, unsafe, incorrect, or non-delivered goods.",
        ],
      },
      {
        heading: "4. Reporting a problem",
        paragraphs: [
          "Please contact AquaKart as soon as reasonably possible after discovering a problem, ideally within 24 hours, with the order number and a short description. Photos may be requested only when reasonably necessary to verify damage or product condition.",
        ],
      },
      {
        heading: "5. How refunds are processed",
        paragraphs: [
          "Where a refund is approved, it will normally be returned through the same payment channel where practicable. For cash-on-delivery or supplier-collected transactions, AquaKart or the relevant supplier may use an agreed refund method. Banking/payment-provider processing times can vary.",
        ],
      },
      {
        heading: "6. Empty jars and reusable containers",
        paragraphs: [
          "An empty-jar return is an operational inventory event and is not automatically a monetary refund. Jar balances, deposits, or other supplier-specific container arrangements remain subject to the applicable supplier terms and the records shown in the app.",
        ],
      },
      {
        heading: "7. Supplier/platform role",
        paragraphs: [
          "AquaKart coordinates order information and support. Where the supplier is the seller of the water product, refund investigations may involve the supplier. Mandatory consumer rights remain unaffected.",
        ],
      },
      {
        heading: "8. Contact",
        paragraphs: [
          "Refunds and cancellation support: mukulkumarofficially@gmail.com or +91 74888 30394.",
        ],
      },
    ],
  },
};

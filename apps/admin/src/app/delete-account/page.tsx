import Link from "next/link";
import { BUSINESS_DETAILS } from "@aquakart/config";
import styles from "../components/legal.module.css";

export const metadata = {
  title: "Delete AquaKart Account",
  description: "Request deletion of your AquaKart account and personal data.",
};

export default function DeleteAccountPage() {
  return (
    <main id="main-content" className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <Link href="/login" className={styles.brand}>AquaKart 2.0</Link>
            <p className={styles.kicker}>Account & Privacy</p>
          </div>
          <nav className={styles.nav} aria-label="Account and legal navigation">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href="/refunds">Refunds</Link>
          </nav>
        </header>

        <article className={styles.card}>
          <p className={styles.eyebrow}>Account deletion</p>
          <h1>Delete your AquaKart account</h1>
          <p className={styles.summary}>
            You can request deletion of your AquaKart account and associated personal data.
          </p>

          <section className={styles.section}>
            <h2>How to request deletion</h2>
            <ol className={styles.ordered}>
              <li>Call AquaKart support at <a href={`tel:${BUSINESS_DETAILS.supportPhone.replace(/\s/g, "")}`}>{BUSINESS_DETAILS.supportPhone}</a>.</li>
              <li>Tell the support representative that you want your AquaKart account deleted.</li>
              <li>Complete the account-verification step requested by support. Never provide your password or OTP.</li>
            </ol>
          </section>

          <section className={styles.section}>
            <h2>What happens next</h2>
            <p>
              We will verify that the request is from the account holder and identify data that can be deleted.
              Some records may need to be retained where required for legal, accounting, fraud-prevention,
              security, dispute-resolution, or other legitimate retention requirements.
            </p>
          </section>

          <section className={styles.section}>
            <h2>Service area</h2>
            <p>{BUSINESS_DETAILS.serviceArea}</p>
          </section>

          <div className={styles.contact}>
            <strong>Deletion support:</strong>{" "}
            <a href={`tel:${BUSINESS_DETAILS.supportPhone.replace(/\s/g, "")}`}>{BUSINESS_DETAILS.supportPhone}</a>
          </div>
        </article>
      </div>
    </main>
  );
}

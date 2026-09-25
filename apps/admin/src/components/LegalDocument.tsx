import Link from "next/link";
import { BUSINESS_DETAILS, LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from "@aquakart/config";
import styles from "./legal.module.css";

type Props = {
  document: keyof typeof LEGAL_DOCUMENTS;
};

export default function LegalDocument({ document }: Props) {
  const data = LEGAL_DOCUMENTS[document];

  return (
    <main id="main-content" className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <Link href="/login" className={styles.brand}>AquaKart 2.0</Link>
            <p className={styles.kicker}>Legal & Privacy</p>
          </div>
          <nav className={styles.nav} aria-label="Legal navigation">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href="/refunds">Refunds</Link>
          </nav>
        </header>

        <article className={styles.card}>
          <p className={styles.eyebrow}>Version {LEGAL_VERSION} · Effective {LEGAL_EFFECTIVE_DATE}</p>
          <h1>{data.title}</h1>
          <p className={styles.summary}>{data.summary}</p>

          <section className={styles.business} aria-labelledby="business-details">
            <h2 id="business-details">Business details</h2>
            <p><strong>Operator name used in the service:</strong> {BUSINESS_DETAILS.displayName}</p>
            <p><strong>Service area:</strong> {BUSINESS_DETAILS.serviceArea}</p>
            <p><strong>Support:</strong> <a href={`mailto:${BUSINESS_DETAILS.supportEmail}`}>{BUSINESS_DETAILS.supportEmail}</a> · <a href={`tel:${BUSINESS_DETAILS.supportPhone.replace(/\s/g, "")}`}>{BUSINESS_DETAILS.supportPhone}</a></p>
          </section>

          {data.sections.map((section) => (
            <section key={section.heading} className={styles.section}>
              <h2>{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              ) : null}
            </section>
          ))}

          <div className={styles.contact}>
            <strong>Questions or requests:</strong>{" "}
            <a href={`mailto:${BUSINESS_DETAILS.supportEmail}`}>{BUSINESS_DETAILS.supportEmail}</a>
          </div>
        </article>

        <footer className={styles.footer}>
          <span>© {new Date().getFullYear()} {BUSINESS_DETAILS.displayName}. All rights reserved.</span>
          <span>These policies should be reviewed by Indian legal counsel before full commercial launch.</span>
        </footer>
      </div>
    </main>
  );
}

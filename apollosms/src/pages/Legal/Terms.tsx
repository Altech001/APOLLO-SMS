import PublicLegalLayout from "@/components/legal/PublicLegalLayout";
import { Link } from "react-router-dom";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-base font-semibold">{title}</h2>
    <div className="space-y-2 text-sm leading-6 text-muted-foreground">{children}</div>
  </section>
);

export default function TermsPage() {
  return (
    <PublicLegalLayout title="Terms and Conditions" description="Terms and Conditions for using TINORA AI business messaging services." path="/terms">
      <article className="space-y-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Terms and Conditions</h1>
          <p className="mt-2 text-sm text-muted-foreground">Effective date: 28 October 2026</p>
        </div>

        <Section title="1. Agreement">
          <p>These Terms govern your use of TINORA AI, including its SMS, WhatsApp, contact management, billing, automation, and AI-assisted messaging features. By creating or using an account, you agree to these Terms and acknowledge our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.</p>
        </Section>

        <Section title="2. Accounts">
          <p>You must provide accurate account information, keep your password secure, and promptly tell us about unauthorized access. You are responsible for activity performed through your account, API keys, and linked messaging numbers.</p>
        </Section>

        <Section title="3. Messaging responsibilities">
          <p>You may contact only recipients you are legally permitted to message. You are responsible for obtaining required consent, honoring opt-out requests, identifying the sender where required, and complying with applicable telecommunications, consumer-protection, privacy, and anti-spam rules.</p>
          <p>You must not use TINORA AI for fraud, harassment, unlawful content, phishing, malware, deceptive campaigns, prohibited goods or services, or attempts to bypass provider limits.</p>
        </Section>

        <Section title="4. Credits, plans, and payments">
          <p>Prices, credit quantities, taxes, plan allowances, and payment methods are shown before purchase. Provider fees and delivery conditions may change. Unless required by law or expressly stated at purchase, consumed messaging credits and completed service periods are not refundable.</p>
        </Section>

        <Section title="5. Third-party services">
          <p>Delivery may depend on mobile networks, payment processors, email providers, cloud infrastructure, AI providers, and WhatsApp or other third-party platforms. Their availability, policies, and delivery decisions are outside our direct control. Linking WhatsApp authorizes the service to operate that linked device for the features you request.</p>
        </Section>

        <Section title="6. Suspension and termination">
          <p>We may restrict or suspend access when reasonably necessary to protect users, comply with law or provider rules, investigate abuse, secure the platform, or address unpaid charges. We will provide notice where practical and legally permitted.</p>
        </Section>

        <Section title="7. Account deletion and the 60-day period">
          <p>You can request deletion inside the app under My Account, or from our public <Link to="/account-deletion" className="text-primary hover:underline">account-deletion page</Link>. Once confirmed, access is revoked immediately, active sessions and API keys are disabled, and the old account is flagged for permanent deletion.</p>
          <p>You may create a new account immediately, including with the same email address. The new account is separate: remaining credits, plans, contacts, settings, and message history are not transferred from the deleted account. Personal account data is permanently deleted or irreversibly anonymized within <strong className="text-foreground">60 days</strong> of the request. During that period, the old record remains restricted for deletion processing, security, dispute handling, and audit continuity.</p>
          <p>After the 60-day period, TINORA AI may retain only non-identifying operational references and records that must be kept for legitimate fraud-prevention, accounting, tax, legal, or regulatory purposes. Message content, recipient details, contacts, profile data, linked-device data, and other user-created personal data are removed or anonymized.</p>
        </Section>

        <Section title="8. Intellectual property">
          <p>TINORA AI and its software, branding, and platform materials belong to their respective owners. You retain rights in content you submit and grant us the limited permission needed to process it and provide the requested service.</p>
        </Section>

        <Section title="9. Service availability and liability">
          <p>The service is provided on an “as available” basis. We do not guarantee uninterrupted operation or delivery to every recipient. To the extent permitted by law, TINORA AI is not liable for indirect, incidental, or consequential losses arising from provider outages, recipient filtering, unlawful user campaigns, or events outside our reasonable control.</p>
        </Section>

        <Section title="10. Changes and contact">
          <p>We may update these Terms as the service or legal requirements change. Material changes will be posted with a revised effective date. These Terms are governed by the applicable laws of Uganda, without limiting mandatory consumer rights.</p>
          <p>Questions can be sent to <a href="mailto:support@info.pitbox.fun" className="text-primary hover:underline">support@info.pitbox.fun</a>.</p>
        </Section>
      </article>
    </PublicLegalLayout>
  );
}

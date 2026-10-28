import PublicLegalLayout from "@/components/legal/PublicLegalLayout";
import { Link } from "react-router-dom";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-base font-semibold">{title}</h2>
    <div className="space-y-2 text-sm leading-6 text-muted-foreground">{children}</div>
  </section>
);

export default function PrivacyPage() {
  return (
    <PublicLegalLayout title="Privacy Policy" description="How TINORA AI collects, uses, retains, and deletes user data." path="/privacy">
      <article className="space-y-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Privacy</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Effective date: 28 October 2026</p>
        </div>

        <Section title="1. Who this policy covers">
          <p>This policy describes how TINORA AI handles personal data when you use our website, mobile application, APIs, SMS and WhatsApp tools, billing features, and AI-assisted messaging services.</p>
        </Section>

        <Section title="2. Data we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li>Account data such as name, email, phone number, password hash, profile image, verification state, and preferences.</li>
            <li>Messaging data such as recipient numbers, message content, templates, delivery status, provider identifiers, timestamps, and linked WhatsApp account information.</li>
            <li>Contacts and contact groups that you choose to upload or create.</li>
            <li>Billing and transaction data such as amounts, payment references, payment method, status, and necessary provider responses.</li>
            <li>Security and usage data such as IP address, device and browser information, login history, API-key activity, and diagnostic logs.</li>
            <li>AI prompts, conversation history, and generated content when you use AI features.</li>
          </ul>
        </Section>

        <Section title="3. How we use data">
          <p>We use data to create and secure accounts, deliver messages, operate linked services, process payments, provide support, prevent abuse and fraud, maintain audit trails, improve reliability, and comply with legal obligations. We do not sell personal data.</p>
        </Section>

        <Section title="4. Service providers and disclosures">
          <p>We share only the data needed with service providers that help deliver the requested service, such as mobile messaging gateways, WhatsApp infrastructure, cloud hosting and storage, payment processors, email delivery, analytics, security, and AI providers. We may also disclose data when required by law or necessary to protect users and the platform.</p>
        </Section>

        <Section title="5. Retention and account deletion">
          <p>Active-account data is retained while needed to provide the service. You can initiate deletion inside the app or through the public <Link to="/account-deletion" className="text-primary hover:underline">account-deletion page</Link>.</p>
          <p>After a confirmed request, access is revoked immediately and the account is marked for permanent deletion. You may create a new account immediately using the same email. Personal account data is permanently deleted or irreversibly anonymized within <strong className="text-foreground">60 days</strong>.</p>
          <p>At the end of that period, profile data, contacts, authentication data, active sessions, API keys, AI conversations, linked-device data, recipient details, and message content are deleted or anonymized. We may retain limited non-identifying audit data and records required for accounting, fraud prevention, dispute resolution, security, or legal compliance. Those retained records are restricted and not used to recreate the deleted account.</p>
        </Section>

        <Section title="6. Data security">
          <p>We use access controls, password hashing, session revocation, restricted administrative access, transport security, and monitoring intended to protect data. No system can guarantee absolute security, so you should also protect your password, devices, API keys, and linked accounts.</p>
        </Section>

        <Section title="7. Your choices and rights">
          <p>You may review and update account details, revoke sessions and API keys, disconnect linked WhatsApp accounts, and request account deletion. Depending on applicable law, you may also request access, correction, restriction, or a copy of your personal data by contacting support.</p>
        </Section>

        <Section title="8. Children">
          <p>TINORA AI is a business communications service and is not intended for children under 13 or the minimum digital-consent age applicable in their location.</p>
        </Section>

        <Section title="9. Changes and contact">
          <p>We may update this policy as our services and obligations change. The effective date above shows the latest revision. Privacy and deletion questions can be sent to <a href="mailto:support@info.pitbox.fun" className="text-primary hover:underline">support@info.pitbox.fun</a>.</p>
        </Section>
      </article>
    </PublicLegalLayout>
  );
}

import SEO from "@/components/SEO";
import { BRAND_DESCRIPTION, BRAND_NAME, SITE_URL } from "@/constants/brand";
import { useAuth } from "@/lib/auth";
import {
  ArrowRight,
  Bot,
  Check,
  MessageCircleMore,
  MessagesSquare,
  Send,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import "./Landing.css";

const features = [
  { icon: MessagesSquare, label: "Bulk SMS campaigns" },
  { icon: MessageCircleMore, label: "WhatsApp messaging" },
  { icon: Bot, label: "AI writing assistant" },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: BRAND_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/logo.png`,
      description: BRAND_DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: BRAND_NAME,
      description: BRAND_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: BRAND_NAME,
      url: `${SITE_URL}/`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: BRAND_DESCRIPTION,
      provider: { "@id": `${SITE_URL}/#organization` },
      featureList: [
        "Bulk SMS campaigns",
        "WhatsApp business messaging",
        "AI-assisted message writing",
        "Contact and group management",
        "Message templates and delivery history",
      ],
    },
  ],
};

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const primaryHref = isAuthenticated ? "/chat" : "/signup";
  const verificationToken = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION;

  return (
    <div className="landing-page">
      <SEO
        title="Bulk SMS, WhatsApp & AI Messaging"
        description="Send bulk SMS, manage WhatsApp messaging, organize contacts, and create campaigns faster with TINORA AI's business messaging platform."
        keywords="bulk SMS Uganda, SMS marketing platform, WhatsApp business messaging, SMS gateway Uganda, AI messaging assistant, business messaging software"
        path="/"
      />
      <Helmet>
        <html lang="en-UG" />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
        {verificationToken ? <meta name="google-site-verification" content={verificationToken} /> : null}
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <header className="landing-header" aria-label="Main navigation">
        <Link to="/" className="landing-brand" aria-label={`${BRAND_NAME} home`}>
          <span className="landing-brand__mark">
            <img src="/logo.png" alt="" width="44" height="44" />
          </span>
          <span>{BRAND_NAME}</span>
        </Link>

        <nav className="landing-nav" aria-label="Account navigation">
          {isAuthenticated ? (
            <Link to="/dashboard" className="landing-login">Dashboard</Link>
          ) : (
            <Link to="/login" className="landing-login">Sign in</Link>
          )}
          <Link to={primaryHref} className="landing-nav-cta">
            {isAuthenticated ? "Open AI chat" : "Get started"}
            <ArrowRight aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-copy">
            <div className="landing-eyebrow">
              <Sparkles aria-hidden="true" />
              One workspace. Every conversation.
            </div>

            <h1 id="landing-title">
              Business messaging that <span>moves faster.</span>
            </h1>

            <p className="landing-intro">
              Reach customers with bulk SMS and WhatsApp, organize every contact, and use AI to write clear campaigns in seconds.
            </p>

            <div className="landing-actions">
              <Link to={primaryHref} className="landing-primary-cta">
                {isAuthenticated ? "Open AI assistant" : "Start messaging"}
                <ArrowRight aria-hidden="true" />
              </Link>
              {!isAuthenticated ? (
                <Link to="/login" className="landing-secondary-cta">I already have an account</Link>
              ) : (
                <Link to="/chat" className="landing-secondary-cta">Open AI assistant</Link>
              )}
            </div>

            <ul className="landing-features" aria-label="Platform features">
              {features.map(({ icon: Icon, label }) => (
                <li key={label}>
                  <span><Icon aria-hidden="true" /></span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div className="landing-product" aria-label="TINORA AI unified messaging preview">
            <div className="landing-product__glow" />
            <div className="landing-window">
              <div className="landing-window__topbar">
                <div className="landing-window__dots" aria-hidden="true"><i /><i /><i /></div>
                <div className="landing-window__status"><span /> Live workspace</div>
              </div>

              <div className="landing-window__body">
                <div className="landing-window__heading">
                  <div>
                    <p>Campaign overview</p>
                    <h2>Good morning, Sarah.</h2>
                  </div>
                  <button type="button" aria-label="Create a new message"><Send aria-hidden="true" /> New message</button>
                </div>

                <div className="landing-stats">
                  <article>
                    <span><UsersRound aria-hidden="true" /></span>
                    <p>Contacts reached</p>
                    <strong>2,480</strong>
                    <small>Ready to engage</small>
                  </article>
                  <article>
                    <span><MessagesSquare aria-hidden="true" /></span>
                    <p>Messages sent</p>
                    <strong>8,642</strong>
                    <small>SMS + WhatsApp</small>
                  </article>
                </div>

                <article className="landing-composer">
                  <div className="landing-composer__head">
                    <span><Sparkles aria-hidden="true" /> AI campaign draft</span>
                    <small>Just now</small>
                  </div>
                  <p>Hi &#123;first_name&#125;, your weekend offer is ready. Visit us before Sunday to save 20%.</p>
                  <div className="landing-composer__foot">
                    <div><Check aria-hidden="true" /> Personalized</div>
                    <button type="button">Review campaign <ArrowRight aria-hidden="true" /></button>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>© {new Date().getFullYear()} {BRAND_NAME}. Built for better customer conversations.</p>
        <nav aria-label="Legal links">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/account-deletion">Account deletion</Link>
        </nav>
      </footer>
    </div>
  );
}

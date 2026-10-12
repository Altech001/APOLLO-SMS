import { Helmet } from 'react-helmet-async';
import { useLocation } from "react-router-dom";
import { BRAND_DESCRIPTION, BRAND_KEYWORDS, BRAND_NAME, SITE_URL } from "@/constants/brand";

interface SEOProps {
    /** Page title – will be appended with the TINOVA AI brand. */
    title?: string;
    /** Meta description – keep under 160 characters */
    description?: string;
    /** Comma-separated keywords for this page */
    keywords?: string;
    /** Canonical URL path (e.g. "/agent"). Full URL is constructed automatically. */
    path?: string;
    /** OpenGraph image URL */
    ogImage?: string;
    /** OpenGraph type – defaults to "website" */
    ogType?: string;
    /** Set to true to prevent indexing of this page */
    noIndex?: boolean;
}

const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

export default function SEO({
    title,
    description = BRAND_DESCRIPTION,
    keywords = BRAND_KEYWORDS,
    path,
    ogImage = DEFAULT_OG_IMAGE,
    ogType = 'website',
    noIndex = false,
}: SEOProps) {
    const location = useLocation();
    const canonicalPath = path || location.pathname;
    const fullTitle = title ? `${title} | ${BRAND_NAME}` : `${BRAND_NAME} | Business Messaging with SMS, WhatsApp & AI`;
    const canonicalUrl = new URL(canonicalPath, `${SITE_URL}/`).toString();

    return (
        <Helmet>
            {/* Primary SEO */}
            <title>{fullTitle}</title>
            <meta name="description" content={description} />
            <meta name="keywords" content={keywords} />
            <link rel="canonical" href={canonicalUrl} />
            <meta name="author" content={BRAND_NAME} />
            {noIndex && <meta name="robots" content="noindex, nofollow" />}

            {/* Open Graph */}
            <meta property="og:type" content={ogType} />
            <meta property="og:site_name" content={BRAND_NAME} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:url" content={canonicalUrl} />
            <meta property="og:image" content={ogImage} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta property="og:image:alt" content={fullTitle} />
            <meta property="og:locale" content="en_US" />

            {/* Twitter Card */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={ogImage} />
            <meta name="twitter:image:alt" content={fullTitle} />
        </Helmet>
    );
}

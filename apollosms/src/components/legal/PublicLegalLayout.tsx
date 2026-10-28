import SEO from "@/components/SEO";
import { BRAND_NAME } from "@/constants/brand";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface PublicLegalLayoutProps {
  title: string;
  description: string;
  path: string;
  children: React.ReactNode;
}

export default function PublicLegalLayout({ title, description, path, children }: PublicLegalLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO title={title} description={description} path={path} />
      <header className="border-b border-border/60 bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 font-semibold">
            <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg object-contain" />
            <span>{BRAND_NAME}</span>
          </Link>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <span>{BRAND_NAME} © {new Date().getFullYear()}</span>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/account-deletion" className="hover:text-foreground">Account deletion</Link>
          <a href="mailto:support@info.pitbox.fun" className="hover:text-foreground">Support</a>
        </div>
      </footer>
    </div>
  );
}

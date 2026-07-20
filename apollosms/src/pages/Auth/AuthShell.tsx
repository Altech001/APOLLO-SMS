import SEO from "@/components/SEO";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Sun, Moon, Monitor } from "lucide-react";
import { useEffect, useState } from "react";

interface AuthShellProps {
  title: string;
  subtitle: string;
  seoTitle: string;
  path: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

type ThemeMode = "light" | "dark" | "system";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return (localStorage.getItem("app-theme") as ThemeMode) || "light";
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("dark");
  } else if (mode === "light") {
    root.classList.remove("dark");
  } else {
    // system
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    prefersDark ? root.classList.add("dark") : root.classList.remove("dark");
  }
}

export default function AuthShell({ title, subtitle, seoTitle, path, children, footer }: AuthShellProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    applyTheme(themeMode);
    localStorage.setItem("app-theme", themeMode);
  }, [themeMode]);

  return (
    <div className="min-h-screen flex bg-background font-sans text-foreground">
      <Helmet>
        <link rel="preload" as="image" href="/bg/cover.jpeg" />
      </Helmet>
      <SEO title={seoTitle} path={path} />

      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between overflow-hidden bg-[#1b1b1b] p-12 text-white">
        <img
          src="/bg/bg1.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-[#1b1b1b]/70 to-[#1b1b1b]/35" />

        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center ">
            <img src="/bg/logo.png" alt="Renult" className="h-16 w-auto object-contain" />
          </Link>
        </div>

        <div className="relative z-10 flex items-center justify-between w-full">
          <div className="text-[14px] text-white/55 font-medium barlow-semibold">
            Lucosms © {new Date().getFullYear()}
          </div>
          
          <div className="flex items-center bg-black/30 border border-white/10 rounded-full p-0.5 gap-0.5">
            {(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                onClick={(e) => {
                  e.preventDefault();
                  setThemeMode(mode);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 capitalize relative group ${
                  themeMode === mode
                    ? "bg-white text-black shadow-md scale-105"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
                title={`${mode} mode`}
                aria-label={`${mode} mode`}
              >
                {mode === "light" && <Sun className="w-4 h-4" />}
                {mode === "dark" && <Moon className="w-4 h-4" />}
                {mode === "system" && <Monitor className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background">
        {/* Top right theme toggle for mobile/tablet */}
        <div className="absolute top-4 right-4 z-20 lg:hidden">
          <div className="flex items-center bg-muted/65 border border-border/40 rounded-full p-0.5 gap-0.5 backdrop-blur-sm">
            {(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                onClick={(e) => {
                  e.preventDefault();
                  setThemeMode(mode);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 capitalize ${
                  themeMode === mode
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={`${mode} mode`}
                aria-label={`${mode} mode`}
              >
                {mode === "light" && <Sun className="w-4 h-4" />}
                {mode === "dark" && <Moon className="w-4 h-4" />}
                {mode === "system" && <Monitor className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full max-w-[380px] flex flex-col items-center z-10 pb-16">
          {/* <Link to="/" className="mx-auto w-12 h-12 flex items-center justify-center mb-3 lg:hidden">
            <img src="/icons/mini.png" alt="Renult" className="w-10 h-10 object-contain" />
          </Link> */}
          <div className="text-center mb-6">
            <h1 className="text-[22px] text-foreground mb-1 archivo-black-regular font-extrabold">{title}</h1>
            <p className="text-[13px] text-muted-foreground barlow-medium">{subtitle}</p>
          </div>
          {children}
          {footer}
        </div>

        <div className="absolute bottom-6 flex flex-wrap items-center  justify-center gap-6 text-[10px] text-muted-foreground font-bold w-full px-4 lg:hidden">
          <span className="barlow-semibold">Lucosms © {new Date().getFullYear()}</span>
        </div>
      </div>
    </div>
  );
}

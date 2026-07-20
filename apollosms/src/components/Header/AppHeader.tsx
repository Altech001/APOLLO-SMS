/* eslint-disable @typescript-eslint/no-explicit-any */
import { renultApi } from "@/api/apollosms";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskIcon } from "@/constants/Icons";
import { useAuth } from "@/lib/auth";
import { Menu, PanelLeft, User, Wallet, Sun, Moon, Monitor, Lock, VerifiedIcon } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverArrow,
} from "@/components/ui/popover";
import NotificationsDialog from "./NotificationsDialog";
import SideBar from "./SideBar";

interface AppHeaderProps {
  onCreateForm?: () => void;
}

type ThemeMode = "light" | "dark" | "system";

function getInitialTheme(): ThemeMode {
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

export default function AppHeader({ onCreateForm }: AppHeaderProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [smsBalance, setSmsBalance] = useState(0);
  const [cashBalance, setCashBalance] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    applyTheme(themeMode);
    localStorage.setItem("app-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    const handler = (e: any) => {
      setSidebarCollapsed(e.detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () => window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadWallet = () => {
      renultApi.wallet.get()
        .then((wallet) => {
          if (!mounted) return;
          setSmsBalance(wallet.sms_balance);
          setCashBalance(wallet.cash_balance);
        })
        .catch(() => undefined);
    };
    loadWallet();
    window.addEventListener("focus", loadWallet);
    window.addEventListener("renult-wallet-change", loadWallet);
    return () => {
      mounted = false;
      window.removeEventListener("focus", loadWallet);
      window.removeEventListener("renult-wallet-change", loadWallet);
    };
  }, []);

  const toggleSidebarCollapse = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
    window.dispatchEvent(new CustomEvent("sidebar-collapse-change", { detail: { collapsed: next } }));
  };

  const getBreadcrumbs = () => {
    const path = location.pathname;
    if (path === "/") {
      return [
        { label: "Home", path: "/", isLast: true }
      ];
    }

    const parts = path.split("/").filter(Boolean);
    const breadcrumbs = [{ label: "Home", path: "/", isLast: false }];

    let currentPath = "";
    parts.forEach((part, index) => {
      currentPath += `/${part}`;
      const isLast = index === parts.length - 1;

      let label = part.charAt(0).toUpperCase() + part.slice(1);
      if (part === "settings") label = "Profile";
      if (part === "bookmark-tasks") label = "Tasks";
      if (part === "bookmark-documents") label = "Documents";

      breadcrumbs.push({
        label,
        path: currentPath,
        isLast
      });
    });

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <>
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border/40">
        <div className="flex items-center justify-between h-14 px-3 sm:px-4">
          {/* Left section: hamburger/resize + logo/breadcrumb */}
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted/60 transition-colors md:hidden"
              aria-label="Open sidebar menu"
            >
              <Menu className="w-5 h-5 text-foreground/70" />
            </button>

            {/* Desktop Resize Toggle */}
            <button
              onClick={toggleSidebarCollapse}
              className="hidden md:flex w-9 h-9 items-center justify-center transition-colors text-foreground/70"
              aria-label="Toggle sidebar collapse"
            >
              <PanelLeft className="w-[18px] h-[18px]" />
            </button>

            {/* Desktop Dynamic Breadcrumbs */}
            <div className="hidden md:block ml-1">
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={crumb.path}>
                      <BreadcrumbItem>
                        {crumb.isLast ? (
                          <BreadcrumbPage className="font-semibold text-foreground/80">{crumb.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link to={crumb.path} className="text-muted-foreground hover:text-foreground">{crumb.label}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!crumb.isLast && <BreadcrumbSeparator />}
                    </React.Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>

          {/* Right section: actions */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Popover open={balanceOpen} onOpenChange={setBalanceOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  className="gap-1.5 h-9 px-3 rounded font-semibold text-xs sm:text-sm shadow-sm hover:shadow transition-all cursor-pointer"
                >
                  <Wallet className="w-4 h-4 text-white" />
                  <span className="hidden sm:inline">Bal: {smsBalance.toLocaleString()} SMS</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-5 rounded border bg-card/95 text-card-foreground shadow-xl backdrop-blur-md border-border/40 focus:outline-none z-50" align="end" sideOffset={8}>
                <PopoverArrow className="fill-card border-none" />
                <div className="space-y-4">
                  <h3 className="font-bold text-base text-foreground tracking-tight">Billing Plans</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This is a list of your billing plans and their balances:
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="border border-border/40 rounded p-3">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">SMS Balance</p>
                      <p className="text-sm font-black text-foreground">{smsBalance.toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    For more information, please visit our{" "}
                    <Link
                      to="/settings/billing"
                      className="text-primary hover:underline font-semibold"
                      onClick={() => setBalanceOpen(false)}
                    >
                      pricing pages
                    </Link>
                    .
                  </p>

                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      onClick={() => setBalanceOpen(false)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 h-8 rounded shadow-sm hover:shadow transition-all duration-200"
                    >
                      OK
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <NotificationsDialog />

            {/* User avatar */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="w-9 h-9 rounded-full hover:ring-2 hover:ring-primary/30 transition-all
                    focus:outline-none focus:ring-2 focus:ring-primary/40 shrink-0"
                  aria-label="Account menu"
                >
                  <Avatar className="w-9 h-9">
                    <AvatarImage src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.full_name || "User")}&background=f97316&color=fff&rounded=true&bold=true&size=64`} />
                    <AvatarFallback className="bg-primary/90 text-primary-foreground text-sm font-bold">{user?.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64 rounded p-3 border-border/50 shadow-2xl bg-card"
                sideOffset={8}
              >
                {/* User info row */}
                <div className="flex items-center gap-3 px-1 pb-3">
                  <Avatar className="w-11 h-11 shrink-0">
                    <AvatarImage src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.full_name || "User")}&background=f97316&color=fff&rounded=true&bold=true&size=88`} />
                    <AvatarFallback className="bg-orange-500 text-white text-sm font-bold">{user?.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {user?.full_name || "My Account"}
                    </p>
                    {user?.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                  </div>
                </div>

                {/* Theme toggle row */}
                <div className="pb-3">
                  <div className="flex items-center bg-muted/50 rounded-lg p-1 gap-0.5">
                    {(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={(e) => { e.preventDefault(); setThemeMode(mode); }}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 rounded-md transition-all duration-150 capitalize ${themeMode === mode
                          ? "bg-card text-orange-600 shadow-sm ring-1 ring-orange-400/50"
                          : "text-muted-foreground hover:text-foreground"
                          }`}
                      >
                        {mode === "light" && <Sun className="w-3 h-3" />}
                        {mode === "dark" && <Moon className="w-3 h-3" />}
                        {mode === "system" && <Monitor className="w-3 h-3" />}
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <DropdownMenuSeparator className="bg-border/30 -mx-1 mb-1.5" />

                {/* ACCOUNT section */}
                <p className="px-2 pt-0.5 pb-2 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">Account</p>

                <DropdownMenuItem
                  onClick={() => navigate("/settings")}
                  className="rounded px-2 py-2.5 cursor-pointer focus:bg-muted/60 transition-all gap-3"
                >
                  <VerifiedIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm text-foreground">Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/settings/security")}
                  className="rounded px-2 py-2.5 cursor-pointer focus:bg-muted/60 transition-all gap-3"
                >
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm text-foreground">Password &amp; security</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-border/30 -mx-1 my-1.5" />

                <DropdownMenuItem
                  onClick={() => {
                    logout();
                    navigate("/login", { replace: true });
                  }}
                  className="rounded-lg px-2 py-2.5 cursor-pointer focus:bg-muted/60 transition-all gap-3"
                >
                  <span className="font-medium text-sm text-muted-foreground">Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <SideBar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}

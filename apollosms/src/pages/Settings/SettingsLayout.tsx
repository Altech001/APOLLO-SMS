import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import {
  Bell,
  Building2,
  CreditCard,
  Key,
  Logs,
  Megaphone,
  Settings,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/* ─── sidebar nav config ─── */
interface SettingsNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: string;
}

const navItems: SettingsNavItem[] = [
  {
    id: "my-details",
    label: "My Profile",
    icon: <User className="w-4 h-4" />,
    path: "/settings",
  },
  {
    id: "password",
    label: "Change Password",
    icon: <Key className="w-4 h-4" />,
    path: "/settings/password",
  },
  {
    id: "api-keys",
    label: "Developer API Keys",
    icon: <Key className="w-4 h-4" />,
    path: "/settings/api-keys",
  },
  {
    id: "logs",
    label: "Security Logs",
    icon: <Logs className="w-4 h-4" />,
    path: "/security-logs",
  },
  {
    id: "admin-settings",
    label: "Admin Settings",
    icon: <Settings className="w-4 h-4" />,
    path: "/settings/admin",
  }
];

interface SettingsLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function SettingsLayout({
  children,
  title = "Settings",
}: SettingsLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    localStorage.getItem("sidebar-collapsed") === "true"
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ collapsed: boolean }>).detail;
      setSidebarCollapsed(detail.collapsed);
    };
    window.addEventListener("sidebar-collapse-change", handler);
    return () =>
      window.removeEventListener("sidebar-collapse-change", handler);
  }, []);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div
      className={`min-h-screen bg-background transition-all duration-300 ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
        }`}
    >
      <SEO title={title} />
      <AppHeader />

      <div className="flex h-[calc(100vh-57px)] overflow-hidden">
        {/* ── settings sidebar ── */}
        <aside className="hidden lg:flex flex-col w-[250px] shrink-0 border-r border-border/50 bg-card overflow-y-auto">
          <div className="px-4 pt-6 pb-2">
          </div>

          <nav className="flex-1 px-2 pb-4 pt-1">
            <div className="flex flex-col gap-px">
              {navItems.map((item) => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.path)}
                    className={`
                      group flex items-center gap-2.5 px-3 py-2 m-0.5 rounded  text-sm font-medium
                      transition-all duration-150 cursor-pointer w-full text-left
                      ${active
                        ? "bg-primary text-white border border-border/10 "
                        : "text-foreground hover:bg-muted/40 hover:text-foreground "
                      }
                    `}
                  >
                    <span
                      className={`transition-colors duration-150 ${active
                        ? "text-white"
                        : "text-foreground/70 group-hover:text-foreground/60"
                        }`}
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span
                        className={`
                          text-xs font-semibold px-1.5 py-0.5 rounded-full leading-none
                          ${active
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                          }
                        `}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        </aside>

        {/* ── main content ── */}
        <main className="flex-1 overflow-y-auto min-h-0">{children}</main>
      </div>
    </div>
  );
}

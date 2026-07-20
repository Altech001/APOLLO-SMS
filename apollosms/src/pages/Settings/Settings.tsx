import { NotificationResponse, renultApi } from "@/api/apollosms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

interface NotificationCheckItem {
  id: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}

interface NotificationRadioSection {
  id: string;
  title: string;
  description: string;
  options: { value: string; label: string; description: string }[];
  defaultValue: string;
}

const PREFS_KEY = "renult:notification-preferences";

const notificationFromUs: NotificationCheckItem[] = [
  {
    id: "account-updates",
    label: "Account updates",
    description: "Receive profile, password, and verification notices.",
    defaultChecked: true,
  },
  {
    id: "branch-alerts",
    label: "Branch alerts",
    description: "Receive alerts about branches, staff, tickets, and routers.",
    defaultChecked: true,
  },
  {
    id: "billing-campaigns",
    label: "Billing and campaigns",
    description: "Receive transaction, voucher, and campaign notifications.",
    defaultChecked: true,
  },
];

const notificationRadioSections: NotificationRadioSection[] = [
  {
    id: "reminders",
    title: "Reminders",
    description: "Choose how many reminder notifications should reach you.",
    options: [
      {
        value: "important",
        label: "Important reminders only",
        description: "Only notify me if the reminder is tagged as important.",
      },
      {
        value: "all",
        label: "All reminders",
        description: "Notify me for all reminders.",
      },
    ],
    defaultValue: "all",
  },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationResponse[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const defaults = Object.fromEntries(notificationFromUs.map((item) => [item.id, item.defaultChecked]));
    const saved = localStorage.getItem(PREFS_KEY);
    if (!saved) return defaults;
    try {
      return { ...defaults, ...(JSON.parse(saved).checks || {}) };
    } catch {
      return defaults;
    }
  });
  const [radios, setRadios] = useState<Record<string, string>>(() => {
    const defaults = Object.fromEntries(notificationRadioSections.map((section) => [section.id, section.defaultValue]));
    const saved = localStorage.getItem(PREFS_KEY);
    if (!saved) return defaults;
    try {
      return { ...defaults, ...(JSON.parse(saved).radios || {}) };
    } catch {
      return defaults;
    }
  });

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await renultApi.notifications.list({ limit: 5 });
      setItems(data.notifications);
      setUnreadCount(data.unread_count);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Failed to load notifications"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadNotifications(); }, []);
  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ checks, radios }));
  }, [checks, radios]);

  const markAllRead = async () => {
    try {
      await renultApi.notifications.markAllRead();
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
      toast.success("Notifications marked as read");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Failed to update notifications"));
    }
  };

  return (
    <SettingsLayout title="Notification Settings">
      <div className="max-w-4xl mx-auto px-6 sm:px-10 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground mb-1">Notifications</h1>
            <p className="text-sm text-muted-foreground">Manage alerts and review recent account updates</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded">{unreadCount} unread</Badge>
            <Button onClick={markAllRead} className="h-9 text-xs gap-1.5">
              <CheckCheck className="w-4 h-4" />
              Mark read
            </Button>
          </div>
        </div>
        <Separator className="mb-5 bg-border/20" />

        <div className="grid grid-cols-1  gap-8s">
          <aside className="border border-border/10 rounded-none bg-card/50 overflow-hidden h-fit">
            <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Recent Notifications</span>
              </div>
              <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => navigate("/notifications")}>
                View all
              </Button>
            </div>
            {isLoading ? (
              <div className="h-28 flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading...
              </div>
            ) : items.length === 0 ? (
              <div className="h-28 flex items-center justify-center text-sm text-muted-foreground">No notifications yet.</div>
            ) : (
              <div>
                {items.map((item) => (
                  <div key={item.id} className="px-4 py-3 border-b border-border/30 last:border-b-0">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${item.is_read ? "bg-muted" : "bg-primary"}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{item.body}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{timeLabel(item.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </SettingsLayout>
  );
}

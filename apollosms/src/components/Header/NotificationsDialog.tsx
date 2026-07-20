/* eslint-disable @typescript-eslint/no-explicit-any */
import { renultApi, NotificationResponse } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Bell, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function NotificationsDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationResponse[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await renultApi.notifications.list({ limit: 8 });
      setItems(data.notifications);
      setUnreadCount(data.unread_count);
    } catch (err: any) {
      toast.error(err.message || "Failed to load notifications");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const markAllRead = async () => {
    try {
      await renultApi.notifications.markAllRead();
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch (err: any) {
      toast.error(err.message || "Failed to mark notifications read");
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await renultApi.notifications.delete(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete notification");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="relative w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-[18px] h-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-primary-foreground text-[10px] font-bold leading-4">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex flex-col gap-0 max-w-2xl h-[620px] max-h-[85vh] p-0 overflow-hidden border border-border/40 rounded-none bg-popover shadow">
        <DialogHeader className="px-5 py-4 border-b border-border/40 flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-base">Notifications</DialogTitle>
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-8 text-xs gap-1.5">
              <CheckCheck className="w-4 h-4" />
              Mark read
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {isLoading && items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-sm text-muted-foreground p-8 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span>Loading notifications...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-sm text-muted-foreground p-8 gap-3">
              <Bell className="w-8 h-8 text-muted-foreground/30 stroke-[1.5]" />
              <span>No notifications yet.</span>
            </div>
          ) : (
            <div className="flex flex-col">
              {items.map((item) => (
                <div key={item.id} className="group px-5 py-3 border-b border-border/30 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${item.is_read ? "bg-muted" : "bg-primary"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{item.category}</span>
                      </div>
                      <p className="text-[13px] text-muted-foreground leading-relaxed mt-0.5">{item.body}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{timeLabel(item.created_at)}</p>
                    </div>
                    <button onClick={() => deleteNotification(item.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all" aria-label="Delete notification">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border/40 bg-muted/20 flex-shrink-0">
          <Button variant="outline" className="w-full h-9 text-xs" onClick={() => { setOpen(false); navigate("/notifications"); }}>
            View all notifications
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

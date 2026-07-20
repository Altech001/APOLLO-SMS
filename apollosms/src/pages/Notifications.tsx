/* eslint-disable @typescript-eslint/no-explicit-any */
import { renultApi, NotificationResponse } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationResponse[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await renultApi.notifications.list({ unread_only: filter === "unread", limit: 100 });
      setItems(data.notifications);
      setUnreadCount(data.unread_count);
    } catch (err: any) {
      toast.error(err.message || "Failed to load notifications");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const markAllRead = async () => {
    try {
      await renultApi.notifications.markAllRead();
      await load();
      toast.success("Notifications marked as read");
    } catch (err: any) {
      toast.error(err.message || "Failed to update notifications");
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await renultApi.notifications.delete(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete notification");
    }
  };

  return (
    <div className="min-h-screen bg-background md:pl-[280px]">
      <SEO title="Notifications" path="/notifications" />
      <AppHeader />
      <main className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Notifications</h1>
            <p className="text-sm text-muted-foreground">Review account, branch, and billing updates.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[140px] h-9 text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={markAllRead} className="h-9 text-xs gap-1.5">
              <CheckCheck className="w-4 h-4" />
              Mark read
            </Button>
          </div>
        </div>

        <Card className="rounded-none border-border/20 shadow-none ">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/40">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              Inbox
            </CardTitle>
            <Badge variant="secondary" className="rounded">{unreadCount} unread</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading notifications...
              </div>
            ) : items.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No notifications found.</div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="group px-5 py-4 border-b border-border/30 last:border-b-0 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${item.is_read ? "bg-muted" : "bg-primary"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                        <Badge variant="outline" className="rounded text-[10px] uppercase">{item.category}</Badge>
                      </div>
                      <p className="text-[13px] text-muted-foreground leading-relaxed mt-1">{item.body}</p>
                      <p className="text-[11px] text-muted-foreground mt-2">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                    <button onClick={() => deleteItem(item.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete notification">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

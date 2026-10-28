import { apollosmsApi } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import SettingsLayout from "@/pages/Settings/SettingsLayout";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, MessageCircle, MessagesSquare, RefreshCw, Search, Smartphone, X } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

const PAGE_SIZE = 25;

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  : "—";

const statusTone = (status: string) => {
  const value = status.toLowerCase();
  if (value === "sent" || value === "delivered") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (value === "failed" || value === "cancelled") return "bg-rose-500/10 text-rose-700 dark:text-rose-400";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
};

export default function AdminMessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = searchParams.get("user_id") || "";
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [deferredSearch, channel, status, userId]);

  const query = useQuery({
    queryKey: ["apollosms", "admin", "messages", { page, channel, status, search: deferredSearch, userId }],
    queryFn: () => apollosmsApi.admin.messages({
      page,
      per_page: PAGE_SIZE,
      channel: channel === "all" ? undefined : channel,
      status: status === "all" ? undefined : status,
      search: deferredSearch || undefined,
      user_id: userId || undefined,
    }),
  });

  const data = query.data;
  const items = data?.items || [];
  const totalPages = Math.max(1, data?.total_pages || 1);

  return (
    <SettingsLayout title="Message History" showNav={false}>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold"><MessagesSquare className="h-5 w-5" /> Message history</h1>
            <p className="mt-1 text-xs text-muted-foreground">Review SMS and WhatsApp records for every user, including delivery failures and deletion-pending accounts.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Refresh message history">
            <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} />
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_160px_160px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search user, email, recipient, or message" className="pl-9" />
          </div>
          <select value={channel} onChange={(event) => setChannel(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All channels</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All statuses</option>
            <option value="delivered">Delivered</option>
            <option value="sent">Sent</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {userId && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-card px-3 py-1.5">Showing message history for user #{userId}</span>
            <button type="button" onClick={() => setSearchParams({})} className="inline-flex items-center gap-1 hover:text-foreground"><X className="h-3.5 w-3.5" /> Clear user filter</button>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          {query.isLoading ? (
            <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : query.isError ? (
            <div className="min-h-72 px-4 py-16 text-center">
              <p className="text-sm font-medium">Message history could not be loaded</p>
              <p className="mt-1 text-xs text-muted-foreground">{query.error instanceof Error ? query.error.message : "Try again shortly."}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => query.refetch()}>Try again</Button>
            </div>
          ) : items.length === 0 ? (
            <div className="min-h-72 px-4 py-16 text-center">
              <MessagesSquare className="mx-auto h-7 w-7 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">No message records found</p>
              <p className="mt-1 text-xs text-muted-foreground">Change the search or filters to see more records.</p>
            </div>
          ) : (
            <>
              <Table className="hidden lg:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead className="w-[34%]">Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={`${item.channel}-${item.id}`}>
                      <TableCell className="max-w-52">
                        <p className="truncate text-sm font-medium">{item.user_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.user_email || `User #${item.user_id}`}</p>
                        {item.user_account_status !== "active" && <span className="mt-1 inline-flex rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400">{item.user_account_status.replace(/_/g, " ")}</span>}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize">
                          {item.channel === "whatsapp" ? <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> : <Smartphone className="h-3.5 w-3.5 text-primary" />}
                          {item.channel}
                        </span>
                        <p className="mt-1 text-[10px] text-muted-foreground">{item.provider || item.source}</p>
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-xs">{item.recipient || "Deleted"}</TableCell>
                      <TableCell><p title={item.message} className="line-clamp-2 text-xs leading-5">{item.message || "Deleted"}</p>{item.error && <p className="mt-1 line-clamp-1 text-[10px] text-rose-600" title={item.error}>{item.error}</p>}</TableCell>
                      <TableCell><span className={cn("rounded-full px-2 py-1 text-[10px] font-medium capitalize", statusTone(item.status))}>{item.status}</span></TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(item.sent_at || item.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <ul className="divide-y divide-border/60 lg:hidden">
                {items.map((item) => (
                  <li key={`${item.channel}-${item.id}`} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{item.user_name}</p><p className="truncate text-xs text-muted-foreground">{item.user_email || `User #${item.user_id}`}</p></div>
                      <span className={cn("rounded-full px-2 py-1 text-[10px] font-medium capitalize", statusTone(item.status))}>{item.status}</span>
                    </div>
                    <p className="text-xs leading-5">{item.message || "Deleted"}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span className="capitalize">{item.channel}</span><span>·</span><span>{item.recipient || "Deleted recipient"}</span><span>·</span><span>{formatDate(item.sent_at || item.created_at)}</span></div>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">{(data?.total || 0).toLocaleString()} records</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1 || query.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-16 text-center text-xs text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages || query.isFetching} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}

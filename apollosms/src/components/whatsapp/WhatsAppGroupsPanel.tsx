import { renultApi, WhatsAppAccountResponse, WhatsAppGroup } from "@/api/apollosms";
import { useRefreshWhatsAppGroups, useWhatsAppGroups } from "@/api/apollosms-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Loader2, Plus, RefreshCw, Search, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const ROW_HEIGHT = 64;

/**
 * Header button plus right-hand panel listing a linked number's WhatsApp groups.
 * Groups start loading in the background as soon as a number is online (cached server-side
 * in Redis and client-side by TanStack Query), so the panel is usually ready when opened.
 */
export function WhatsAppGroupsPanel({ accounts }: { accounts: WhatsAppAccountResponse[] }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [accountId, setAccountId] = useState("");
    const [search, setSearch] = useState("");
    const [importingGroup, setImportingGroup] = useState<string | null>(null);
    const [importedGroups, setImportedGroups] = useState<Set<string>>(new Set());

    // Default to the first online number, and follow it if the selected one goes away.
    useEffect(() => {
        if (!accounts.some((account) => String(account.id) === accountId)) {
            setAccountId(accounts[0] ? String(accounts[0].id) : "");
        }
    }, [accounts, accountId]);

    const groupsQuery = useWhatsAppGroups(accountId || null);
    const refreshMutation = useRefreshWhatsAppGroups();
    const groups = useMemo(() => (accountId ? groupsQuery.data?.groups ?? null : null), [accountId, groupsQuery.data]);
    const isRefreshing = refreshMutation.isPending && refreshMutation.variables === accountId;
    const isBusy = groupsQuery.isFetching || isRefreshing;

    const visibleGroups = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (groups || []).filter((g) => !q || g.name.toLowerCase().includes(q));
    }, [groups, search]);

    const handleRefresh = () => {
        if (!accountId) return;
        refreshMutation.mutate(accountId, {
            onSuccess: (data) => {
                setImportedGroups(new Set());
                if (data.cached) toast.info("Groups were just refreshed. Showing the latest list.");
            },
            onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to reload WhatsApp groups"),
        });
    };

    const handleImportGroup = async (group: WhatsAppGroup) => {
        if (group.members.length === 0) {
            toast.error("WhatsApp doesn't share any member numbers for this group");
            return;
        }
        setImportingGroup(group.jid);
        try {
            const created = await renultApi.contactGroups.create({
                name: group.name,
                description: `Imported from WhatsApp group "${group.name}"`,
            });
            const { summary } = await renultApi.contacts.bulkCreate({
                contacts: group.members.map((member) => ({ name: "", phone: `+${member.phone}` })),
                group_ids: [created.id],
            });
            setImportedGroups((prev) => new Set(prev).add(group.jid));
            toast.success(
                `Contact group "${group.name}" created: ${summary.created} new, ${summary.updated} existing contact${summary.updated === 1 ? "" : "s"} added.`,
                { action: { label: "View", onClick: () => navigate("/my-contacts") } }
            );
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to create the contact group");
        } finally {
            setImportingGroup(null);
        }
    };

    return (
        <>
            <Button onClick={() => setOpen(true)} variant="outline" size="sm" className="h-10 text-xs gap-1.5">
                {groupsQuery.isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                WhatsApp groups{groups ? ` (${groups.length})` : ""}
            </Button>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
                    <SheetHeader className="p-5 pb-3 border-b border-border/10 space-y-1 text-left">
                        <SheetTitle className="text-sm flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-primary" />
                            Your WhatsApp groups
                        </SheetTitle>
                        <SheetDescription className="text-[10px]">
                            Turn a group you're in into a contact group for batch messaging.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="p-5 pb-3 space-y-3">
                        <div className="flex items-center gap-2">
                            <select
                                value={accountId}
                                onChange={(e) => { setAccountId(e.target.value); setSearch(""); }}
                                disabled={accounts.length === 0}
                                className="h-9 text-xs bg-card border border-border rounded px-2 flex-1 min-w-0"
                                aria-label="WhatsApp number"
                            >
                                {accounts.length === 0 && <option value="">No number online</option>}
                                {accounts.map((account) => (
                                    <option key={account.id} value={String(account.id)}>+{account.phone_number}</option>
                                ))}
                            </select>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-9 text-xs gap-1.5 shrink-0"
                                onClick={handleRefresh}
                                disabled={!accountId || isBusy}
                            >
                                <RefreshCw className={cn("w-3.5 h-3.5", isBusy && "animate-spin")} />
                                Reload
                            </Button>
                        </div>
                        {groups && groups.length > 0 && (
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={`Search ${groups.length} groups`}
                                    className="pl-9 h-9 text-xs"
                                />
                            </div>
                        )}
                        {groupsQuery.data && (
                            <p className="text-[10px] text-muted-foreground">
                                Updated {formatDistanceToNow(new Date(groupsQuery.data.fetched_at), { addSuffix: true })}
                                {search && ` · ${visibleGroups.length} match${visibleGroups.length === 1 ? "" : "es"}`}
                            </p>
                        )}
                    </div>

                    <div className="flex-1 min-h-0 px-5">
                        {accounts.length === 0 ? (
                            <EmptyState text="Link a number (or reconnect one) to see its groups." />
                        ) : groupsQuery.isLoading ? (
                            <EmptyState text="Loading groups from WhatsApp..." loading />
                        ) : groupsQuery.error && !groups ? (
                            <EmptyState
                                text={groupsQuery.error instanceof Error ? groupsQuery.error.message : "Unable to load WhatsApp groups"}
                            />
                        ) : !groups || groups.length === 0 ? (
                            <EmptyState text="This number isn't in any WhatsApp groups." />
                        ) : visibleGroups.length === 0 ? (
                            <EmptyState text={`No groups match "${search}".`} />
                        ) : (
                            <VirtualGroupList
                                groups={visibleGroups}
                                importedGroups={importedGroups}
                                importingGroup={importingGroup}
                                onImport={handleImportGroup}
                            />
                        )}
                    </div>

                    <p className="p-5 pt-3 text-[10px] text-muted-foreground border-t border-border/10">
                        Group members didn't sign up for your broadcasts. Only message them if they'd expect it; unwanted messages get numbers reported and banned.
                    </p>
                </SheetContent>
            </Sheet>
        </>
    );
}

function EmptyState({ text, loading }: { text: string; loading?: boolean }) {
    return (
        <p className="text-xs text-muted-foreground text-center py-12 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {text}
        </p>
    );
}

/** Only renders the rows in view, so numbers in hundreds of groups stay smooth. */
function VirtualGroupList({ groups, importedGroups, importingGroup, onImport }: {
    groups: WhatsAppGroup[];
    importedGroups: Set<string>;
    importingGroup: string | null;
    onImport: (group: WhatsAppGroup) => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
        count: groups.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 8,
    });

    return (
        <div ref={scrollRef} className="h-full overflow-y-auto pr-1">
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((row) => {
                    const group = groups[row.index];
                    const imported = importedGroups.has(group.jid);
                    return (
                        <div
                            key={group.jid}
                            className="absolute left-0 top-0 w-full pb-1.5"
                            style={{ height: ROW_HEIGHT, transform: `translateY(${row.start}px)` }}
                        >
                            <div className="h-full flex items-center gap-3 px-2.5 rounded border border-border/50">
                                <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-600 shrink-0"><Users className="w-4 h-4" /></div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold truncate">{group.name}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">
                                        {group.members.length} importable of {group.participant_count} members
                                        {group.hidden_count > 0 ? ` · ${group.hidden_count} hidden by WhatsApp privacy` : ""}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant={imported ? "ghost" : "outline"}
                                    className="h-8 text-[11px] gap-1 shrink-0"
                                    disabled={imported || importingGroup !== null || group.members.length === 0}
                                    onClick={() => onImport(group)}
                                >
                                    {importingGroup === group.jid ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : imported ? (
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                        <Plus className="w-3 h-3" />
                                    )}
                                    {imported ? "Imported" : "Import"}
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

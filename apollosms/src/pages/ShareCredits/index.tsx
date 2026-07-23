import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, SendHorizonal, Users2 } from "lucide-react";
import { toast } from "sonner";

import { renultApi, type UserResponse } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function ShareCreditsPage() {
  const [allUsers, setAllUsers] = useState<UserResponse[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null);
  const [credits, setCredits] = useState("100");
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const users = await renultApi.users.list();
        if (mounted) setAllUsers(users || []);
      } catch (error) {
        if (mounted) {
          toast.error(error instanceof Error ? error.message : "Unable to load users right now");
          setAllUsers([]);
        }
      } finally {
        if (mounted) setIsLoadingUsers(false);
      }
    };

    loadUsers();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 320);

    return () => window.clearTimeout(timer);
  }, [query]);

  const matchedUsers = useMemo(() => {
    if (!debouncedQuery) return [];
    const normalized = debouncedQuery.toLowerCase();
    return allUsers
      .filter((user) => {
        const haystack = [
          user.full_name || user.name || "",
          user.email || "",
          user.phone_number || "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 6);
  }, [allUsers, debouncedQuery]);

  useEffect(() => {
    if (!debouncedQuery) {
      setSelectedUser(null);
      return;
    }

    if (matchedUsers.length > 0 && (!selectedUser || !matchedUsers.some((user) => user.id === selectedUser.id))) {
      setSelectedUser(matchedUsers[0]);
    }

    if (matchedUsers.length === 0) {
      setSelectedUser(null);
    }
  }, [debouncedQuery, matchedUsers, selectedUser]);

  const handleShare = async () => {
    if (!selectedUser) {
      toast.error("Please pick a user first");
      return;
    }

    const parsedCredits = Number(credits);
    if (!Number.isInteger(parsedCredits) || parsedCredits <= 0) {
      toast.error("Please enter a valid number of SMS credits");
      return;
    }

    setIsSharing(true);
    try {
      await renultApi.topups.share({
        recipient_id: selectedUser.id,
        amount: parsedCredits,
        description: `Shared ${parsedCredits} SMS credits`,
      });

      toast.success(`${parsedCredits} SMS credits shared to ${selectedUser.email || selectedUser.name}. Your balance is now updated.`);
      setCredits("100");
      setQuery("");
      setDebouncedQuery("");
      setSelectedUser(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to share credits right now");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background md:pl-[280px]">
      <SEO title="Share SMS Credits" path="/share-sms" />
      <AppHeader />

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-foreground">Share SMS Credits</h1>
          <p className="text-sm text-muted-foreground">
            Find a user by email or phone number, then send them SMS credits instantly.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="rounded-none border-border/30 shadow-none">
            <CardHeader className="border-b border-border/30">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4 text-primary" />
                Find a user
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="space-y-2">
                <Label htmlFor="user-search">Email or phone number</Label>
                <Input
                  id="user-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by email or phone"
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">
                  Search is debounced so it stays fast while you type.
                </p>
              </div>

              <div className="rounded border border-primary  p-3 text-sm text-primary">
                {isLoadingUsers ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading users...
                  </div>
                ) : !debouncedQuery ? (
                  "Type at least one character to begin searching."
                ) : matchedUsers.length === 0 ? (
                  "No matching users were found."
                ) : (
                  `${matchedUsers.length} match${matchedUsers.length > 1 ? "es" : ""} found.`
                )}
              </div>

              <div className="space-y-2">
                {matchedUsers.length > 0 ? (
                  matchedUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedUser(user)}
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-3 text-left transition ${
                        selectedUser?.id === user.id
                          ? "border-primary bg-primary/10"
                          : "border-border/40 bg-background hover:border-primary/50"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {user.full_name || user.name || "Unnamed user"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        {user.phone_number ? (
                          <p className="truncate text-xs text-muted-foreground">{user.phone_number}</p>
                        ) : null}
                      </div>
                      <Badge variant="secondary" className="shrink-0 rounded-full">
                        {user.sms_balance ?? 0} SMS
                      </Badge>
                    </button>
                  ))
                ) : debouncedQuery ? (
                  <div className="rounded-md border border-dashed border-border/40 p-6 text-center text-sm text-muted-foreground">
                    Search for a registered user to continue.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border/30 shadow-none">
            <CardHeader className="border-b border-border/30">
              <CardTitle className="flex items-center gap-2 text-base">
                <SendHorizonal className="h-4 w-4 text-primary" />
                Share credits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {selectedUser ? selectedUser.full_name || selectedUser.name : "No user selected"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedUser ? selectedUser.email : "Select a user from the search results"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="share-amount">How many SMS credits?</Label>
                <Input
                  id="share-amount"
                  type="number"
                  min="1"
                  step="1"
                  value={credits}
                  onChange={(event) => setCredits(event.target.value)}
                  placeholder="e.g. 100"
                  className="h-10"
                />
              </div>

              <Separator />

              <Button onClick={handleShare} disabled={!selectedUser || isSharing} className="w-full gap-2">
                {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                Share credits
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

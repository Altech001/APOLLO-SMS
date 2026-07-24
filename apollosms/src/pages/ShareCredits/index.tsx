import { useState } from "react";
import { Loader2, Search, SendHorizonal, Users2 } from "lucide-react";
import { toast } from "sonner";

import { renultApi, type CreditRecipientResponse } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function ShareCreditsPage() {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientMatch, setRecipientMatch] = useState<CreditRecipientResponse | null>(null);
  const [searchMessage, setSearchMessage] = useState("Make sure the recipient is already registered with this email.");
  const [credits, setCredits] = useState("100");
  const [isSearching, setIsSearching] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const normalizedRecipientEmail = recipientEmail.trim();
  const hasValidRecipientEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRecipientEmail);

  const handleSearch = async () => {
    if (!hasValidRecipientEmail) {
      toast.error("Please enter the recipient's email address");
      return;
    }

    setIsSearching(true);
    setRecipientMatch(null);
    setSearchMessage("Searching for this recipient...");
    try {
      const users = await renultApi.users.searchCreditRecipients(normalizedRecipientEmail);
      const exactMatch = (users || []).find(
        (user: CreditRecipientResponse) => user.email.toLowerCase() === normalizedRecipientEmail.toLowerCase()
      );

      if (exactMatch) {
        setRecipientMatch(exactMatch);
        setSearchMessage(`${exactMatch.full_name || exactMatch.name || exactMatch.email} found. You can share credits now.`);
      } else {
        setSearchMessage("No registered user was found with this email.");
      }
    } catch (error) {
      setSearchMessage("Search is unavailable right now, but sharing will still check the email before sending.");
      toast.error(error instanceof Error ? error.message : "Unable to search users right now");
    } finally {
      setIsSearching(false);
    }
  };

  const handleShare = async () => {
    if (!hasValidRecipientEmail) {
      toast.error("Please enter the recipient's email address");
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
        recipient_email: normalizedRecipientEmail,
        amount: parsedCredits,
        description: `Shared ${parsedCredits} SMS credits`,
      });

      toast.success(`${parsedCredits} SMS credits shared to ${normalizedRecipientEmail}. Your balance is now updated.`);
      setCredits("100");
      setRecipientEmail("");
      setRecipientMatch(null);
      setSearchMessage("Make sure the recipient is already registered with this email.");
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
            Enter a registered user's email, then send them SMS credits instantly.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="rounded-none border-border/30 shadow-none">
            <CardHeader className="border-b border-border/30">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4 text-primary" />
                Recipient
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="space-y-2">
                <Label htmlFor="recipient-email">Recipient email</Label>
                <div className="flex gap-2">
                  <Input
                    id="recipient-email"
                    type="email"
                    value={recipientEmail}
                    onChange={(event) => {
                      setRecipientEmail(event.target.value);
                      setRecipientMatch(null);
                      setSearchMessage("Make sure the recipient is already registered with this email.");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleSearch();
                      }
                    }}
                    placeholder="user@example.com"
                    className="h-10"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSearch}
                    disabled={!recipientEmail.trim() || isSearching}
                    className="h-10 shrink-0 gap-2"
                  >
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Search
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The backend checks this email privately and never shows the recipient's SMS balance.
                </p>
              </div>

              <div className="rounded border border-primary  p-3 text-sm text-primary">
                {searchMessage}
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
                    {recipientMatch ? recipientMatch.full_name || recipientMatch.name || recipientMatch.email : recipientEmail.trim() || "No recipient entered"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {recipientMatch?.email || "Credits will be transferred after the backend confirms the email."}
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

              <Button onClick={handleShare} disabled={!recipientEmail.trim() || isSharing} className="w-full gap-2">
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

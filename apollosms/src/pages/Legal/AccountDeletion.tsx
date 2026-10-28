import { AccountDeletionResponse, apollosmsApi } from "@/api/apollosms";
import PublicLegalLayout from "@/components/legal/PublicLegalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { CheckCircle2, Clock3, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, {
  day: "numeric", month: "long", year: "numeric",
});

export default function AccountDeletionPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AccountDeletionResponse | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user && !email.trim()) return toast.error("Enter the account email address");
    if (!password) return toast.error("Enter the current account password");
    if (confirmation.trim().toUpperCase() !== "DELETE") return toast.error("Type DELETE to confirm");
    setSubmitting(true);
    try {
      const payload = { email: user ? undefined : email.trim(), password, confirmation };
      const response = user
        ? await apollosmsApi.users.requestDeletion(payload)
        : await apollosmsApi.auth.requestAccountDeletion(payload);
      apollosmsApi.auth.clear();
      setResult(response);
      setPassword("");
      setConfirmation("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to request account deletion");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLegalLayout title="Delete Account" description="Request deletion of your TINORA AI account and associated personal data." path="/account-deletion">
      <div className="space-y-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-rose-600">Account control</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Delete your account</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">This page is available outside the app so you can request deletion from any browser.</p>
        </div>

        {result ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <h2 className="mt-4 text-lg font-semibold">Deletion requested</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Account access has been revoked. Personal data is scheduled for permanent deletion or irreversible anonymization by <strong className="text-foreground">{formatDate(result.scheduled_for)}</strong>, within {result.retention_days} days.</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">You may create a new account immediately, including with the same email address. The old account will remain separately flagged for deletion; its credits, plans, contacts, settings, and history will not transfer to the new account.</p>
            <Button asChild className="mt-5"><Link to="/signup">Create a new account</Link></Button>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
            <form onSubmit={submit} className="space-y-4 rounded-xl border border-border/70 bg-card p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-rose-600" />
                <h2 className="font-semibold">Confirm deletion</h2>
              </div>
              {user ? (
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">Signed in as <strong>{user.email}</strong></div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="deletion-email">Account email</Label>
                  <Input id="deletion-email" type="email" required autoComplete="username email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="deletion-password">Current password</Label>
                <Input id="deletion-password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                <p className="text-xs text-muted-foreground">Forgot it? <Link to="/forgot-password" className="text-primary hover:underline">Reset your password first</Link>.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deletion-confirmation">Type DELETE</Label>
                <Input id="deletion-confirmation" required autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="DELETE" />
              </div>
              <Button type="submit" variant="destructive" className="w-full" disabled={submitting || confirmation.trim().toUpperCase() !== "DELETE"}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Request permanent deletion
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">If you cannot access your account or reset its password, email <a href="mailto:support@info.pitbox.fun" className="text-primary hover:underline">support@info.pitbox.fun</a>.</p>
            </form>

            <div className="space-y-4 text-sm">
              <div className="flex gap-3 rounded-lg border border-border/60 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div><h3 className="font-medium">Immediate access removal</h3><p className="mt-1 leading-6 text-muted-foreground">Sessions and API keys are revoked, queued sending is stopped, and the account is flagged for permanent deletion.</p></div>
              </div>
              <div className="flex gap-3 rounded-lg border border-border/60 p-4">
                <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div><h3 className="font-medium">60-day deletion window</h3><p className="mt-1 leading-6 text-muted-foreground">Personal data is deleted or irreversibly anonymized within 60 days. Limited non-identifying legal, financial, fraud-prevention, and audit references may be retained where necessary.</p></div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">Read the full <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> and <Link to="/terms" className="text-primary hover:underline">Terms and Conditions</Link>.</p>
            </div>
          </div>
        )}
      </div>
    </PublicLegalLayout>
  );
}

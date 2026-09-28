import { apollosmsApi, type VerificationRequired } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Loader2, Mail, MessageSquareText } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authErrorMessage } from "./auth-errors";
import AuthShell from "./AuthShell";
import { CodeInput, SubmitButton, useCooldown } from "./auth-ui";
import { clearVerification, isVerificationRequired, loadVerification } from "./verification-state";

type Method = "email" | "sms";

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export default function VerifyAccount() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const info = useMemo<VerificationRequired | null>(() => {
    const fromState = (location.state as { verification?: unknown } | null)?.verification;
    return isVerificationRequired(fromState) ? fromState : loadVerification();
  }, [location.state]);

  const [method, setMethod] = useState<Method>(info?.has_phone ? "sms" : "email");
  const [emailSent, setEmailSent] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const emailCooldown = useCooldown(60);
  const smsCooldown = useCooldown(60);

  if (!info) {
    return <Navigate to="/login" replace />;
  }

  const sendEmail = async () => {
    setBusy(true);
    try {
      await apollosmsApi.auth.resendVerification({ email: info.email });
      setEmailSent(true);
      emailCooldown.start();
      toast.success("Verification link sent. Check your inbox and spam folder.");
    } catch (err: unknown) {
      toast.error(authErrorMessage(err, "Could not send the verification email"));
    } finally {
      setBusy(false);
    }
  };

  const sendSms = async () => {
    setBusy(true);
    try {
      const sent = await apollosmsApi.auth.sendVerificationSms(info.ticket);
      setCodeSentTo(sent.masked_phone);
      setCode("");
      smsCooldown.start();
      toast.success(`Code sent to ${sent.masked_phone}. ${sent.charged_ugx} UGX was charged to your SMS balance.`);
    } catch (err: unknown) {
      toast.error(authErrorMessage(err, "Could not send the SMS code"));
    } finally {
      setBusy(false);
    }
  };

  const confirmSms = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) {
      toast.error("Enter the 6-digit code from the SMS");
      return;
    }
    setBusy(true);
    try {
      const auth = await apollosmsApi.auth.confirmVerificationSms({ ticket: info.ticket, code });
      clearVerification();
      login(auth);
      toast.success("Account verified. Welcome!");
      navigate("/", { replace: true });
    } catch (err: unknown) {
      toast.error(authErrorMessage(err, "Could not verify the code"));
    } finally {
      setBusy(false);
    }
  };

  const options: { id: Method; icon: typeof Mail; title: string; detail: string; disabled?: boolean }[] = [
    {
      id: "sms",
      icon: MessageSquareText,
      title: "SMS code",
      detail: info.has_phone ? `${info.masked_phone} · ${info.sms_fee_ugx} UGX` : "No phone on this account",
      disabled: !info.has_phone,
    },
    { id: "email", icon: Mail, title: "Email link", detail: maskEmail(info.email) },
  ];

  return (
    <AuthShell
      title="Verify your account"
      subtitle="Confirm it's you with a link to your email or a code to your registered phone"
      seoTitle="Verify Account"
      path="/verify-account"
    >
      <div className="w-full space-y-4">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Verification method">
          {options.map(({ id, icon: Icon, title, detail, disabled }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={method === id}
              disabled={disabled || busy}
              onClick={() => setMethod(id)}
              className={cn(
                "flex flex-col items-start gap-1 rounded border bg-card p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                method === id ? "border-primary ring-2 ring-primary/20" : "border-border hover:bg-muted/50",
              )}
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">{title}</span>
              <span className="w-full truncate text-[11px] text-muted-foreground">{detail}</span>
            </button>
          ))}
        </div>

        {method === "email" ? (
          <div className="space-y-3 rounded border border-border bg-card/50 p-4 text-[13px] text-muted-foreground">
            <p>
              {emailSent
                ? `We sent a new link to ${maskEmail(info.email)}. Open it, then come back and log in.`
                : `We'll email a verification link to ${maskEmail(info.email)}. Links from earlier emails stop working when a new one is sent.`}
            </p>
            <Button type="button" className="h-10 w-full" onClick={sendEmail} disabled={busy || emailCooldown.left > 0}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {emailCooldown.left > 0 ? `Resend link in ${emailCooldown.left}s` : emailSent ? "Resend link" : "Send verification link"}
            </Button>
          </div>
        ) : codeSentTo ? (
          <form className="space-y-3" onSubmit={confirmSms}>
            <p className="text-center text-[13px] text-muted-foreground">Enter the 6-digit code sent to {codeSentTo}</p>
            <CodeInput value={code} onChange={setCode} disabled={busy} />
            <SubmitButton isLoading={busy} disabled={code.length !== 6}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify and continue
            </SubmitButton>
            <button
              type="button"
              onClick={sendSms}
              disabled={busy || smsCooldown.left > 0}
              className="w-full text-center text-[13px] font-medium text-foreground hover:text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              {smsCooldown.left > 0 ? `Resend code in ${smsCooldown.left}s` : `Resend code (${info.sms_fee_ugx} UGX)`}
            </button>
          </form>
        ) : (
          <div className="space-y-3 rounded border border-border bg-card/50 p-4 text-[13px] text-muted-foreground">
            <p>
              We'll text a 6-digit code to <span className="font-medium text-foreground">{info.masked_phone}</span>.{" "}
              Each SMS costs <span className="font-medium text-foreground">{info.sms_fee_ugx} UGX</span>, taken from your SMS balance.
            </p>
            <Button type="button" className="h-10 w-full" onClick={sendSms} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send code
            </Button>
          </div>
        )}
      </div>
      <Link to="/login" onClick={clearVerification} className="mt-8 text-[13px] font-medium text-foreground hover:text-primary hover:underline barlow-semibold">
        Back to login
      </Link>
    </AuthShell>
  );
}

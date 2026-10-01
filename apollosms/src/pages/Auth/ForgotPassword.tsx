import { apollosmsApi } from "@/api/apollosms";
import { cn } from "@/lib/utils";
import { Loader2, Mail, MessageSquareText } from "lucide-react";
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authErrorMessage } from "./auth-errors";
import AuthShell from "./AuthShell";
import { AuthInput, CodeInput, PasswordInput, SubmitButton, useCooldown } from "./auth-ui";

type Channel = "email" | "sms";

const SMS_FEE_UGX = 35;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const cooldown = useCooldown(60);

  const requestReset = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setIsLoading(true);
    try {
      const result = await apollosmsApi.auth.forgotPassword({ email: email.trim(), channel });
      if (channel === "sms") {
        setCodeSentTo(result.masked_phone || "your registered phone");
        setCode("");
        cooldown.start();
        toast.success(`Code sent. ${result.charged_ugx ?? SMS_FEE_UGX} UGX was charged to your SMS balance.`);
      } else {
        toast.success("If the account exists, a reset link is on its way to your email");
        navigate("/login");
      }
    } catch (err: unknown) {
      toast.error(authErrorMessage(err, channel === "sms" ? "Failed to send the reset code" : "Failed to send reset link"));
    } finally {
      setIsLoading(false);
    }
  };

  const resetWithCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) {
      toast.error("Enter the 6-digit code from the SMS");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      await apollosmsApi.auth.resetPasswordWithSms({ email: email.trim(), code, new_password: password });
      toast.success("Password reset. Log in with your new password.");
      navigate("/login", { replace: true });
    } catch (err: unknown) {
      toast.error(authErrorMessage(err, "Failed to reset password"));
    } finally {
      setIsLoading(false);
    }
  };

  if (codeSentTo) {
    return (
      <AuthShell title="Enter reset code" subtitle={`We texted a 6-digit code to ${codeSentTo}`} seoTitle="Forgot Password" path="/forgot-password">
        <form className="w-full space-y-2" onSubmit={resetWithCode}>
          <CodeInput value={code} onChange={setCode} disabled={isLoading} />
          <div className="pt-3" />
          <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" autoComplete="new-password" />
          <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" autoComplete="new-password" />
          <SubmitButton isLoading={isLoading} disabled={code.length !== 6}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Reset Password
          </SubmitButton>
        </form>
        <button
          type="button"
          onClick={() => requestReset()}
          disabled={isLoading || cooldown.left > 0}
          className="mt-4 text-[13px] font-medium text-foreground hover:text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          {cooldown.left > 0 ? `Resend code in ${cooldown.left}s` : `Resend code (${SMS_FEE_UGX} UGX)`}
        </button>
        <button type="button" onClick={() => setCodeSentTo(null)} className="mt-6 text-[13px] text-muted-foreground hover:text-foreground hover:underline font-medium barlow-semibold">
          Use a different method
        </button>
      </AuthShell>
    );
  }

  const channels: { id: Channel; icon: typeof Mail; title: string; detail: string }[] = [
    { id: "email", icon: Mail, title: "Email link", detail: "Free" },
    { id: "sms", icon: MessageSquareText, title: "SMS code", detail: `${SMS_FEE_UGX} UGX per SMS` },
  ];

  return (
    <AuthShell title="Reset password" subtitle="Get a reset link by email or a code on your registered phone" seoTitle="Forgot Password" path="/forgot-password">
      <form className="w-full space-y-2" onSubmit={requestReset}>
        <AuthInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="youremail@mail.host" autoComplete="email" autoFocus />
        <div className="grid grid-cols-2 gap-2 pt-2" role="radiogroup" aria-label="Where to send the reset">
          {channels.map(({ id, icon: Icon, title, detail }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={channel === id}
              onClick={() => setChannel(id)}
              className={cn(
                "flex items-center gap-2 rounded border bg-card p-3 text-left transition-colors",
                channel === id ? "border-primary ring-2 ring-primary/20" : "border-border hover:bg-muted/50",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
              </span>
            </button>
          ))}
        </div>
        {channel === "sms" && (
          <p className="text-[12px] text-muted-foreground">
            The code goes to the phone number you registered with. {SMS_FEE_UGX} UGX is taken from your SMS balance for each SMS.
          </p>
        )}
        <SubmitButton isLoading={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {channel === "sms" ? "Send Code" : "Send Link"}
        </SubmitButton>
      </form>
      <Link to="/login" className="mt-8 text-[13px] text-foreground hover:text-primary hover:underline font-medium barlow-semibold">Back to login</Link>
    </AuthShell>
  );
}

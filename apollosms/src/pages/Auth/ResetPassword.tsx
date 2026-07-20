/* eslint-disable @typescript-eslint/no-explicit-any */
import { apollosmsApi } from "@/api/apollosms";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { authErrorMessage } from "./auth-errors";
import AuthShell from "./AuthShell";
import { AuthInput, PasswordInput, SubmitButton } from "./auth-ui";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token.trim()) {
      toast.error("Reset token is required");
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
      await apollosmsApi.auth.resetPassword({ token: token.trim(), new_password: password });
      toast.success("Password reset");
      navigate("/login", { replace: true });
    } catch (err: unknown) {
      toast.error(authErrorMessage(err, "Failed to reset password"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell title="Create new password" subtitle="Use the reset token from your email link" seoTitle="Reset Password" path="/reset-password">
      <form className="w-full space-y-2" onSubmit={handleSubmit}>
        <AuthInput type="text" required value={token} onChange={(e) => setToken(e.target.value)} placeholder="Reset token" autoComplete="one-time-code" autoFocus />
        <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" autoComplete="new-password" />
        <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" autoComplete="new-password" />
        <SubmitButton isLoading={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Reset Password
        </SubmitButton>
      </form>
      <Link to="/login" className="mt-8 text-[13px] text-foreground hover:text-primary hover:underline font-medium barlow-semibold">Back to login</Link>
    </AuthShell>
  );
}

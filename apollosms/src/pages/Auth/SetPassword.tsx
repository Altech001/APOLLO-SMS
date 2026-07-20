/* eslint-disable @typescript-eslint/no-explicit-any */
import { apollosmsApi } from "@/api/apollosms";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authErrorMessage } from "./auth-errors";
import AuthShell from "./AuthShell";
import { PasswordInput, SubmitButton } from "./auth-ui";

export default function SetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const from = (location.state as any)?.from || "/";

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentPassword) {
      toast.error("Current password is required");
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
      await apollosmsApi.auth.changePassword({
        current_password: currentPassword,
        new_password: password,
        confirm_new_password: confirmPassword,
      });
      await refreshUser();
      toast.success("Password updated");
      navigate(from, { replace: true });
    } catch (err: unknown) {
      toast.error(authErrorMessage(err, "Failed to update password"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell title="Update your password" subtitle={user?.email || "Keep your account credentials current"} seoTitle="Set Password" path="/set-password">
      <form className="w-full space-y-2" onSubmit={handleSubmit}>
        <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" autoComplete="current-password" autoFocus />
        <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="new-password" />
        <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" autoComplete="new-password" />
        <SubmitButton isLoading={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Update Password
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

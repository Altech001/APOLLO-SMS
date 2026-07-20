/* eslint-disable @typescript-eslint/no-explicit-any */
import { apollosmsApi } from "@/api/apollosms";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authErrorMessage } from "./auth-errors";
import AuthShell from "./AuthShell";
import { AuthInput, PasswordInput, SubmitButton } from "./auth-ui";

const REMEMBER_LOGIN_KEY = "lucosms:remember-login-email";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const from = (location.state as any)?.from?.pathname || "/";

  useEffect(() => {
    const rememberedEmail = localStorage.getItem(REMEMBER_LOGIN_KEY);
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, []);

  const finishLogin = async (auth: Awaited<ReturnType<typeof apollosmsApi.auth.login>>, targetPath = from) => {
    if (rememberMe && email.trim()) {
      localStorage.setItem(REMEMBER_LOGIN_KEY, email.trim());
    } else {
      localStorage.removeItem(REMEMBER_LOGIN_KEY);
    }
    login(auth);
    navigate(targetPath, { replace: true });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const auth = await apollosmsApi.auth.login({ email, password });
      await finishLogin(auth);
    } catch (err: unknown) {
      toast.error(authErrorMessage(err, "Failed to log in"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage your billing workspace" seoTitle="Log In" path="/login">
      <div className="w-full">
        <form className="space-y-2" onSubmit={handleSubmit} autoComplete="on">
          <AuthInput type="email" name="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="arethix@sms.xyz" autoComplete="username email" autoFocus />
          <PasswordInput name="password" show={showPassword} onToggle={() => setShowPassword((next) => !next)} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" />
          <div className="flex items-center justify-between gap-3 pt-1">
            <label htmlFor="remember-login" className="flex cursor-pointer rounded-none items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <Checkbox
                className="rounded"
                id="remember-login"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              Remember me
            </label>
            <Link to="/forgot-password" className="text-[13px] text-foreground hover:text-primary hover:underline font-medium text-right">
              Forgot password?
            </Link>
          </div>
          <SubmitButton isLoading={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Log In
          </SubmitButton>
        </form>
      </div>
      <div className="mt-8 text-center">
        <p className="text-[13px] text-muted-foreground font-medium barlow-semibold">
          New to Lucosms? <Link to="/signup" className="text-foreground hover:text-primary hover:underline">Create an account</Link>
        </p>
      </div>
    </AuthShell>
  );
}

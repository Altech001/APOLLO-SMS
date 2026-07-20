/* eslint-disable @typescript-eslint/no-explicit-any */
import { apollosmsApi } from "@/api/apollosms";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authErrorMessage } from "./auth-errors";
import AuthShell from "./AuthShell";
import { AuthInput, PasswordInput, SubmitButton } from "./auth-ui";

const COUNTRIES = [
  { name: "Uganda", code: "+256", flag: "UG", value: "uganda" },
  { name: "Kenya", code: "+254", flag: "KE", value: "kenya" },
  { name: "Tanzania", code: "+255", flag: "TZ", value: "tanzania" },
  { name: "Rwanda", code: "+250", flag: "RW", value: "rwanda" }
];

export default function Signup() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("uganda");
  const [phoneNumber, setPhoneNumber] = useState("+256 ");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleCountryChange = (val: string) => {
    setSelectedCountry(val);
    const selected = COUNTRIES.find((c) => c.value === val);
    if (!selected) return;

    const currentCountry = COUNTRIES.find((c) => phoneNumber.startsWith(c.code));
    if (currentCountry) {
      setPhoneNumber(phoneNumber.replace(currentCountry.code, selected.code));
    } else {
      setPhoneNumber(`${selected.code} ${phoneNumber.trim()}`);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (fullName.trim().length < 2) {
      toast.error("Full name must be at least 2 characters");
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
      await apollosmsApi.auth.register({
        name: fullName.trim(),
        email: email.trim(),
        password,
      });
      toast.success("Account created. Check your email for the verification link.");
      navigate("/login", { replace: true });
    } catch (err: unknown) {
      toast.error(authErrorMessage(err, "Failed to create account"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create account"
      subtitle="Start with your details, then verify your email from the link we send"
      seoTitle="Sign Up"
      path="/signup"
    >
      <div className="w-full">
        <form className="space-y-2" onSubmit={handleSubmit}>
          <AuthInput required minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" autoComplete="name" autoFocus />
          <AuthInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sms@lucosms.com" autoComplete="email" />
          <div className="flex gap-2">
            <Select value={selectedCountry} onValueChange={handleCountryChange}>
              <SelectTrigger className="h-12 bg-card border-border text-foreground w-[110px] shrink-0 flex items-center justify-between px-3">
                <span className="flex items-center gap-1.5 space-x-2">
                  <span className="text-xs font-semibold text-muted-foreground">{COUNTRIES.find(x => x.value === selectedCountry)?.flag}</span>
                  <span className="font-semibold text-xs text-muted-foreground">{COUNTRIES.find(x => x.value === selectedCountry)?.code}</span>
                </span>
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.value} value={c.value} className="cursor-pointer focus:bg-muted">
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">{c.flag}</span>
                      <span className="font-medium text-sm text-foreground">{c.name}</span>
                      <span className="text-xs text-muted-foreground">({c.code})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AuthInput type="tel" minLength={5} maxLength={30} value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="Phone number" autoComplete="tel" className="flex-1" />
          </div>
          <PasswordInput show={showPassword} onToggle={() => setShowPassword((next) => !next)} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="new-password" />
          <PasswordInput show={showConfirmPassword} onToggle={() => setShowConfirmPassword((next) => !next)} required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" autoComplete="new-password" />
          <SubmitButton isLoading={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Create Account
          </SubmitButton>
        </form>
      </div>
      <div className="mt-8 text-center">
        <p className="text-[13px] text-muted-foreground font-medium barlow-semibold">
          Already have an account? <Link to="/login" className="text-foreground hover:text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}

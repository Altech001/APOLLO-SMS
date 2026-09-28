/* eslint-disable @typescript-eslint/no-explicit-any */
import { apollosmsApi } from "@/api/apollosms";
import { DEFAULT_COUNTRY, PhoneInput, toE164 } from "@/components/auth/PhoneInput";
import type { CountryCode } from "libphonenumber-js";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authErrorMessage } from "./auth-errors";
import AuthShell from "./AuthShell";
import { AuthInput, PasswordInput, SubmitButton } from "./auth-ui";
import { saveVerification } from "./verification-state";

export default function Signup() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const phoneE164 = toE164(country, phoneNumber);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (fullName.trim().length < 2) {
      toast.error("Full name must be at least 2 characters");
      return;
    }
    if (!phoneE164) {
      setPhoneTouched(true);
      toast.error("Enter a valid phone number for the selected country");
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
      const { verification } = await apollosmsApi.auth.register({
        name: fullName.trim(),
        email: email.trim(),
        phone: phoneE164,
        password,
      });
      toast.success("Account created. Verify it with the email link or an SMS code.");
      if (verification) {
        saveVerification(verification);
        navigate("/verify-account", { replace: true, state: { verification } });
      } else {
        navigate("/login", { replace: true });
      }
    } catch (err: unknown) {
      toast.error(authErrorMessage(err, "Failed to create account"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create account"
      subtitle="Start with your details, then verify by email link or an SMS code to your phone"
      seoTitle="Sign Up"
      path="/signup"
    >
      <div className="w-full">
        <form className="space-y-2" onSubmit={handleSubmit}>
          <AuthInput required minLength={2} maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" autoComplete="name" autoFocus />
          <AuthInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sms@lucosms.com" autoComplete="email" />
          <div onBlur={() => setPhoneTouched(true)}>
            <PhoneInput
              country={country}
              onCountryChange={setCountry}
              value={phoneNumber}
              onChange={setPhoneNumber}
              invalid={phoneTouched && phoneNumber.trim() !== "" && !phoneE164}
            />
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

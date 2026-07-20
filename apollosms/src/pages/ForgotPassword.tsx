import { renultApi } from "@/api/apollosms";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      await renultApi.auth.forgotPassword({ email });
      toast.success("Reset code sent to your email");
      navigate(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset code");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4 font-sans relative overflow-hidden">
      <Helmet><link rel="preload" as="image" href="/bg/bg.png" /></Helmet>
      <SEO title="Forgot Password" path="/forgot-password" />
      <img src="/bg/bg.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.04] blur-sm pointer-events-none select-none z-0" />
      <div className="w-full max-w-[360px] flex flex-col items-center z-10 pb-16">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 flex items-center justify-center mb-3">
            <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
          </div>
          <h2 className="text-[22px] font-bold text-slate-800 mb-1">Reset password</h2>
          <p className="text-[13px] text-slate-500">Enter your email to receive a reset code</p>
        </div>
        <form className="w-full space-y-2" onSubmit={handleSubmit}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="youremail@mail.host"
            autoFocus
          />
          <Button type="submit" disabled={isLoading} className="w-full h-10 mt-2 font-medium">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Send Code
          </Button>
        </form>
        <Link to="/login" className="mt-8 text-[13px] text-slate-900 hover:underline font-medium">Back to login</Link>
      </div>
      <div className="absolute bottom-6 flex flex-wrap items-center justify-center gap-6 text-[10px] text-slate-500 font-bold w-full px-4">
        <span>ForeForm © {new Date().getFullYear()}</span>
      </div>
    </div>
  );
}

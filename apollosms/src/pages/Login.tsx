import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";

import { renultApi } from '@/api/apollosms';
import { useAuth } from '@/lib/auth';
import { GoogleLogin } from '@react-oauth/google';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [step, setStep] = useState<'email' | 'password'>('email');
    const [showPassword, setShowPassword] = useState(false);
    const from = (location.state as any)?.from?.pathname || "/";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (step === 'email') {
            if (!email) {
                toast.error('Please enter your email');
                return;
            }
            setStep('password');
            return;
        }

        setIsLoading(true);
        try {
            const auth = await renultApi.auth.login({ email, password });
            login(auth);
            navigate(from, { replace: true });
        } catch (err: any) {
            toast.error(err.message || 'Failed to login');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4 font-sans relative overflow-hidden">
            <Helmet>
                <link rel="preload" as="image" href="/bg/bg.png" />
            </Helmet>
            <SEO title="Log In" path="/login" />

            {/* Faded Background Image */}
            <img
                src="/bg/bg.png"
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-[0.04] blur-sm pointer-events-none select-none z-0"
            />

            <div className="w-full max-w-[360px] flex flex-col items-center z-10 pb-16">
                {/* Logo & Header */}
                <div className="text-center mb-6">
                    <div className="mx-auto w-12 h-12 flex items-center justify-center mb-3">
                        <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
                    </div>
                    <h2 className="text-[22px] font-bold text-slate-800 mb-1">ForeForm</h2>
                    <p className="text-[13px] text-slate-500">Elevate your customer experience with AI agents</p>
                </div>

                {/* Social Logins */}
                {step === 'email' && (
                    <div className="w-full space-y-2 mb-6">
                        <div className="w-full flex justify-center h-10">
                            <GoogleLogin
                                onSuccess={async (credentialResponse) => {
                                    if (credentialResponse.credential) {
                                        setIsLoading(true);
                                        try {
                                            const auth = await renultApi.auth.google({ id_token: credentialResponse.credential });
                                            login(auth);
                                            navigate('/set-password', { replace: true, state: { from } });
                                        } catch (err: any) {
                                            toast.error(err.message || 'Google Login failed');
                                        } finally {
                                            setIsLoading(false);
                                        }
                                    }
                                }}
                                onError={() => {
                                    toast.error('Google Login failed');
                                }}
                                useOneTap={true}
                                shape="rectangular"
                                size="large"
                                text="continue_with"
                                logo_alignment="center"
                                width="360"

                            />
                        </div>
                    </div>
                )}

                {/* Divider */}
                {step === 'email' && (
                    <div className="w-full flex items-center mb-6">
                        <div className="flex-1 h-[1px] bg-slate-200"></div>
                        <span className="px-3 text-[11px] text-slate-300 font-medium uppercase">or</span>
                        <div className="flex-1 h-[1px] bg-slate-200"></div>
                    </div>
                )}

                {/* Form */}
                <form className="w-full space-y-2 relative" onSubmit={handleSubmit}>
                    {step === 'password' && (
                        <div className="mb-4">
                            <div className="flex items-center justify-between p-3 border border-slate-200 rounded bg-slate-50 mb-2">
                                <span className="text-[13px] text-slate-700 font-medium truncate">{email}</span>
                                <button
                                    type="button"
                                    onClick={() => setStep('email')}
                                    className="text-[12px] text-primary hover:underline font-medium"
                                >
                                    Edit
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'email' ? (
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all "
                            placeholder="info@lucosms"
                            autoFocus
                        />
                    ) : (
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-3 py-2 pr-10 bg-white border border-slate-200 rounded text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all "
                                placeholder="Password"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    )}

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-10 mt-2 font-medium "
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        {step === 'email' ? 'Continue' : 'Login'}
                    </Button>
                </form>

                {/* Footer Links */}
                <div className="mt-8 text-center">
                    {step === 'password' && (
                        <Link to="/forgot-password" className="block mb-3 text-[13px] text-slate-900 hover:underline font-medium">
                            Forgot password?
                        </Link>
                    )}
                    <p className="text-[13px] text-slate-600 font-medium">
                        Don't have an account?{' '}
                        <Link to="/signup" className="text-slate-900 hover:underline">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>

            {/* Absolute Bottom Footer */}
            <div className="absolute bottom-6 flex flex-wrap items-center justify-center gap-6 text-[10px] text-slate-500 font-bold w-full px-4">
                <span>ForeForm © {new Date().getFullYear()}</span>
            </div>
        </div>
    );
}

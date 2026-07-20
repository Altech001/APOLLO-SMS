/* eslint-disable @typescript-eslint/no-explicit-any */
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";

import { renultApi } from '@/api/apollosms';
import { useAuth } from '@/lib/auth';
import { GoogleLogin } from '@react-oauth/google';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function Signup() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [code, setCode] = useState('');
    const [step, setStep] = useState<'details' | 'password' | 'verify'>('details');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const calculateStrength = (pass: string) => {
        if (!pass) return 0;
        let score = 0;
        if (pass.length >= 8) score += 1;
        if (pass.length >= 8) score += 1;
        if (/[A-Z]/.test(pass)) score += 1;
        if (/[0-9]/.test(pass)) score += 1;
        if (/[^A-Za-z0-9]/.test(pass)) score += 1;
        return Math.min(score, 4);
    };
    
    const strength = calculateStrength(password);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (step === 'details') {
            if (!name || !email || !phoneNumber) {
                toast.error('Please enter your name, email, and phone number');
                return;
            }
            setStep('password');
            return;
        }

        if (step === 'verify') {
            if (code.length !== 6) {
                toast.error('Please enter the 6 digit code');
                return;
            }
            setIsLoading(true);
            try {
                const auth = await renultApi.auth.verifyEmail({ email, code });
                login(auth);
                toast.success('Account verified!');
                navigate('/');
            } catch (err: any) {
                toast.error(err.message || 'Failed to verify email');
            } finally {
                setIsLoading(false);
            }
            return;
        }

        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }
        if (password.length < 8) {
            toast.error('Password must be at least 8 characters');
            return;
        }

        setIsLoading(true);
        try {
            await renultApi.auth.register({ email, full_name: name, phone_number: phoneNumber, password });
            toast.success('Account created. Check your email for the code.');
            setStep('verify');
        } catch (err: any) {
            toast.error(err.message || 'Failed to register account');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-4 font-sans relative overflow-hidden">
            <Helmet>
                <link rel="preload" as="image" href="/bg/bg.png" />
            </Helmet>
            <SEO title="Sign Up" path="/signup" />

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
                {step === 'details' && (
                    <div className="w-full space-y-2 mb-6">
                        <div className="w-full flex justify-center h-10">
                            <GoogleLogin
                                onSuccess={async (credentialResponse) => {
                                    if (credentialResponse.credential) {
                                        setIsLoading(true);
                                        try {
                                            const auth = await renultApi.auth.google({ id_token: credentialResponse.credential, full_name: name || undefined, phone_number: phoneNumber || undefined });
                                            login(auth);
                                            navigate('/set-password', { replace: true });
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
                {step === 'details' && (
                    <div className="w-full flex items-center mb-6">
                        <div className="flex-1 h-[1px] bg-slate-200"></div>
                        <span className="px-3 text-[11px] text-slate-300 font-medium uppercase">or</span>
                        <div className="flex-1 h-[1px] bg-slate-200"></div>
                    </div>
                )}

                {/* Form */}
                <form className="w-full space-y-2 relative" onSubmit={handleSubmit}>
                    {step !== 'details' && (
                        <div className="mb-4">
                            <div className="flex items-center justify-between p-3 border border-slate-200 rounded bg-slate-50 mb-2">
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-[13px] text-slate-700 font-medium truncate">{name}</span>
                                    <span className="text-[12px] text-slate-500 truncate">{email}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setStep('details')}
                                    className="text-[12px] text-primary hover:underline font-medium whitespace-nowrap ml-2"
                                >
                                    Edit
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'details' ? (
                        <>
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all "
                                placeholder="Full Name"
                                autoFocus
                            />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all "
                                placeholder="youremail@mail.host"
                            />
                            <input
                                type="tel"
                                required
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all "
                                placeholder="+256 700 000000"
                            />
                        </>
                    ) : step === 'password' ? (
                        <div className="space-y-3">
                            <div>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        minLength={8}
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
                                {/* Password Strength Indicator */}
                                {password.length > 0 && (
                                    <div className="flex items-center gap-1 mt-2 px-1">
                                        {[1, 2, 3, 4].map((level) => (
                                            <div 
                                                key={level} 
                                                className={`h-[4px] flex-1 rounded-full transition-colors duration-300 ${
                                                    strength >= level 
                                                        ? strength <= 1 
                                                            ? 'bg-red-500' 
                                                            : strength === 2 
                                                                ? 'bg-orange-400' 
                                                                : strength === 3
                                                                    ? 'bg-yellow-500'
                                                                    : 'bg-green-500' 
                                                        : 'bg-slate-200'
                                                }`} 
                                            />
                                        ))}
                                        <span className="text-[10px] text-slate-500 ml-2 w-10 text-right font-medium">
                                            {strength <= 1 ? 'Weak' : strength === 2 ? 'Fair' : strength === 3 ? 'Good' : 'Strong'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    required
                                    minLength={8}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={`w-full px-3 py-2 pr-10 bg-white border rounded text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                                        confirmPassword && password !== confirmPassword ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200'
                                    }`}
                                    placeholder="Confirm Password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {confirmPassword && password !== confirmPassword && (
                                <p className="text-[11px] text-red-500 font-medium px-1">Passwords do not match</p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <input
                                type="text"
                                inputMode="numeric"
                                required
                                minLength={6}
                                maxLength={6}
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded text-[18px] tracking-[0.35em] text-center text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all "
                                placeholder="000000"
                                autoFocus
                            />
                            <button
                                type="button"
                                disabled={isLoading}
                                onClick={async () => {
                                    try {
                                        await renultApi.auth.resendCode({ email });
                                        toast.success('Verification code sent');
                                    } catch (err: any) {
                                        toast.error(err.message || 'Failed to resend code');
                                    }
                                }}
                                className="text-[12px] text-slate-900 hover:underline font-medium"
                            >
                                Resend code
                            </button>
                        </div>
                    )}

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-10 mt-4 font-medium "
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        {step === 'details' ? 'Continue' : step === 'password' ? 'Sign Up' : 'Verify Account'}
                    </Button>
                </form>

                {/* Footer Links */}
                <div className="mt-8 text-center">
                    <p className="text-[13px] text-slate-600 font-medium">
                        Already have an account?{' '}
                        <Link to="/login" className="text-slate-900 hover:underline">
                            Sign in
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

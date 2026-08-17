import Link from "next/link";
import { Shield, ArrowLeft } from "lucide-react";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen flex flex-col bg-bg-dark text-text-primary">
            {/* Header */}
            <header className="py-4 px-6 sm:px-8 border-b border-border-color flex justify-between items-center bg-bg-surface/80 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-2.5">
                    <Shield size={24} className="text-accent-primary" />
                    <span className="font-bold text-lg text-text-primary tracking-tight">InfoSec Tools</span>
                    <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[0.7rem] font-semibold bg-accent-glow text-accent-primary border border-accent-primary/20">
                        Public Portal
                    </span>
                </div>
                <Link 
                    href="/login" 
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-border-color bg-bg-surface hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary text-xs font-semibold transition-colors no-underline cursor-pointer"
                >
                    <ArrowLeft size={14} />
                    <span>Return to Login</span>
                </Link>
            </header>
            
            {/* Main scrollable body */}
            <main className="flex-1 flex justify-center py-10 px-4 sm:px-6">
                <div className="w-full max-w-2xl">
                    {children}
                </div>
            </main>

            {/* Footer */}
            <footer className="py-6 px-4 text-center text-text-muted text-xs border-t border-border-color bg-bg-surface/40">
                &copy; {new Date().getFullYear()} Information Security Secure Utilities. All rights reserved.
            </footer>
        </div>
    );
}

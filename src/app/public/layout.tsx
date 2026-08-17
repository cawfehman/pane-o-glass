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
            <header className="py-4 px-6 sm:px-10 border-b border-border-color flex justify-between items-center bg-bg-surface/90 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent-glow border border-accent-primary/20 text-accent-primary">
                        <Shield size={24} />
                    </div>
                    <div>
                        <span className="font-bold text-lg text-text-primary tracking-tight block leading-tight">InfoSec Tools</span>
                        <span className="text-xs text-text-muted">Password Safety Portal</span>
                    </div>
                </div>
                <Link 
                    href="/login" 
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-color bg-bg-surface hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary text-sm font-semibold transition-colors no-underline cursor-pointer"
                >
                    <ArrowLeft size={16} />
                    <span>Return to Login</span>
                </Link>
            </header>
            
            {/* Main scrollable body with generous width */}
            <main className="flex-1 flex justify-center py-10 px-4 sm:px-8">
                <div className="w-full max-w-3xl">
                    {children}
                </div>
            </main>

            {/* Footer */}
            <footer className="py-6 px-4 text-center text-text-muted text-sm border-t border-border-color bg-bg-surface/40">
                &copy; {new Date().getFullYear()} Information Security Secure Utilities. All rights reserved.
            </footer>
        </div>
    );
}

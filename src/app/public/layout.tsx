import Link from "next/link";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="app-shell flex flex-col min-h-screen bg-bg-dark">
            <header className="py-6 px-8 border-b border-border-color flex justify-between items-center bg-bg-surface">
                <div className="brand text-2xl font-bold flex items-center gap-2">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="3" y1="9" x2="21" y2="9"></line>
                        <line x1="9" y1="21" x2="9" y2="9"></line>
                    </svg>
                    InfoSec Tools <span className="text-text-muted text-[0.9rem] ml-2">Security Tools</span>
                </div>
                <Link href="/login" className="btn-secondary no-underline">
                    Return to Login
                </Link>
            </header>
            
            <main className="flex-1 flex justify-center py-12 px-4">
                <div className="w-full max-w-[1000px]">
                    {children}
                </div>
            </main>

            <footer className="p-8 text-center text-text-muted text-sm border-t border-border-color">
                &copy; {new Date().getFullYear()} Information Security Secure Utilities
            </footer>
        </div>
    );
}

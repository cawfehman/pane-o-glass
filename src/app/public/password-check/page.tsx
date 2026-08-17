import PasswordCheckCard from "@/components/PasswordCheckCard";
import { KeyRound, ShieldCheck } from "lucide-react";

export const metadata = {
    title: "Password Safety Check | InfoSec Tools",
    description: "Safely check if your password has appeared in known public data leaks.",
};

export default function PublicPasswordCheckPage() {
    return (
        <div className="flex flex-col items-center gap-8 w-full">
            {/* Header */}
            <div className="text-center max-w-2xl">
                <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-accent-glow text-accent-primary border border-accent-primary/20 mb-4 shadow-xl shadow-accent-primary/10">
                    <KeyRound size={32} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight mb-3">
                    Password Safety Check
                </h1>
                <p className="text-base sm:text-lg text-text-secondary leading-relaxed">
                    Check if a password has been leaked in known data breaches. 
                    This test is <strong className="text-text-primary">100% private</strong> — your password is never sent over the internet or saved.
                </p>
            </div>

            {/* Check Card & Explanations */}
            <div className="w-full">
                <PasswordCheckCard />
            </div>
        </div>
    );
}

import PasswordCheckCard from "@/components/PasswordCheckCard";
import { KeyRound } from "lucide-react";

export const metadata = {
    title: "Password Risk Check | InfoSec Tools",
    description: "Check if your password has been compromised in a data breach safely and privately.",
};

export default function PublicPasswordCheckPage() {
    return (
        <div className="flex flex-col items-center">
            {/* Title Header */}
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-accent-glow text-accent-primary border border-accent-primary/20 mb-3 shadow-lg shadow-accent-primary/10">
                    <KeyRound size={28} />
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-text-primary mb-2 tracking-tight">
                    Password Safety Check
                </h1>
                <p className="text-text-secondary text-sm max-w-lg mx-auto leading-relaxed">
                    Verify if your password appears in billions of exposed data breaches using client-side <strong>k-Anonymity</strong> verification.
                </p>
            </div>

            {/* Check Card */}
            <div className="w-full">
                <PasswordCheckCard />
            </div>
        </div>
    );
}

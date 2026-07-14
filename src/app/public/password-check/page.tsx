import PasswordCheckCard from "@/components/PasswordCheckCard";
import Link from "next/link";

export const metadata = {
    title: "Password Risk Check | InfoSec Tools",
    description: "Check if your password has been compromised in a data breach safely and privately.",
};

export default function PublicPasswordCheckPage() {
    return (
        <div>
            <div className="text-center mb-12">
                <h1 className="text-4xl mb-4">Password Safety Check</h1>
                <p className="text-text-secondary max-w-[600px] mx-auto">
                    Use our secure, k-anonymity based tool to verify if your passwords have appeared in known data breaches. 
                    <strong> No data is sent to our servers.</strong>
                </p>
            </div>

            <div className="max-w-[600px] mx-auto">
                <PasswordCheckCard />
            </div>


        </div>
    );
}

import PasswordCheckCard from "@/components/PasswordCheckCard";
import Link from "next/link";

export const metadata = {
    title: "Password Risk Check | InfoSec Tools",
    description: "Check if your password has been compromised in a data breach safely and privately.",
};

export default function PublicPasswordCheckPage() {
    return (
        <div>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Password Safety Check</h1>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
                    Use our secure, k-anonymity based tool to verify if your passwords have appeared in known data breaches. 
                    <strong> No data is sent to our servers.</strong>
                </p>
            </div>

            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                <PasswordCheckCard />
            </div>


        </div>
    );
}

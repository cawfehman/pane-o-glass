import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import SessionTimeout from "@/components/SessionTimeout";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="app-shell">
            <SessionTimeout />
            <Sidebar />
            <main className="main-content">
                <Topbar />
                <div className="page-container">
                    {children}
                </div>
            </main>
        </div>
    );
}

import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="app-shell">
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

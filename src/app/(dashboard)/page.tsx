export default function DashboardHome() {
    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>Dashboard Overview</h1>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                <div className="glass-card">
                    <h3 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>System Status</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-primary)' }}>Online</p>
                    <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>All services operational</p>
                </div>

                <div className="glass-card">
                    <h3 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Local Accounts</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 700 }}>3</p>
                    <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>Active administrative users</p>
                </div>

                <div className="glass-card">
                    <h3 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Pending Queries</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 700 }}>0</p>
                    <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>No background tasks</p>
                </div>
            </div>

            <div className="glass-card" style={{ marginTop: '24px' }}>
                <h3 style={{ marginBottom: '16px' }}>Recent Activity</h3>
                <p style={{ color: 'var(--text-secondary)' }}>System boot completed successfully at {new Date().toLocaleTimeString()}</p>
            </div>
        </div>
    )
}

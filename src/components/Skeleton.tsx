export default function Skeleton({ width = '100%', height = '20px', borderRadius = '4px', className = '' }: { width?: string, height?: string, borderRadius?: string, className?: string }) {
    return (
        <div 
            className={`skeleton-loader ${className}`}
            style={{ 
                width, 
                height, 
                borderRadius,
                background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--border-color) 50%, var(--bg-surface) 75%)',
                backgroundSize: '200% 100%',
                animation: 'skeleton-loading 1.5s infinite'
            }}
        />
    );
}

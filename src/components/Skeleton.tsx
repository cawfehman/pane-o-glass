export default function Skeleton({ width = '100%', height = '20px', borderRadius = '4px', className = '' }: { width?: string, height?: string, borderRadius?: string, className?: string }) {
    return (
        <div 
            className={`skeleton-loader bg-[linear-gradient(90deg,var(--bg-surface)_25%,var(--border-color)_50%,var(--bg-surface)_75%)] bg-[length:200%_100%] animate-[skeleton-loading_1.5s_infinite] ${className}`}
            style={{ 
                width, 
                height, 
                borderRadius
            }}
        />
    );
}

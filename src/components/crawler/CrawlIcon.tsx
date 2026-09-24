import React from "react";

export interface CrawlIconProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string;
    className?: string;
    color?: string;
}

/**
 * CrawlIcon - Distinctive cyber crawler / network spider icon
 * Used across the network topology and drawer to trigger device crawl seeding.
 */
export function CrawlIcon({
    size = 16,
    className = "",
    color = "currentColor",
    ...props
}: CrawlIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            {...props}
        >
            {/* Forward Sensory Probes / Antennae */}
            <path d="M10.8 5.2 L8.5 2.5" />
            <path d="M13.2 5.2 L15.5 2.5" />

            {/* Sensor Head Node */}
            <circle cx="12" cy="7" r="1.8" fill={color} fillOpacity="0.25" />

            {/* Core Body Chassis */}
            <ellipse cx="12" cy="14" rx="3.2" ry="4" fill={color} fillOpacity="0.15" />

            {/* Radar / Scanner Pulse Center Dot */}
            <circle cx="12" cy="14" r="1.1" fill={color} />

            {/* Crawler Articulated Legs (4 on each side) */}
            {/* Pair 1 - Forward scanning legs */}
            <path d="M9.5 9 C 6.5 7, 4 8.5, 3 11" />
            <path d="M14.5 9 C 17.5 7, 20 8.5, 21 11" />

            {/* Pair 2 - Upper traversal legs */}
            <path d="M9 12 C 5 11, 2.5 13, 2 15" />
            <path d="M15 12 C 19 11, 21.5 13, 22 15" />

            {/* Pair 3 - Lower traversal legs */}
            <path d="M9 15 C 5.5 16, 3 18, 3 20.5" />
            <path d="M15 15 C 18.5 16, 21 18, 21 20.5" />

            {/* Pair 4 - Rear anchoring legs */}
            <path d="M10 17 C 8 19, 6.5 21, 6.5 22.5" />
            <path d="M14 17 C 16 19, 17.5 21, 17.5 22.5" />
        </svg>
    );
}

export default CrawlIcon;

/**
 * Comprehensive ISP & Network Classification Utility
 *
 * Classifies origin networks into:
 * 1. Residential & Business ISPs (Comcast, Verizon Business, Spectrum, AT&T Business, etc.)
 *    - Processed via 3-Strike Reputation Ledger & Guardian Safety Shield
 *    - Eligible for Single-User Grace and Multi-Employee Household protections
 *    - 7-day TTL on Security Intelligence feeds
 * 2. Cloud VPS / Datacenter Providers (AWS, Azure, DigitalOcean, Hetzner, etc.)
 *    - Bypasses strike system: immediate indefinite retention / permanent blacklist
 */

export const RESIDENTIAL_ISP_KEYWORDS: readonly string[] = [
    // Major US MSOs & Business / Residential Providers
    "comcast",              // Comcast Cable & Comcast Business Communications
    "xfinity",
    "charter",              // Charter Communications & Charter Business
    "spectrum",             // Spectrum & Spectrum Business
    "verizon",              // Verizon Fios, Verizon Business, Verizon Wireless
    "mci communications",   // Verizon Business core AS701 / MCI
    "mcics",                // MCI Communications Services
    "uunet",                // UUNET / Verizon Business
    "alter.net",            // AlterNet / Verizon Business reverse DNS / transit
    "xo communications",    // XO Communications (Verizon Business)
    "at&t",                 // AT&T Services, AT&T Business, SBC
    "att",
    "sbcglobal",
    "bellsouth",
    "ameritech",
    "cox",                  // Cox Communications & Cox Business
    "coxbusiness",
    "optimum",              // Optimum, Altice Business, Suddenlink
    "altice",
    "cablevision",
    "suddenlink",
    "lightpath",
    "centurylink",          // CenturyLink, Lumen Technologies, Qwest, Level 3
    "lumen",
    "level 3",
    "level3",
    "qwest",
    "frontier",             // Frontier Communications & Frontier Business
    "t-mobile",             // T-Mobile USA & T-Mobile for Business
    "sprint",
    "mediacom",             // Mediacom Business
    "breezeline",           // Breezeline & Atlantic Broadband
    "atlantic broadband",
    "windstream",           // Windstream Communications & Kinetic Business
    "kinetic",
    "astound",              // Astound Broadband, RCN, Grande, Wave
    "rcn",
    "grandecom",
    "wave broadband",
    "brightspeed",          // Brightspeed
    "consolidated",         // Consolidated Communications
    "crown castle",         // Crown Castle Fiber
    "zayo",                 // Zayo Group Business Transport / DIA
    "cogent",               // Cogent Communications Dedicated Internet Access
    "tds",                  // TDS Telecom
    "altafiber",            // Altafiber & Cincinnati Bell
    "cincinnati bell",
    "spacex",               // SpaceX Starlink Satellite
    "starlink",
    "hughes",               // HughesNet
    "viasat",
    "midco",
    "sparklight",
    "cable one",
    "metronet",
    "ziply",
    "ezee",
    "northland",
    "blue stream",
    "penteledata",
    "liveoak",

    // Generic Carrier & Business Broadband Keywords
    "broadband",
    "cable",
    "telecom",
    "fiber",
    "wireless",
    "internet service",
    "internet services",
    "communication service",
    "communications service",
    "business internet",
    "business broadband",
    "business class",
    "business fiber",
    "business ethernet"
];

export const CLOUD_VPS_KEYWORDS: readonly string[] = [
    "amazon",
    "aws",
    "digitalocean",
    "microsoft azure",
    "microsoft corporation",
    "google cloud",
    "google llc",
    "ovh",
    "hetzner",
    "linode",
    "akamai connected cloud",
    "choopa",
    "vultr",
    "contabo",
    "m247",
    "hostinger",
    "leaseweb",
    "kamatera",
    "tzulo",
    "datacamp",
    "sharktech",
    "psychz",
    "ionos",
    "upcloud",
    "scaleway",
    "hostwinds",
    "hosting",
    "datacenter",
    "vps"
];

/**
 * Evaluates whether an organization or network name represents a residential or business ISP connection.
 * Comcast Business, Verizon Business, Spectrum Business, etc., are all classified similar to residential IPs
 * because legitimate Cooper staff and clinicians routinely authenticate from these commercial connections.
 */
export function isResidential(org?: string | null): boolean {
    if (!org) return false;
    const lower = org.toLowerCase();

    // Guard: Hosting / Cloud VPS providers are never classified as residential or business ISPs
    const isExplicitCloud = CLOUD_VPS_KEYWORDS.some((kw) => lower.includes(kw));
    const isExplicitIspOverride =
        lower.includes("comcast") ||
        lower.includes("verizon") ||
        lower.includes("at&t") ||
        lower.includes("att") ||
        lower.includes("charter") ||
        lower.includes("spectrum") ||
        lower.includes("cox") ||
        lower.includes("frontier") ||
        lower.includes("centurylink") ||
        lower.includes("lumen") ||
        lower.includes("crown castle") ||
        lower.includes("zayo") ||
        lower.includes("cogent");

    if (isExplicitCloud && !isExplicitIspOverride) {
        return false;
    }

    // Direct match against known residential and business ISP keywords
    if (RESIDENTIAL_ISP_KEYWORDS.some((kw) => lower.includes(kw))) {
        return true;
    }

    // Check if the organization explicitly indicates a business ISP / connectivity service
    if (lower.includes("business")) {
        const businessIspIndicators = [
            "isp",
            "internet",
            "broadband",
            "cable",
            "telecom",
            "communication",
            "fiber",
            "wireless",
            "carrier",
            "network",
            "ethernet",
            "access",
            "transit",
        ];
        if (businessIspIndicators.some((ind) => lower.includes(ind))) {
            return true;
        }
    }

    return false;
}

export const isResidentialOrg = isResidential;

/**
 * Checks whether an organization is a Cloud VPS or Datacenter provider.
 * Residential and business ISPs are strictly excluded.
 */
export function isCloudVpsOrg(org?: string | null): boolean {
    if (!org) return false;
    if (isResidential(org)) return false;
    const lower = org.toLowerCase();
    return CLOUD_VPS_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Detects whether a connection is specifically from an ISP's business-tier offering
 * (e.g., Comcast Business, Verizon Business, Spectrum Business).
 */
export function isBusinessIsp(companyName?: string | null, companyType?: string | null): boolean {
    if (!companyName && !companyType) return false;
    const isIsp = isResidential(companyName) || companyType?.toLowerCase() === "isp";
    if (!isIsp) return false;

    const lowerName = (companyName || "").toLowerCase();
    const lowerType = (companyType || "").toLowerCase();

    return (
        lowerType === "business" ||
        lowerName.includes("business") ||
        lowerName.includes("commercial") ||
        lowerName.includes("enterprise") ||
        lowerName.includes("mci communications") ||
        lowerName.includes("uunet") ||
        lowerName.includes("crown castle") ||
        lowerName.includes("zayo") ||
        lowerName.includes("cogent")
    );
}

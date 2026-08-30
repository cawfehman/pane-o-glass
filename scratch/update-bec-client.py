import re

file_path = "src/components/bec/BecDashboardClient.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update State Variables
state_target = '    const [hasSearchedUrls, setHasSearchedUrls] = useState<boolean>(false);\n    const [copiedId, setCopiedId] = useState<string | null>(null);'
state_replacement = '''    const [hasSearchedUrls, setHasSearchedUrls] = useState<boolean>(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [urlSearchUmbrellaSummary, setUrlSearchUmbrellaSummary] = useState<any>(null);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [filterMaliciousOnly, setFilterMaliciousOnly] = useState<boolean>(false);
    const [filterNodOnly, setFilterNodOnly] = useState<boolean>(false);
    const [filterRareOnly, setFilterRareOnly] = useState<boolean>(false);'''

content = content.replace(state_target, state_replacement)

# 2. Update executeUrlSearch callback
search_target = '''            const res = await fetch(`/api/bec/urls/search?${params.toString()}`, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            setUrlSearchResults(data.urls || []);
            setUrlSearchTotalMatches(data.totalMatches || 0);
            setUrlSearchTotalDbCount(data.totalDatabaseUrls || 0);
            setUrlSearchSpeedMs(data.responseTimeMs || null);'''

search_replacement = '''            const res = await fetch(`/api/bec/urls/search?${params.toString()}`, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            setUrlSearchResults(data.urls || []);
            setUrlSearchUmbrellaSummary(data.umbrellaSummary || null);
            setUrlSearchTotalMatches(data.totalMatches || 0);
            setUrlSearchTotalDbCount(data.totalDatabaseUrls || 0);
            setUrlSearchSpeedMs(data.responseTimeMs || null);'''

content = content.replace(search_target, search_replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated BecDashboardClient.tsx state & search callback!")

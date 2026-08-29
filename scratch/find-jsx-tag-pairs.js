const fs = require('fs');
const content = fs.readFileSync('src/components/bec/BecDashboardClient.tsx', 'utf8');

const lines = content.split('\n');
let openTags = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Find JSX opening tags like <div ...> or <table ...> (ignore generic <Type>)
    const openMatches = line.matchAll(/<([a-zA-Z0-9]+)\b([^/>]*)/g);
    for (const m of openMatches) {
        const tag = m[1];
        const rest = m[2];
        if (rest.trim().endsWith('/')) continue; // self-closing
        if (['React', 'useState', 'useEffect', 'useCallback', 'useMemo', 'Set', 'Record', 'Array', 'Prisma', 'NextResponse', 'M365AuthEndpoint', 'GraylogBecImpersonationAggregation', 'GraylogTopDomainAggregation', 'GraylogThirdPartyOAuthAggregation'].includes(tag)) continue;

        openTags.push({ tag, line: i + 1 });
    }

    const closeMatches = line.matchAll(/<\/([a-zA-Z0-9]+)>/g);
    for (const m of closeMatches) {
        const tag = m[1];
        if (openTags.length > 0) {
            let foundIndex = -1;
            for (let k = openTags.length - 1; k >= 0; k--) {
                if (openTags[k].tag === tag) {
                    foundIndex = k;
                    break;
                }
            }
            if (foundIndex !== -1) {
                openTags.splice(foundIndex, 1);
            } else {
                console.log(`L${i + 1}: Closing </${tag}> has no matching opening tag!`);
            }
        }
    }
}

console.log("\nUnclosed tags remaining:");
console.log(openTags);

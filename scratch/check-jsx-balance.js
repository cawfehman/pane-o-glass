const fs = require('fs');
const content = fs.readFileSync('src/components/bec/BecDashboardClient.tsx', 'utf8');

const lines = content.split('\n');
let divDepth = 0;
let braceDepth = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Count { and }
    for (const char of line) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
    }

    if (braceDepth < 0 || line.includes('activeTab') || i > 1250) {
        console.log(`L${i + 1} (braceDepth: ${braceDepth}): ${line}`);
    }
}

console.log(`Final braceDepth: ${braceDepth}`);

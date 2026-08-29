const fs = require('fs');
const babel = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const content = fs.readFileSync('src/components/bec/BecDashboardClient.tsx', 'utf8');

const lines = content.split('\n');

const stack = [];

// Custom simple parser to track opening and closing JSX tags line by line
let lineNum = 0;
for (const line of lines) {
    lineNum++;
    const matches = line.matchAll(/<\/?([a-zA-Z0-9.-]+)[^>]*\/?>/g);
    for (const match of matches) {
        const full = match[0];
        const tag = match[1];

        if (full.endsWith('/>') || full.startsWith('<?') || full.startsWith('<!')) {
            continue; // Self closing
        }

        if (full.startsWith('</')) {
            if (stack.length > 0 && stack[stack.length - 1].tag === tag) {
                stack.pop();
            } else {
                console.log(`L${lineNum}: Closing tag </${tag}> mismatched! Stack top was:`, stack[stack.length - 1]);
            }
        } else {
            stack.push({ tag, lineNum, full: full.slice(0, 40) });
        }
    }
}

console.log("\nRemaining unclosed JSX tags on stack:");
console.log(stack);

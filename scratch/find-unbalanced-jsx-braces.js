const fs = require('fs');
const content = fs.readFileSync('src/components/bec/BecDashboardClient.tsx', 'utf8');

const lines = content.split('\n');

// Parse SWC AST using @swc/core or babel
const babel = require('@babel/parser');

try {
    babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
    });
    console.log("Babel JSX parser PASSED successfully!");
} catch (e) {
    console.error("Babel JSX parser error:");
    console.error(`Line ${e.loc?.line}:${e.loc?.column} - ${e.message}`);
    console.error("Code at error:", lines[e.loc?.line - 1]);
}

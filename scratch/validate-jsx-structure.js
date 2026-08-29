const fs = require('fs');
const babel = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const content = fs.readFileSync('src/components/bec/BecDashboardClient.tsx', 'utf8');

try {
    const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
    });

    console.log("AST parsed successfully with Babel!");
} catch (err) {
    console.error("Babel parse error details:");
    console.error(err);
}

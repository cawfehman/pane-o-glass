const ts = require('typescript');
const fs = require('fs');

const code = fs.readFileSync('src/components/bec/BecDashboardClient.tsx', 'utf8');

const result = ts.transpileModule(code, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ESNext }
});

console.log("Transpile diagnostics:");
if (result.diagnostics && result.diagnostics.length > 0) {
    result.diagnostics.forEach(d => {
        const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
        console.log(`Line ${line + 1}:${character + 1} - ${d.messageText}`);
    });
} else {
    console.log("TS Transpiler succeeded cleanly! No syntax errors.");
}

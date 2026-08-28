const { 
    tokenizeQuery, 
    parseTokensToAST, 
    compileASTToPrisma, 
    parseBooleanSearchQuery 
} = require('../src/lib/booleanQueryParser');

console.log("=== Testing NOT Operator Parser ===");

const queries = [
    "(rivera-robert OR doe-john) AND NOT 10.20.30.40",
    "NOT rivera-robert",
    "comcast AND -10.20.30.40",
    "NOT (DISCONNECT OR FAILURE)"
];

for (const q of queries) {
    console.log(`\nQuery: "${q}"`);
    const parsed = parseBooleanSearchQuery(q);
    console.log("Prisma Where Object:\n", JSON.stringify(parsed, null, 2));
}

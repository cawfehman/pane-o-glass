/**
 * Boolean Search Query Parser for Prisma / PostgreSQL Queries
 * Parses complex search expressions with (), AND, OR operators.
 * Example: "(rivera-robert OR doe-john) AND 10.20.30.40"
 */

export interface FieldMatchGenerator {
    (term: string): any;
}

/**
 * Default multi-field VPN matcher: matches term across username, sourceIp, assignedIp, vpnStream, failureReason, ipAsName.
 */
export function defaultVpnFieldMatcher(term: string): any {
    const clean = term.trim();
    if (!clean) return null;
    return {
        OR: [
            { username: { contains: clean, mode: 'insensitive' } },
            { sourceIp: { contains: clean } },
            { assignedIp: { contains: clean } },
            { failureReason: { contains: clean, mode: 'insensitive' } },
            { vpnStream: { contains: clean, mode: 'insensitive' } },
            { ipAsName: { contains: clean, mode: 'insensitive' } }
        ]
    };
}

/**
 * Tokenize boolean query string into parentheses, operators, and terms.
 */
export function tokenizeQuery(query: string): string[] {
    const tokens: string[] = [];
    const regex = /\(|\)|AND|OR|[^\s()]+/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(query)) !== null) {
        tokens.push(match[0]);
    }
    return tokens;
}

type ASTNode =
    | { type: 'TERM'; value: string }
    | { type: 'AND'; left: ASTNode; right: ASTNode }
    | { type: 'OR'; left: ASTNode; right: ASTNode };

/**
 * Parse tokens into an Abstract Syntax Tree (AST) with precedence: () > AND > OR
 */
export function parseTokensToAST(tokens: string[]): ASTNode | null {
    let index = 0;

    function parseExpression(): ASTNode | null {
        let left = parseTerm();
        if (!left) return null;

        while (index < tokens.length) {
            const token = tokens[index].toUpperCase();
            if (token === 'OR') {
                index++;
                const right = parseTerm();
                if (!right) break;
                left = { type: 'OR', left, right };
            } else {
                break;
            }
        }
        return left;
    }

    function parseTerm(): ASTNode | null {
        let left = parseFactor();
        if (!left) return null;

        while (index < tokens.length) {
            const token = tokens[index].toUpperCase();
            if (token === 'AND') {
                index++;
                const right = parseFactor();
                if (!right) break;
                left = { type: 'AND', left, right };
            } else if (token !== 'OR' && token !== ')') {
                // Implicit AND if two terms are side-by-side without operator, e.g. "user 10.20.30.40"
                const right = parseFactor();
                if (!right) break;
                left = { type: 'AND', left, right };
            } else {
                break;
            }
        }
        return left;
    }

    function parseFactor(): ASTNode | null {
        if (index >= tokens.length) return null;

        const token = tokens[index];
        if (token === '(') {
            index++; // consume '('
            const node = parseExpression();
            if (index < tokens.length && tokens[index] === ')') {
                index++; // consume ')'
            }
            return node;
        } else if (token === ')' || token.toUpperCase() === 'AND' || token.toUpperCase() === 'OR') {
            return null;
        } else {
            index++;
            return { type: 'TERM', value: token };
        }
    }

    return parseExpression();
}

/**
 * Compiles an AST Node into a Prisma filter object using the provided field matcher.
 */
export function compileASTToPrisma(node: ASTNode | null, fieldMatcher: FieldMatchGenerator = defaultVpnFieldMatcher): any {
    if (!node) return null;

    if (node.type === 'TERM') {
        return fieldMatcher(node.value);
    } else if (node.type === 'AND') {
        const leftPrisma = compileASTToPrisma(node.left, fieldMatcher);
        const rightPrisma = compileASTToPrisma(node.right, fieldMatcher);
        if (leftPrisma && rightPrisma) return { AND: [leftPrisma, rightPrisma] };
        return leftPrisma || rightPrisma || null;
    } else if (node.type === 'OR') {
        const leftPrisma = compileASTToPrisma(node.left, fieldMatcher);
        const rightPrisma = compileASTToPrisma(node.right, fieldMatcher);
        if (leftPrisma && rightPrisma) return { OR: [leftPrisma, rightPrisma] };
        return leftPrisma || rightPrisma || null;
    }
    return null;
}

/**
 * High-level helper: Parses a search query string containing boolean operators or parentheses into a Prisma `where` clause.
 */
export function parseBooleanSearchQuery(query: string, fieldMatcher: FieldMatchGenerator = defaultVpnFieldMatcher): any {
    if (!query || !query.trim()) return null;
    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) return null;

    // Check if expression contains boolean syntax (AND, OR, parentheses)
    const hasBooleanOperators = tokens.some(t => {
        const u = t.toUpperCase();
        return u === 'AND' || u === 'OR' || u === '(' || u === ')';
    });

    if (hasBooleanOperators) {
        try {
            const ast = parseTokensToAST(tokens);
            return compileASTToPrisma(ast, fieldMatcher);
        } catch (e) {
            console.error("Boolean Query Parser Error:", e);
        }
    }

    // Fallback for simple multi-term strings
    const simpleTokens = query.split(/[,;\s]+/).map(t => t.trim()).filter(Boolean);
    if (simpleTokens.length === 0) return null;
    return {
        OR: simpleTokens.flatMap(t => {
            const m = fieldMatcher(t);
            return m?.OR || [m];
        })
    };
}

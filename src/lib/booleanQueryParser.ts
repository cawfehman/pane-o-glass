/**
 * Boolean Search Query Parser for Prisma / PostgreSQL Queries
 * Parses complex search expressions with (), AND, OR operators.
 * Example: "(smith-jane OR doe-john) AND 10.20.30.40"
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
    const regex = /\(|\)|AND|OR|NOT|[^\s()]+/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(query)) !== null) {
        tokens.push(match[0]);
    }
    return tokens;
}

export type ASTNode =
    | { type: 'TERM'; value: string }
    | { type: 'AND'; left: ASTNode; right: ASTNode }
    | { type: 'OR'; left: ASTNode; right: ASTNode }
    | { type: 'NOT'; expr: ASTNode };

/**
 * Parse tokens into an Abstract Syntax Tree (AST) with precedence: () > NOT > AND > OR
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
        const uToken = token.toUpperCase();

        if (uToken === 'NOT') {
            index++; // consume 'NOT'
            const expr = parseFactor();
            if (!expr) return null;
            return { type: 'NOT', expr };
        }

        if (token.startsWith('-') && token.length > 1) {
            const cleanTerm = token.slice(1);
            index++;
            return { type: 'NOT', expr: { type: 'TERM', value: cleanTerm } };
        }

        if (token === '(') {
            index++; // consume '('
            const node = parseExpression();
            if (index < tokens.length && tokens[index] === ')') {
                index++; // consume ')'
            }
            return node;
        } else if (token === ')' || uToken === 'AND' || uToken === 'OR') {
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
    } else if (node.type === 'NOT') {
        const exprPrisma = compileASTToPrisma(node.expr, fieldMatcher);
        if (exprPrisma) return { NOT: exprPrisma };
        return null;
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

    // Check if expression contains boolean syntax (AND, OR, NOT, -, parentheses)
    const hasBooleanOperators = tokens.some(t => {
        const u = t.toUpperCase();
        return u === 'AND' || u === 'OR' || u === 'NOT' || u === '(' || u === ')' || t.startsWith('-');
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

/**
 * In-memory AST Evaluator: Evaluates an arbitrary JavaScript object against a boolean AST query.
 * @param item The target record or object to evaluate
 * @param node The parsed ASTNode
 * @param termMatcher Function that returns true if item matches a single string term
 */
export function evaluateBooleanAST<T>(
    item: T,
    node: ASTNode | null,
    termMatcher: (item: T, term: string) => boolean
): boolean {
    if (!node) return true;

    if (node.type === 'TERM') {
        return termMatcher(item, node.value);
    } else if (node.type === 'AND') {
        return evaluateBooleanAST(item, node.left, termMatcher) && evaluateBooleanAST(item, node.right, termMatcher);
    } else if (node.type === 'OR') {
        return evaluateBooleanAST(item, node.left, termMatcher) || evaluateBooleanAST(item, node.right, termMatcher);
    } else if (node.type === 'NOT') {
        return !evaluateBooleanAST(item, node.expr, termMatcher);
    }
    return true;
}

/**
 * Checks if a query contains boolean syntax (AND, OR, NOT, parentheses, minus prefix)
 */
export function isBooleanQuery(query: string): boolean {
    if (!query || !query.trim()) return false;
    const tokens = tokenizeQuery(query);
    return tokens.some(t => {
        const u = t.toUpperCase();
        return u === 'AND' || u === 'OR' || u === 'NOT' || u === '(' || u === ')' || t.startsWith('-');
    });
}

/**
 * High-level helper: Evaluates an ISE session or endpoint item against a boolean query string.
 * Inspects: user_name, calling_station_id, framed_ip_address, workstation_ip, hostname,
 * site_code, wlan_ssid, access_point_name, nas_identifier, endpoint_profile, failure_reason.
 */
export function matchIseItemWithQuery(item: any, query: string): boolean {
    if (!query || !query.trim()) return true;
    if (!item) return false;

    const termMatcher = (record: any, term: string): boolean => {
        const q = term.toLowerCase().trim();
        if (!q) return true;

        const fieldsToCheck: (string | undefined | null)[] = [
            record.user_name,
            record.userName,
            record.calling_station_id,
            record.callingStationId,
            record.framed_ip_address,
            record.framedIpAddress,
            record.workstation_ip,
            record.workstationIp,
            record.hostname,
            record.machine_name,
            record.site_code,
            record.siteCode,
            record.wlan_ssid,
            record.wlanSsid,
            record.access_point_name,
            record.accessPointName,
            record.nas_identifier,
            record.nasIdentifier,
            record.network_device_name,
            record.endpoint_profile,
            record.endpointProfile,
            record.identity_group,
            record.identityGroup,
            record.failure_reason,
            record.failureReason,
            record.name,
            record.description,
            record.status === false ? 'failure' : record.status === true ? 'passed' : undefined
        ];

        // Normalize potential MAC match: compare alphanumeric hex only if term is hex
        const cleanTermHex = q.replace(/[:.\-\s]/g, '');
        const isMacTerm = cleanTermHex.length === 12 && /^[0-9a-f]{12}$/.test(cleanTermHex);
        if (isMacTerm) {
            const rawMac = (record.calling_station_id || record.callingStationId || "").replace(/[:.\-\s]/g, '').toLowerCase();
            if (rawMac && rawMac === cleanTermHex) return true;
        }

        return fieldsToCheck.some(val => {
            if (!val || typeof val !== 'string') return false;
            return val.toLowerCase().includes(q);
        });
    };

    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) return true;

    try {
        const ast = parseTokensToAST(tokens);
        return evaluateBooleanAST(item, ast, termMatcher);
    } catch {
        // Fallback to simple multi-term substring match (implicit AND)
        const simpleTerms = query.split(/[,;\s]+/).map(t => t.trim()).filter(Boolean);
        return simpleTerms.every(term => termMatcher(item, term));
    }
}

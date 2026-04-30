/**
 * Obfuscates an account or email address for audit logging.
 * Keeps cooperhealth.edu and caperegional.com domains fully visible.
 * For others, masks everything except the first and last characters of each part.
 */
export function obfuscateAuditAccount(account: string): string {
    if (!account) return "unknown";
    
    const lowerAccount = account.toLowerCase();
    const whitelist = ['cooperhealth.edu', 'caperegional.com'];
    
    // 1. Check if it's a whitelisted domain
    if (whitelist.some(domain => lowerAccount.endsWith(domain))) {
        return account;
    }

    // 2. Handle Email Addresses (both sides of @)
    if (account.includes('@')) {
        const [local, domain] = account.split('@');
        
        const mask = (part: string) => {
            if (part.length <= 2) return part;
            return part[0] + '*'.repeat(part.length - 2) + part[part.length - 1];
        };

        return `${mask(local)}@${mask(domain)}`;
    }

    // 3. Handle plain usernames or identifiers
    if (account.length <= 2) return account;
    return account[0] + '*'.repeat(account.length - 2) + account[account.length - 1];
}

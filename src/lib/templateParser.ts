/**
 * Mail Merge dynamic placeholder replacements
 */
export interface TemplateVariables {
    Name?: string;
    Email?: string;
    BreachName?: string;
    BreachDate?: string;
    BreachDetails?: string;
    ExposedCategories?: string;
    AccountStatus?: string;
    CurrentDate?: string;
    [key: string]: string | undefined;
}

export const DEFAULT_PLACEHOLDERS = [
    { key: "{{Name}}", label: "Recipient Name", example: "Jane Doe" },
    { key: "{{Email}}", label: "Recipient Email", example: "jdoe@cooperhealth.edu" },
    { key: "{{BreachName}}", label: "Breach Name", example: "LinkedIn" },
    { key: "{{BreachDate}}", label: "Breach Date", example: "May 18, 2016" },
    { key: "{{BreachDetails}}", label: "Breach Description / Details", example: "In May 2016, an external service experienced a credential spill..." },
    { key: "{{ExposedCategories}}", label: "Exposed Data Categories", example: "Passwords, Email addresses" },
    { key: "{{AccountStatus}}", label: "AD Account Status", example: "Active" },
    { key: "{{CurrentDate}}", label: "Current Date", example: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) },
];

export function renderMergedText(template: string, variables: TemplateVariables): string {
    if (!template) return "";
    let rendered = template;
    
    // 1. Process conditional blocks: {{#if Key}}content{{else}}alt{{/if}} or {{#if Key}}content{{/if}}
    rendered = rendered.replace(/\{\{#if\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/gi, (_match, key, ifBlock, elseBlock) => {
        const val = variables[key] || variables[key.toLowerCase()] || variables[key.toUpperCase()];
        const hasVal = val && String(val).trim().length > 0 && val !== "N/A" && val !== "Unknown";
        if (hasVal) {
            return ifBlock;
        }
        return elseBlock || "";
    });

    // 2. Provide default fallback for CurrentDate if not supplied
    if (!variables.CurrentDate) {
        const todayStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        rendered = rendered.replace(/\{\{CurrentDate\}\}/gi, todayStr);
    }

    // 3. Replace all known variables
    Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
        rendered = rendered.replace(regex, value !== undefined && value !== null ? value : "");
    });

    // 4. Clean up any leftover orphan conditional tags if any existed
    rendered = rendered.replace(/\{\{#[^}]+\}\}/gi, "").replace(/\{\{\/[^}]+\}\}/gi, "");

    return rendered;
}

export function createSimulationBannerHtml(originalRecipient: string, recipientName?: string): string {
    return `
    <div style="background: #fef08a; border: 2px dashed #ca8a04; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; font-family: sans-serif; color: #713f12; font-size: 13px; line-height: 1.5;">
        <div style="font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #854d0e; display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            ⚠️ [TEST SIMULATION RUN - NOT SENT TO USER]
        </div>
        <div>
            This is a test preview email dispatched to <strong>your address</strong> for verification. 
            In the live campaign, this message will be delivered to: <strong>${recipientName ? `${recipientName} &lt;${originalRecipient}&gt;` : originalRecipient}</strong>.
        </div>
    </div>
    `;
}

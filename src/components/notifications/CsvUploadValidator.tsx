"use client";

import React, { useState, useRef } from "react";
import { 
    UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, 
    X, ArrowRight, Database, Users
} from "lucide-react";

interface CsvUploadValidatorProps {
    onStaged: (recipients: any[], summary: { filename: string; total: number; valid: number; invalid: number }) => void;
}

export default function CsvUploadValidator({ onStaged }: CsvUploadValidatorProps) {
    const [fileName, setFileName] = useState("");
    const [parsing, setParsing] = useState(false);
    const [validationError, setValidationError] = useState("");
    const [parsedData, setParsedData] = useState<any[] | null>(null);
    const [summary, setSummary] = useState<{ total: number; valid: number; invalid: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const parseCSV = (text: string) => {
        const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) {
            throw new Error("CSV file must contain at least a header row and one data row.");
        }

        // Basic robust CSV line parser handling quoted fields
        const parseLine = (line: string): string[] => {
            const result: string[] = [];
            let current = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = "";
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        };

        const rawHeaders = parseLine(lines[0]);
        const headers = rawHeaders.map(h => h.replace(/^["']|["']$/g, '').trim());

        // Find email column index
        const emailIndex = headers.findIndex(h => /^(email|user\s*email|account\s*email|e-mail)$/i.test(h));
        if (emailIndex === -1) {
            throw new Error(`CSV is missing required 'Email' column. Found columns: [${headers.join(', ')}]`);
        }

        const nameIndex = headers.findIndex(h => /^(name|first\s*last|ad\s*name|display\s*name|full\s*name)$/i.test(h));
        const adNameIndex = headers.findIndex(h => /^(ad\s*name|ad\s*field\s*name|last,\s*first)$/i.test(h));
        const breachNameIndex = headers.findIndex(h => /^(breach\s*name|breach|incident)$/i.test(h));
        const breachDateIndex = headers.findIndex(h => /^(date\s*of\s*breach|breach\s*date|date)$/i.test(h));
        const breachDetailsIndex = headers.findIndex(h => /^(breach\s*details|details|description)$/i.test(h));
        const statusIndex = headers.findIndex(h => /^(account\s*status|status|active\s*status)$/i.test(h));

        const records: any[] = [];
        let valid = 0;
        let invalid = 0;

        for (let i = 1; i < lines.length; i++) {
            const values = parseLine(lines[i]);
            if (values.length === 0 || values.every(v => v === "")) continue;

            const email = (values[emailIndex] || "").replace(/^["']|["']$/g, '').trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isValidEmail = emailRegex.test(email);

            if (!isValidEmail) {
                invalid++;
                continue;
            }

            valid++;
            const name = nameIndex !== -1 ? values[nameIndex] : "";
            const adName = adNameIndex !== -1 ? values[adNameIndex] : "";
            const breachName = breachNameIndex !== -1 ? values[breachNameIndex] : "";
            const breachDate = breachDateIndex !== -1 ? values[breachDateIndex] : "";
            const breachDetails = breachDetailsIndex !== -1 ? values[breachDetailsIndex] : "";
            const accountStatus = statusIndex !== -1 ? values[statusIndex] : "Active";

            // Map all original headers into variables dictionary
            const variables: Record<string, string> = {};
            headers.forEach((h, idx) => {
                variables[h] = values[idx] || "";
            });
            variables.Name = name || email.split("@")[0];
            variables.Email = email;
            if (breachName) variables.BreachName = breachName;
            if (breachDate) variables.BreachDate = breachDate;
            if (breachDetails) variables.BreachDetails = breachDetails;
            if (accountStatus) variables.AccountStatus = accountStatus;

            records.push({
                email,
                name,
                adName,
                accountStatus,
                breachName,
                breachDate,
                breachDetails,
                variablesJson: JSON.stringify(variables),
            });
        }

        return { records, summary: { total: lines.length - 1, valid, invalid } };
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        setValidationError("");
        const file = e.target.files?.[0];
        if (!file) return;

        // Guard against excessively large files freezing the browser
        if (file.size > 5 * 1024 * 1024) {
            setValidationError("File too large. Maximum upload size is 5 MB. Please split the file and upload in batches.");
            return;
        }

        setFileName(file.name);
        setParsing(true);

        try {
            const text = await file.text();
            const { records: rawRecords, summary: sum } = parseCSV(text);
            if (rawRecords.length === 0) {
                throw new Error("No valid email records were found in the uploaded file.");
            }

            // De-duplicate by email (case-insensitive), keeping first occurrence
            const seen = new Set<string>();
            const records = rawRecords.filter(r => {
                const key = r.email.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            const dupeCount = rawRecords.length - records.length;

            setParsedData(records);
            setSummary({ ...sum, valid: records.length, invalid: sum.invalid + dupeCount });
            if (dupeCount > 0) {
                setValidationError(`${dupeCount} duplicate email address${dupeCount > 1 ? "es" : ""} removed. Each recipient will only receive one email.`);
            }
        } catch (err: any) {
            setValidationError(err.message || "Failed to process CSV file.");
            setParsedData(null);
            setSummary(null);
        } finally {
            setParsing(false);
        }
    };

    const handleConfirmStage = () => {
        if (!parsedData || !summary) return;
        onStaged(parsedData, {
            filename: fileName,
            total: summary.total,
            valid: summary.valid,
            invalid: summary.invalid,
        });
    };

    return (
        <div className="flex flex-col gap-5">
            {/* Dropzone */}
            <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border-color hover:border-accent-primary rounded-xl p-8 text-center cursor-pointer bg-bg-surface transition-all flex flex-col items-center justify-center gap-3 group"
            >
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".csv,text/csv" 
                    className="hidden" 
                />
                <div className="w-14 h-14 rounded-full bg-accent-primary/10 group-hover:bg-accent-primary/20 text-accent-primary flex items-center justify-center transition-colors">
                    <UploadCloud size={28} />
                </div>
                <div>
                    <strong className="text-text-primary text-base block mb-1">
                        {fileName ? fileName : "Click or drag & drop Mail Merge CSV file"}
                    </strong>
                    <span className="text-text-muted text-xs">
                        Supports CSV files with <code>Email</code>, <code>Name</code>, <code>Breach Name</code>, and <code>Date of Breach</code> columns.
                    </span>
                </div>
            </div>

            {/* Error Message */}
            {validationError && (
                <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-sm flex items-center gap-3">
                    <AlertTriangle size={20} className="shrink-0" />
                    <div>
                        <strong className="block font-semibold">Validation Issue</strong>
                        <span>{validationError}</span>
                    </div>
                </div>
            )}

            {/* Summary & Validation Success */}
            {summary && parsedData && (
                <div className="flex flex-col gap-4 bg-bg-surface p-5 rounded-xl border border-border-color">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-2.5">
                            <CheckCircle2 size={20} className="text-emerald-400" />
                            <strong className="text-text-primary text-sm">
                                CSV Validated: {summary.valid} Eligible Recipient{summary.valid === 1 ? "" : "s"}
                            </strong>
                        </div>
                        {summary.invalid > 0 && (
                            <span className="text-xs px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {summary.invalid} invalid rows skipped
                            </span>
                        )}
                    </div>

                    {/* Preview Table */}
                    <div className="overflow-x-auto rounded-md border border-border-color bg-bg-dark">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-border-color bg-bg-surface text-text-secondary">
                                    <th className="py-2.5 px-4 font-semibold">Email</th>
                                    <th className="py-2.5 px-3 font-semibold">Name</th>
                                    <th className="py-2.5 px-3 font-semibold">Breach Name</th>
                                    <th className="py-2.5 px-3 font-semibold">Date</th>
                                    <th className="py-2.5 px-4 font-semibold text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsedData.slice(0, 5).map((r, idx) => (
                                    <tr key={idx} className="border-b border-border-color/50 hover:bg-bg-surface/30">
                                        <td className="py-2.5 px-4 font-mono text-accent-primary">{r.email}</td>
                                        <td className="py-2.5 px-3 text-text-primary">{r.name || "—"}</td>
                                        <td className="py-2.5 px-3 text-text-secondary">{r.breachName || "—"}</td>
                                        <td className="py-2.5 px-3 text-text-muted">{r.breachDate || "—"}</td>
                                        <td className="py-2.5 px-4 text-right">
                                            <span className="px-2 py-0.5 rounded text-[0.65rem] bg-yellow-400 text-black font-black uppercase">
                                                {r.accountStatus}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {parsedData.length > 5 && (
                            <div className="py-2 px-4 text-center text-xs text-text-muted bg-bg-surface/50 border-t border-border-color/40">
                                ... and {parsedData.length - 5} more recipient records ready for staging.
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleConfirmStage}
                        className="btn-primary self-end inline-flex items-center gap-2 px-5 py-2 text-sm font-bold cursor-pointer shadow-md"
                    >
                        <span>Stage {parsedData.length} Recipients</span>
                        <ArrowRight size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}

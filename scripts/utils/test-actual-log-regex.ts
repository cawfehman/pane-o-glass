import dotenv from "dotenv";

const sampleLogFrom = "esa02.cooperhealth.edu ESA_mail_logs: Info: MID 286962029 ICID 197132478 From: <bounces+56614558-a188-gandhi-apurva=cooperhealth.edu@mmemail.synapsehealth.com>";
const sampleLogTo = "esa02.cooperhealth.edu ESA_mail_logs: Info: MID 286962029 ICID 197132478 To: <gandhi-apurva@cooperhealth.edu>";
const sampleLogSubj = "esa02.cooperhealth.edu ESA_mail_logs: Info: MID 286962029 Subject 'Synapse Health Delivery Notice'";

console.log("=== TESTING REGEX PATTERNS AGAINST ACTUAL COOPER LOG FORMAT ===");

// Pattern 1: Simple From extraction
const fromRegex = /From:\s*<([^>]+)>/i;
const fromMatch = sampleLogFrom.match(fromRegex);
console.log("From Match:", fromMatch ? fromMatch[1] : "NONE");

// Pattern 2: Simple To extraction
const toRegex = /To:\s*<([^>]+)>/i;
const toMatch = sampleLogTo.match(toRegex);
console.log("To Match:", toMatch ? toMatch[1] : "NONE");

// Pattern 3: Subject extraction
const subjRegex = /Subject\s*['"]([^'"]+)['"]/i;
const subjMatch = sampleLogSubj.match(subjRegex);
console.log("Subject Match:", subjMatch ? subjMatch[1] : "NONE");

// Pattern 4: MID & ICID extraction
const midIcidRegex = /MID\s+(\d+)(?:\s+ICID\s+(\d+))?/i;
const midIcidMatch = sampleLogFrom.match(midIcidRegex);
console.log("MID Match:", midIcidMatch ? midIcidMatch[1] : "NONE");
console.log("ICID Match:", midIcidMatch ? midIcidMatch[2] : "NONE");

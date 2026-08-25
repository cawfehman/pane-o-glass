const testLine1 = "esa01.cooperhealth.edu ESA_mail_logs: Info: MID 299250257 ready 103556 bytes from <bounce-mc.us7_18556591.13641495-7f0247730a@mail72.suw131.mcsv.net>";
const testLine2 = "esa01.cooperhealth.edu ESA_graymail_logs: Info: graymail [HANDLER] MID 299250257 To=Dianne <marsango-dianne@cooperhealth.edu>;ReplyTo=Labroots, Inc. <newsletters@labroots.com>;From=\"Labroots, Inc.\" <newsletters@labroots.com>";
const testLine3 = "esa02.cooperhealth.edu ESA_mail_logs: Info: MID 286962029 ICID 197132478 From: <bounces+56614558@domain.com>";

function testExtract(raw: string) {
    const fromMatch = raw.match(/From:?\s*=?\s*["']?[^<]*["']?\s*<([^>]+)>/i) || raw.match(/bytes from <([^>]+)>/i) || raw.match(/From:\s*(\S+)/i);
    const toMatch = raw.match(/To:?\s*=?\s*["']?[^<]*["']?\s*<([^>]+)>/i) || raw.match(/To:\s*(\S+)/i);

    return {
        from: fromMatch ? fromMatch[1] : null,
        to: toMatch ? toMatch[1] : null
    };
}

console.log("Line 1:", testExtract(testLine1));
console.log("Line 2:", testExtract(testLine2));
console.log("Line 3:", testExtract(testLine3));

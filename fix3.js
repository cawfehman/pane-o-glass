const fs = require('fs');

const replaces = [
    {
        file: 'scripts/debug/debug-ise-fields.ts',
        search: /attrStr\.split\(':!:'\)\.forEach\(pair =>/g,
        replace: 'attrStr?.split(\':!:\').forEach((pair: any) =>'
    },
    {
        file: 'scripts/discovery/scan-ap-data.ts',
        search: /forEach\(pair =>/g,
        replace: 'forEach((pair: any) =>'
    },
    {
        file: 'scripts/discovery/scan-by-wlc.ts',
        search: /map\(m =>/g,
        replace: 'map((m: any) =>'
    },
    {
        file: 'scripts/discovery/scan-by-wlc.ts',
        search: /filter\(m =>/g,
        replace: 'filter((m: any) =>'
    },
    {
        file: 'scripts/discovery/scan-concurrent.ts',
        search: /forEach\(pair =>/g,
        replace: 'forEach((pair: any) =>'
    },
    {
        file: 'scripts/discovery/scan-targeted-sessions.ts',
        search: /forEach\(pair =>/g,
        replace: 'forEach((pair: any) =>'
    },
    {
        file: 'scripts/cron/auto-unshun.ts',
        search: /d =>/g,
        replace: '(d: any) =>'
    },
    {
        file: 'scripts/cron/auto-unshun.ts',
        search: /err =>/g,
        replace: '(err: any) =>'
    },
    {
        file: 'scripts/cron/auto-unshun.ts',
        search: /\(command\)/g,
        replace: '(command: any)'
    },
    {
        file: 'scripts/cron/auto-unshun.ts',
        search: /l =>/g,
        replace: '(l: any) =>'
    },
    {
        file: 'scripts/cron/auto-unshun.ts',
        search: /line =>/g,
        replace: '(line: any) =>'
    },
    {
        file: 'scripts/cron/auto-unshun.ts',
        search: /catch \(e\)/g,
        replace: 'catch (e: any)'
    }
];

for (const rep of replaces) {
    if (fs.existsSync(rep.file)) {
        let content = fs.readFileSync(rep.file, 'utf8');
        content = content.replace(rep.search, rep.replace);
        fs.writeFileSync(rep.file, content, 'utf8');
    }
}
console.log("fix3.js applied");

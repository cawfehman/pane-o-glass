const fs = require('fs');
const path = require('path');

function processDir(dir) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            
            // Fix catch (e) -> catch (e: any)
            content = content.replace(/catch\s*\(\s*e\s*\)/g, 'catch (e: any)');
            content = content.replace(/catch\s*\(\s*err\s*\)/g, 'catch (err: any)');
            
            // Fix implicitly any params
            content = content.replace(/\(m\)/g, '(m: any)');
            content = content.replace(/\(s\)/g, '(s: any)');
            content = content.replace(/\(r\)/g, '(r: any)');
            content = content.replace(/\(t\)/g, '(t: any)');
            content = content.replace(/\(mac\)/g, '(mac: string)');
            content = content.replace(/\(pair\)/g, '(pair: any)');
            
            // Fix process.env
            content = content.replace(/process\.env\.ISE_PAN_URL(?!\!)/g, 'process.env.ISE_PAN_URL!');
            content = content.replace(/process\.env\.ISE_API_USER(?!\!)/g, 'process.env.ISE_API_USER!');
            content = content.replace(/process\.env\.ISE_API_PASSWORD(?!\!)/g, 'process.env.ISE_API_PASSWORD!');
            
            fs.writeFileSync(fullPath, content, 'utf8');
            console.log(`Fixed types in ${fullPath}`);
        }
    }
}

processDir(path.join(__dirname, 'scripts', 'test'));
processDir(path.join(__dirname, 'scripts', 'utils'));

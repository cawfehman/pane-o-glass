const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    try {
      filelist = fs.statSync(dirFile).isDirectory() ? walkSync(dirFile, filelist) : filelist.concat(dirFile);
    } catch (err) {
      if (err.code === 'OENT' || err.code === 'EACCES' || err.code === 'EPERM') return;
    }
  });
  return filelist;
}

const files = walkSync(path.join(__dirname, '../src')).filter(f => f.endsWith('.tsx'));

const styleRegex = /style=\{\{\s*([^}]+)\s*\}\}/g;

const mappings = {
    "display: 'flex'": "flex",
    "display: 'grid'": "grid",
    "flexDirection: 'column'": "flex-col",
    "flexDirection: 'row'": "flex-row",
    "alignItems: 'center'": "items-center",
    "alignItems: 'flex-start'": "items-start",
    "alignItems: 'flex-end'": "items-end",
    "justifyContent: 'center'": "justify-center",
    "justifyContent: 'space-between'": "justify-between",
    "justifyContent: 'flex-end'": "justify-end",
    "marginBottom: '16px'": "mb-4",
    "marginBottom: '24px'": "mb-6",
    "marginBottom: '32px'": "mb-8",
    "marginTop: '16px'": "mt-4",
    "gap: '8px'": "gap-2",
    "gap: '12px'": "gap-3",
    "gap: '16px'": "gap-4",
    "gap: '2rem'": "gap-8",
    "padding: '16px'": "p-4",
    "padding: '24px'": "p-6",
    "width: '100%'": "w-full",
    "height: '100%'": "h-full",
    "color: 'var(--text-secondary)'": "text-text-secondary",
    "color: 'var(--text-muted)'": "text-text-muted",
    "color: 'var(--text-primary)'": "text-text-primary",
    "color: 'var(--accent-primary)'": "text-accent-primary",
    "background: 'var(--bg-surface)'": "bg-bg-surface",
    "backgroundColor: 'var(--bg-surface)'": "bg-bg-surface",
    "background: 'var(--bg-dark)'": "bg-bg-dark",
    "fontWeight: 600": "font-semibold",
    "fontWeight: 500": "font-medium",
    "fontSize: '0.875rem'": "text-sm",
    "fontSize: '0.8rem'": "text-xs",
    "fontSize: '1rem'": "text-base",
};

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // A simpler approach: if a file has simple style objects, we'll try to convert them.
    // To do this safely, we will just replace the exact style tags that only contain exact matches.
    content = content.replace(styleRegex, (match, inner) => {
        if (inner.includes('${') || inner.includes('?')) return match;
        
        let props = inner.split(',').map(s => s.trim()).filter(Boolean);
        let allMapped = true;
        let twClasses = [];
        
        for (let prop of props) {
            let mapped = false;
            for (let [key, val] of Object.entries(mappings)) {
                if (prop === key || prop === key.replace(/'/g, '"')) {
                    twClasses.push(val);
                    mapped = true;
                    break;
                }
            }
            if (!mapped) {
                allMapped = false;
                break;
            }
        }

        if (allMapped && twClasses.length > 0) {
            // we can completely replace this style block. We should find the preceding className if it exists.
            // This is hard with regex. Instead, just return a className string, and we'll have to manually fix duplicate classNames if any.
            // A safe fallback: replace `style={{...}}` with `className="mapped-classes"`
            return `className="${twClasses.join(' ')}"`;
        }
        return match;
    });
    
    // Quick fix for double classNames
    content = content.replace(/className="([^"]+)"\s+className="([^"]+)"/g, 'className="$1 $2"');

    if (content !== original) {
        fs.writeFileSync(file, content);
        console.log(`Updated ${file}`);
    }
});

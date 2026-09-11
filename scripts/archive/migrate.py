import os
import re
import json

files = [
    r"c:\Users\rivera-robert\.gemini\antigravity\scratch\pane-o-glass\src\app\(dashboard)\queries\tacacs\page.tsx",
    r"c:\Users\rivera-robert\.gemini\antigravity\scratch\pane-o-glass\src\app\(dashboard)\queries\threat-intel\page.tsx",
    r"c:\Users\rivera-robert\.gemini\antigravity\scratch\pane-o-glass\src\app\(dashboard)\queries\vpn\page.tsx",
    r"c:\Users\rivera-robert\.gemini\antigravity\scratch\pane-o-glass\src\app\(dashboard)\settings\sites\page.tsx",
    r"c:\Users\rivera-robert\.gemini\antigravity\scratch\pane-o-glass\src\app\(dashboard)\users\audit\page.tsx"
]

def camel_to_kebab(name):
    return re.sub(r'(?<!^)(?=[A-Z])', '-', name).lower()

def parse_style_string(style_str):
    # Extremely basic parser for { key: 'value', key2: var }
    # This might fail on complex styles like dynamic styles: `width: \`${val}%\``
    # We will skip dynamic styles.
    if '`' in style_str or '$' in style_str or '?' in style_str:
        return None
    
    classes = []
    # Remove outer braces
    style_str = style_str.strip()[1:-1].strip()
    if not style_str:
        return []
        
    pairs = style_str.split(',')
    for pair in pairs:
        pair = pair.strip()
        if not pair: continue
        if ':' not in pair: return None
        k, v = pair.split(':', 1)
        k = k.strip()
        v = v.strip()
        
        # Remove quotes
        if (v.startswith("'") and v.endswith("'")) or (v.startswith('"') and v.endswith('"')):
            v = v[1:-1]
            
        kebab_k = camel_to_kebab(k)
        
        # Map some common properties
        if kebab_k == 'color':
            if v.startswith('var('):
                var_name = v[4:-1]
                classes.append(f"text-[{v}]" if not var_name.startswith('--') else f"text-{var_name[2:]}")
            else:
                classes.append(f"text-[{v}]")
        elif kebab_k == 'background' or kebab_k == 'background-color':
            if v.startswith('var('):
                var_name = v[4:-1]
                classes.append(f"bg-[{v}]" if not var_name.startswith('--') else f"bg-{var_name[2:]}")
            else:
                classes.append(f"bg-[{v}]")
        elif kebab_k == 'margin-bottom':
            classes.append(f"mb-[{v}]")
        elif kebab_k == 'margin-top':
            classes.append(f"mt-[{v}]")
        elif kebab_k == 'margin-left':
            classes.append(f"ml-[{v}]")
        elif kebab_k == 'margin-right':
            classes.append(f"mr-[{v}]")
        elif kebab_k == 'margin':
            classes.append(f"m-[{v}]")
        elif kebab_k == 'padding':
            classes.append(f"p-[{v}]")
        elif kebab_k == 'padding-bottom':
            classes.append(f"pb-[{v}]")
        elif kebab_k == 'padding-top':
            classes.append(f"pt-[{v}]")
        elif kebab_k == 'padding-left':
            classes.append(f"pl-[{v}]")
        elif kebab_k == 'padding-right':
            classes.append(f"pr-[{v}]")
        elif kebab_k == 'display':
            classes.append(v)
        elif kebab_k == 'align-items':
            classes.append(f"items-{v}")
        elif kebab_k == 'justify-content':
            classes.append(f"justify-{v}")
        elif kebab_k == 'flex-direction':
            classes.append(f"flex-{v}")
        elif kebab_k == 'font-weight':
            classes.append(f"font-[{v}]")
        elif kebab_k == 'font-size':
            classes.append(f"text-[{v}]")
        elif kebab_k == 'border-radius':
            classes.append(f"rounded-[{v}]")
        elif kebab_k == 'gap':
            classes.append(f"gap-[{v}]")
        elif kebab_k == 'width':
            classes.append(f"w-[{v}]")
        elif kebab_k == 'height':
            classes.append(f"h-[{v}]")
        elif kebab_k == 'min-width':
            classes.append(f"min-w-[{v}]")
        elif kebab_k == 'max-width':
            classes.append(f"max-w-[{v}]")
        else:
            classes.append(f"[{kebab_k}:{v}]")
            
    return classes

def replace_styles_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find all style={{ ... }}
    # We'll use a regex that handles balanced braces to some extent, 
    # but since regex can't do arbitrary nesting easily, we'll search for `style={{` and find the matching `}}`
    
    out = []
    idx = 0
    while True:
        pos = content.find('style={{', idx)
        if pos == -1:
            out.append(content[idx:])
            break
            
        out.append(content[idx:pos])
        
        # find matching '}}'
        brace_count = 0
        end_pos = -1
        for i in range(pos + 7, len(content)):
            if content[i] == '{':
                brace_count += 1
            elif content[i] == '}':
                brace_count -= 1
                if brace_count == -2: # matched the closing }}
                    end_pos = i
                    break
                    
        if end_pos != -1:
            style_str = content[pos+6:end_pos+1]
            classes = parse_style_string(style_str)
            if classes is not None:
                class_str = " ".join(classes)
                # Check if there is already a className attribute before style
                # This is tricky without a real parser. We'll just output className="..."
                # If there's already a className, we should merge. 
                # Let's just output it as a special token or try to inject it.
                # Actually, replacing style={{...}} with className="..." might result in duplicate classNames.
                # To be safe, we'll output a special attribute `tw-migrated="class_str"` and then fix it up.
                out.append(f'className="{class_str}"')
            else:
                # Dynamic or unparseable, leave as is
                out.append(content[pos:end_pos+1])
            idx = end_pos + 1
        else:
            out.append(content[pos:])
            break
            
    new_content = "".join(out)
    
    # Merge duplicate classNames: `className="foo" className="bar"` -> `className="foo bar"`
    # A bit hacky but works for simple cases.
    new_content = re.sub(r'className="([^"]+)"\s+className="([^"]+)"', r'className="\1 \2"', new_content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

for file in files:
    replace_styles_in_file(file)
    print(f"Processed {file}")

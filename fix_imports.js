const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'scripts', 'utils');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace const x = require('x')
  content = content.replace(/const\s+([a-zA-Z0-9_]+)\s*=\s*require\('([^']+)'\);?/g, "import $1 from '$2';");
  // Replace const { x } = require('x')
  content = content.replace(/const\s+\{\s*([a-zA-Z0-9_,\s]+)\s*\}\s*=\s*require\('([^']+)'\);?/g, "import { $1 } from '$2';");
  // Replace require('dotenv').config()
  content = content.replace(/require\('dotenv'\)\.config\(([^)]*)\);?/g, "import * as dotenv from 'dotenv';\ndotenv.config($1);");
  
  // function params implicit any
  // e.g. function(mac) -> function(mac: string) or (mac: any)
  // Just generic fixes are hard, but let's just do `require` first.
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file}`);
}

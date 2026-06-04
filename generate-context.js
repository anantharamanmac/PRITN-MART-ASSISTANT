const fs = require('fs');
const path = require('path');

const outputFile = path.join(__dirname, 'project-context.txt');
const includeDirs = ['src'];
const includeFiles = ['package.json', 'tsconfig.json', 'next.config.ts', 'README.md'];
const excludeExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3'];

let context = '';

function processFile(filePath) {
  if (excludeExtensions.includes(path.extname(filePath).toLowerCase())) return;
  const stat = fs.statSync(filePath);
  if (stat.size > 1024 * 1024) return; // Skip files larger than 1MB

  const content = fs.readFileSync(filePath, 'utf-8');
  context += `\n\n--- File: ${path.relative(__dirname, filePath)} ---\n\n`;
  context += content;
}

function processDir(dirPath) {
  const items = fs.readdirSync(dirPath);
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDir(fullPath);
    } else {
      processFile(fullPath);
    }
  }
}

// Process root files
for (const file of includeFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    processFile(fullPath);
  }
}

// Process directories
for (const dir of includeDirs) {
  const fullPath = path.join(__dirname, dir);
  if (fs.existsSync(fullPath)) {
    processDir(fullPath);
  }
}

fs.writeFileSync(outputFile, context.trim());
console.log(`Context successfully written to ${outputFile}`);

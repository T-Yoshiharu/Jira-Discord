const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'dist', 'main.js');

if (!fs.existsSync(targetFile)) {
    process.exit(0);
}

let content = fs.readFileSync(targetFile, 'utf8').replace(/\r\n/g, '\n');

// Add one blank line before top-level function declarations,
// but keep JSDoc immediately attached to the function.
content = content.replace(
    /(?<!\*\/)\n(function\s+[A-Za-z0-9_$]+\s*\()/g,
    '\n\n$1'
);

// Add one blank line between top-level closing braces and next declaration/comment.
content = content.replace(
    /^}\n(?=(function\s+[A-Za-z0-9_$]+\s*\(|const\s+[A-Za-z0-9_$]+\s*=|\/\*\*|\/\/ ==========================================))/gm,
    '}\n\n'
);

// Avoid creating large gaps.
content = content.replace(/\n{3,}/g, '\n\n');

if (!content.endsWith('\n')) {
    content += '\n';
}

fs.writeFileSync(targetFile, content, 'utf8');

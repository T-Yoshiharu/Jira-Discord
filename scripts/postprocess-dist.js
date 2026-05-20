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

// If the bundle is wrapped in a top-level IIFE like `(() => { ... })();`,
// unwrap it so functions and assignments become top-level for GAS.
// Preserve a leading "'use strict';\n" if present.
(() => {
    const useStrictMatch = content.match(/^(?:\s*(?:'use strict'|"use strict")?;?\s*\n)?/);
    const prefix = useStrictMatch ? useStrictMatch[0] : '';
    const rest = content.slice(prefix.length);

    // Detect IIFE opening at start of rest
    const openPatterns = [/^\s*\(\s*\(\s*\)\s*=>\s*{\s*\n/, /^\s*\(\s*function\s*\(\)\s*{\s*\n/];
    let openMatch = null;
    for (const p of openPatterns) {
        const m = rest.match(p);
        if (m) {
            openMatch = m[0];
            break;
        }
    }

    if (openMatch) {
        // Find last occurrence of typical IIFE closing patterns
        const closeCandidates = ['\n})();', '\n}());', '\n})();\n', '\n}());\n', '})();', '}());'];
        let closeIndex = -1;
        for (const cand of closeCandidates) {
            const idx = rest.lastIndexOf(cand);
            if (idx !== -1) {
                closeIndex = idx;
                break;
            }
        }

        if (closeIndex !== -1) {
            const inner = rest.slice(openMatch.length, closeIndex + 1); // include final '}'
            // Remove a single level of leading indentation (a tab or up to 4 spaces) if present
            const dedented = inner.replace(/^ {1,4}|\t/gm, '');
            content = prefix + dedented;
            if (!content.endsWith('\n')) content += '\n';
        }
    }
})();

fs.writeFileSync(targetFile, content, 'utf8');

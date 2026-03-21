const fs = require('fs');
let content = fs.readFileSync('data/skr03Metadata.ts', 'utf8');

// Problem: Single quotes inside single-quoted strings
// Solution: Replace all single-quoted string contents with properly escaped versions

// Fix description fields: description: '...'
content = content.replace(/description: '([^']*)'/g, (match, inner) => {
    // This already works for simple cases. The problem is when inner contains unescaped quotes.
    return match;
});

// Better approach: rewrite the entire data section using double quotes
// Replace all property values from single quotes to double quotes
// But TypeScript uses single quotes convention...

// Actually, the real fix: escape any apostrophes in string values
// The issue is the generator script doesn't escape special chars in auto-generated content

// Let's find problematic lines
const lines = content.split('\n');
const fixedLines = [];
let fixCount = 0;

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Fix description: '...' - find unescaped single quotes inside
    // Pattern: description: 'text with ' problem'
    const descMatch = line.match(/^(\s*description: ')(.*)(',\s*)$/);
    if (descMatch) {
        // Check if the inner text has unescaped single quotes
        let inner = descMatch[2];
        if (inner.includes("'")) {
            inner = inner.replace(/'/g, "\\'");
            line = descMatch[1] + inner + descMatch[3];
            fixCount++;
        }
    }

    // Fix keywords and examples arrays with unescaped quotes
    // Pattern: keywords: ['word', 'word's', 'word']
    // We need to fix individual string elements
    if (line.includes("keywords: [") || line.includes("examples: [")) {
        // Replace content between [ and ]
        line = line.replace(/\[([^\]]*)\]/g, (match, inner) => {
            if (!inner.trim()) return match;
            // Split by "', '" pattern but be careful
            // Better: replace any unescaped ' inside quoted strings
            // Strategy: rebuild each element
            const elements = [];
            let current = '';
            let inQuote = false;
            let escaped = false;

            for (let c = 0; c < inner.length; c++) {
                const ch = inner[c];
                if (escaped) {
                    current += ch;
                    escaped = false;
                    continue;
                }
                if (ch === '\\') {
                    current += ch;
                    escaped = true;
                    continue;
                }
                if (ch === "'" && !inQuote) {
                    inQuote = true;
                    current += ch;
                    continue;
                }
                if (ch === "'" && inQuote) {
                    // Is this end of string or embedded quote?
                    const rest = inner.substring(c + 1).trimStart();
                    if (rest.startsWith(',') || rest.startsWith(']') || rest === '' || c === inner.length - 1) {
                        // End of string
                        inQuote = false;
                        current += ch;
                        elements.push(current);
                        current = '';
                    } else {
                        // Embedded quote - escape it
                        current += "\\'";
                        fixCount++;
                    }
                    continue;
                }
                if (!inQuote && ch === ',') {
                    current = '';
                    continue;
                }
                if (!inQuote && (ch === ' ' || ch === '\t')) {
                    continue;
                }
                current += ch;
            }
            if (current.trim()) elements.push(current);

            return '[' + elements.join(', ') + ']';
        });
    }

    fixedLines.push(line);
}

content = fixedLines.join('\n');
fs.writeFileSync('data/skr03Metadata.ts', content);
console.log(`Fixed ${fixCount} quote issues`);
console.log('Done!');

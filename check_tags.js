
import fs from 'fs';

const content = fs.readFileSync('/Users/seonwookim/Documents/Programming/Security/LS26/prism-ai-defender/src/app/audit/page.tsx', 'utf8');

const stack = [];
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const regex = /<(div|button|span|h1|h2|h3|h4|p|form|input|label|section|pre|code)|<\/ (div|button|span|h1|h2|h3|h4|p|form|input|label|section|pre|code)>/g;
    // Note: I only check common tags.

    // Very naive tag parser
    let match;
    const tagRegex = /<(\/?[a-zA-Z0-9]+)(?:\s+[^>]*?)?(\/?)>/g;
    while ((match = tagRegex.exec(line)) !== null) {
        const tagName = match[1];
        const isSelfClosing = match[2] === '/';
        const isClosing = tagName.startsWith('/');

        if (isSelfClosing) continue;

        if (isClosing) {
            const closingName = tagName.slice(1);
            if (stack.length === 0) {
                console.log(`ERROR: Unexpected closing tag </${closingName}> at line ${i + 1}`);
            } else {
                const last = stack.pop();
                if (last.name !== closingName) {
                    console.log(`ERROR: Tag mismatch! Expected </${last.name}> (from line ${last.line}) but found </${closingName}> at line ${i + 1}`);
                }
            }
        } else {
            stack.push({ name: tagName, line: i + 1 });
        }
    }
}

console.log(`Final stack size: ${stack.length}`);
if (stack.length > 0) {
    console.log("Unclosed tags:");
    stack.forEach(s => console.log(`- <${s.name}> at line ${s.line}`));
}

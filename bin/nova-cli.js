#!/usr/bin/env node
'use strict';

// ============================================================
// NOVAjs LANG — CLI entry point
// Usage:
//   nova "print(1 + 2)"          — inline code
//   nova app                     — runs app.nova, app.novajs, or app (no ext)
//   nova app.nova
//   nova app.novajs
//   nova app.njs
// ============================================================

const fs   = require('fs');
const path = require('path');

// ── resolve nova-lang.js relative to this file ───────────────
const Nova = require(path.join(__dirname, 'nova-lang.js'));

// ── parse args ───────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error('[NOVA] Usage: nova "<code>"  or  nova <file>');
    process.exit(1);
}

const input = args[0];

// ── helper: resolve a file path trying multiple extensions ───
function resolveFile(input) {
    const candidates = [
        input,
        input + '.nova',
        input + '.novajs',
        input + '.njs'
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

// ── detect: inline code or file path? ────────────────────────
// Heuristic: if the argument contains a newline, or does NOT
// match a valid file path pattern, treat as inline code.
// Otherwise, try to resolve it as a file first.
function isLikelyFile(str) {
    // Contains path separators or known extensions → definitely a file
    if (/[/\\]/.test(str))                return true;
    if (/\.(nova|novajs|njs)$/.test(str)) return true;
    // Has no spaces and no semicolons → could be a bare filename like "app"
    if (!/[\s;(){]/.test(str))            return true;
    return false;
}

(async () => {
    let src;

    if (isLikelyFile(input)) {
        const resolved = resolveFile(input);
        if (resolved) src = fs.readFileSync(resolved, 'utf8');
        else src = input; // Not found as a file — fall back to treating as inline code
    } else src = input; // Treat as inline NOVA code

    try { await Nova.executeNode(src); } catch (err) {
        console.error('[NOVA]', err.message);
        process.exit(1);
    }
})();
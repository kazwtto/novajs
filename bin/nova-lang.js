'use strict';

// ============================================================
// NOVA LANG — Core Engine
// JS-based, transpiles NOVA source → JavaScript
// ============================================================

// ============================================================
// LEXER
// ============================================================
const TT = {
  NUM: 'NUM', STR: 'STR', TMPL: 'TMPL', BOOL: 'BOOL', NULL: 'NULL', UNDEF: 'UNDEF',
  IDENT: 'IDENT', KEYWORD: 'KEYWORD',
  PLUS: 'PLUS', MINUS: 'MINUS', STAR: 'STAR', SLASH: 'SLASH', PERCENT: 'PERCENT', STARSTAR: 'STARSTAR', CARET: 'CARET',
  EQ: 'EQ', EQEQ: 'EQEQ', EQEQEQ: 'EQEQEQ', NEQ: 'NEQ', NEQEQ: 'NEQEQ', EQLOOSE: 'EQLOOSE', NEQLOOSE: 'NEQLOOSE',
  LT: 'LT', GT: 'GT', LTE: 'LTE', GTE: 'GTE',
  AND: 'AND', OR: 'OR', NOT: 'NOT', NULLCOAL: 'NULLCOAL',
  PLUSPLUS: 'PLUSPLUS', MINUSMINUS: 'MINUSMINUS',
  PLUSEQ: 'PLUSEQ', MINUSEQ: 'MINUSEQ', STAREQ: 'STAREQ', SLASHEQ: 'SLASHEQ', PERCENTEQ: 'PERCENTEQ',
  LPAREN: 'LPAREN', RPAREN: 'RPAREN',
  LBRACE: 'LBRACE', RBRACE: 'RBRACE',
  LBRACKET: 'LBRACKET', RBRACKET: 'RBRACKET',
  COMMA: 'COMMA', SEMI: 'SEMI', COLON: 'COLON', DOT: 'DOT', DOTDOTDOT: 'DOTDOTDOT',
  ARROW: 'ARROW', QUESTION: 'QUESTION', OPTCHAIN: 'OPTCHAIN',
  NEWLINE: 'NEWLINE', EOF: 'EOF',
  HASH: 'HASH', AT: 'AT',
};

const KEYWORDS = new Set([
  'let', 'const', 'var',
  'if', 'else', 'for', 'while', 'do',
  'return', 'break', 'continue',
  'func', 'function', 'fn', 'class', 'new', 'this', 'super',
  'true', 'false', 'null', 'undefined',
  'import', 'export', 'default', 'from', 'as',
  'try', 'catch', 'finally', 'throw',
  'typeof', 'instanceof', 'in', 'of', 'delete', 'void',
  'async', 'await', 'yield',
  'switch', 'case',
  // NOVA keywords
  'print', 'not', 'and', 'or', 'equal', 'isNot',
  'greaterThan', 'lessThan', 'greaterEqual', 'lessEqual',
  'notEqual', 'range',
  'dom', 'canvas',
  'is',
]);

class Token {
  constructor(type, value, line, col) {
    this.type  = type;
    this.value = value;
    this.line  = line;
    this.col   = col;
  }
}

class Lexer {
  constructor(src) {
    this.src    = src;
    this.pos    = 0;
    this.line   = 1;
    this.col    = 1;
    this.tokens = [];
  }

  err(msg) { throw new SyntaxError(`[Line ${this.line}:${this.col}] ${msg}`); }
  peek(o = 0) { return this.src[this.pos + o]; }
  advance() {
    const c = this.src[this.pos++];
    if (c === '\n') { this.line++; this.col = 1; } else { this.col++; }
    return c;
  }

  skipWhitespace() {
    while (this.pos < this.src.length) {
      const c = this.peek();
      if (c === ' ' || c === '\t' || c === '\r') { this.advance(); continue; }
      if (c === '/' && this.peek(1) === '/') {
        while (this.pos < this.src.length && this.peek() !== '\n') this.advance();
        continue;
      }
      if (c === '/' && this.peek(1) === '*') {
        this.advance(); this.advance();
        while (this.pos < this.src.length && !(this.peek() === '*' && this.peek(1) === '/')) this.advance();
        if (this.pos < this.src.length) { this.advance(); this.advance(); }
        continue;
      }
      if (c === '#') {
        while (this.pos < this.src.length && this.peek() !== '\n') this.advance();
        continue;
      }
      break;
    }
  }

  readString(quote) {
    this.advance(); // opening quote
    let s = '';
    let hasInterpolation = false;
    while (this.pos < this.src.length && this.peek() !== quote) {
      const c = this.advance();
      if (c === '\\') {
        const e = this.advance();
        const esc = { n:'\n', t:'\t', r:'\r', '\\':'\\', "'":"'", '"':'"', '`':'`', '0':'\0' };
        s += esc[e] ?? ('\\' + e);
      } else if (c === '$' && this.peek() === '{') {
        // ${expr} interpolation
        hasInterpolation = true;
        s += '${';
        this.advance(); // consume '{'
        let depth = 1;
        while (this.pos < this.src.length && depth > 0) {
          const ic = this.advance();
          if (ic === '{') { depth++; s += ic; }
          else if (ic === '}') { depth--; if (depth > 0) s += ic; }
          else s += ic;
        }
        s += '}';
      } else if (c === '$' && /[a-zA-Z_$]/.test(this.peek())) {
        // $name variable interpolation
        hasInterpolation = true;
        let varName = '';
        while (this.pos < this.src.length && /[\w$]/.test(this.peek())) {
          varName += this.advance();
        }
        s += '${' + varName + '}';
      } else {
        // Escape backticks if present, since we may convert to template literal
        if (c === '`') s += '\\`';
        else s += c;
      }
    }
    if (this.pos >= this.src.length) this.err('Unterminated string');
    this.advance(); // closing quote
    // If interpolation was found, mark it as a template literal internally
    if (hasInterpolation) return { __tmpl: true, value: s };
    return s;
  }

  readTemplate() {
    this.advance(); // opening `
    let s = '`';
    while (this.pos < this.src.length && this.peek() !== '`') {
      const c = this.advance();
      s += c;
      if (c === '$' && this.peek() === '{') s += this.advance();
    }
    if (this.pos >= this.src.length) this.err('Unterminated template string');
    this.advance(); // closing `
    s += '`';
    return s;
  }

  tokenize() {
    while (this.pos < this.src.length) {
      this.skipWhitespace();
      if (this.pos >= this.src.length) break;

      const c   = this.peek();
      const ln  = this.line;
      const col = this.col;
      const tok = (type, value) => this.tokens.push(new Token(type, value, ln, col));

      if (c === '\n') { this.advance(); tok(TT.NEWLINE, '\n'); continue; }

      if (c === '`') { tok(TT.TMPL, this.readTemplate()); continue; }
      if (c === '"' || c === "'") {
        const result = this.readString(c);
        if (result && typeof result === 'object' && result.__tmpl) {
          tok(TT.TMPL, '`' + result.value + '`');
        } else {
          tok(TT.STR, result);
        }
        continue;
      }

      // numbers
      if (/\d/.test(c) || (c === '.' && /\d/.test(this.peek(1)))) {
        let n = '';
        if (c === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
          n = this.advance() + this.advance();
          while (/[0-9a-fA-F]/.test(this.peek())) n += this.advance();
        } else if (c === '0' && (this.peek(1) === 'b' || this.peek(1) === 'B')) {
          n = this.advance() + this.advance();
          while (/[01]/.test(this.peek())) n += this.advance();
        } else {
          while (this.pos < this.src.length && /[\d._]/.test(this.peek())) {
            const ch = this.advance();
            if (ch !== '_') n += ch;
          }
          if (this.peek() === 'e' || this.peek() === 'E') {
            n += this.advance();
            if (this.peek() === '+' || this.peek() === '-') n += this.advance();
            while (/\d/.test(this.peek())) n += this.advance();
          }
        }
        tok(TT.NUM, n); continue;
      }

      // identifiers / keywords
      if (/[a-zA-Z_$]/.test(c)) {
        let id = '';
        while (this.pos < this.src.length && /[\w$]/.test(this.peek())) id += this.advance();
        if (id === 'true')      { tok(TT.BOOL, true); }
        else if (id === 'false') { tok(TT.BOOL, false); }
        else if (id === 'null')  { tok(TT.NULL, null); }
        else if (id === 'undefined') { tok(TT.UNDEF, undefined); }
        else if (KEYWORDS.has(id))   { tok(TT.KEYWORD, id); }
        else                         { tok(TT.IDENT, id); }
        continue;
      }

      // × (U+00D7) — multiplication sign, alias for *
      if (c === '\u00D7') { this.advance(); tok(TT.STAR, '*'); continue; }

      // multi-char operators
      this.advance();
      switch(c) {
        case '+':
          if (this.peek() === '+') { this.advance(); tok(TT.PLUSPLUS,  '++'); }
          else if (this.peek() === '=') { this.advance(); tok(TT.PLUSEQ, '+='); }
          else tok(TT.PLUS, '+');
          break;
        case '-':
          if (this.peek() === '-') { this.advance(); tok(TT.MINUSMINUS, '--'); }
          else if (this.peek() === '=') { this.advance(); tok(TT.MINUSEQ, '-='); }
          else if (this.peek() === '>') { this.advance(); tok(TT.ARROW, '=>'); }
          else tok(TT.MINUS, '-');
          break;
        case '*':
          if (this.peek() === '*') { this.advance(); tok(TT.STARSTAR, '**'); }
          else if (this.peek() === '=') { this.advance(); tok(TT.STAREQ, '*='); }
          else tok(TT.STAR, '*');
          break;
        case '/':
          if (this.peek() === '=') { this.advance(); tok(TT.SLASHEQ, '/='); }
          else tok(TT.SLASH, '/');
          break;
        case '%':
          if (this.peek() === '=') { this.advance(); tok(TT.PERCENTEQ, '%='); }
          else tok(TT.PERCENT, '%');
          break;
        case '=':
          if (this.peek() === '>') { this.advance(); tok(TT.ARROW, '=>'); }
          else if (this.peek() === '=') {
            this.advance();
            if (this.peek() === '=') { this.advance(); tok(TT.EQEQEQ, '==='); }
            else tok(TT.EQEQ, '==');
          } else tok(TT.EQ, '=');
          break;
        case '!':
          if (this.peek() === '=') {
            this.advance();
            if (this.peek() === '=') { this.advance(); tok(TT.NEQEQ, '!=='); }
            else tok(TT.NEQ, '!=');
          } else tok(TT.NOT, '!');
          break;
        case '<':
          if (this.peek() === '=') { this.advance(); tok(TT.LTE, '<='); }
          else tok(TT.LT, '<');
          break;
        case '>':
          if (this.peek() === '=') { this.advance(); tok(TT.GTE, '>='); }
          else tok(TT.GT, '>');
          break;
        case '&':
          if (this.peek() === '&') { this.advance(); tok(TT.AND, '&&'); }
          else tok(TT.IDENT, '&'); // bitwise - pass through
          break;
        case '|':
          if (this.peek() === '|') { this.advance(); tok(TT.OR, '||'); }
          else tok(TT.IDENT, '|');
          break;
        case '?':
          if (this.peek() === '?') { this.advance(); tok(TT.NULLCOAL, '??'); }
          else if (this.peek() === '.') { this.advance(); tok(TT.OPTCHAIN, '?.'); }
          else if (this.peek() === '=') { this.advance(); tok(TT.EQLOOSE, '?='); }
          else if (this.peek() === '!' && this.peek(1) === '=') { this.advance(); this.advance(); tok(TT.NEQLOOSE, '?!='); }
          else tok(TT.QUESTION, '?');
          break;
        case '.':
          if (this.peek() === '.' && this.peek(1) === '.') { this.advance(); this.advance(); tok(TT.DOTDOTDOT, '...'); }
          else tok(TT.DOT, '.');
          break;
        case '(': tok(TT.LPAREN, '('); break;
        case ')': tok(TT.RPAREN, ')'); break;
        case '{': tok(TT.LBRACE, '{'); break;
        case '}': tok(TT.RBRACE, '}'); break;
        case '[': tok(TT.LBRACKET, '['); break;
        case ']': tok(TT.RBRACKET, ']'); break;
        case ',': tok(TT.COMMA, ','); break;
        case ';': tok(TT.SEMI, ';'); break;
        case ':': tok(TT.COLON, ':'); break;
        case '@': tok(TT.AT, '@'); break;
        case '^': tok(TT.CARET, '^'); break;
        // ignore others silently
      }
    }

    this.tokens.push(new Token(TT.EOF, null, this.line, this.col));
    return this.tokens;
  }
}

// ============================================================
// TRANSPILER  (NOVA source → JavaScript source)
// ============================================================
class Transpiler {
  constructor(tokens) {
    this.tokens     = tokens;
    this.pos        = 0;
    this.out        = [];
    this.indent     = 0;
    this.inFor      = false;
    this.typeEnv    = Object.create(null); // varName → normalized type (flat, current scope view)
    this.scopeStack = [Object.create(null)]; // stack of scope maps: varName → normalized type
  }

  // ── scope helpers ──────────────────────────────────────────
  scopeDeclare(name, type) {
    this.scopeStack[this.scopeStack.length - 1][name] = type ?? null;
    if (type) this.typeEnv[name] = type;
  }
  scopeLookup(name) {
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      if (name in this.scopeStack[i]) return this.scopeStack[i][name];
    }
    return undefined; // not declared
  }
  scopePush() { this.scopeStack.push(Object.create(null)); }
  scopePop()  {
    const popped = this.scopeStack.pop();
    // remove from typeEnv vars that were only in the popped scope
    for (const name in popped) {
      // only delete if not shadowed by an outer scope
      if (this.scopeLookup(name) === undefined) delete this.typeEnv[name];
    }
  }

  // ── token helpers ──────────────────────────────────────────
  cur(o = 0) { return this.tokens[Math.min(this.pos + o, this.tokens.length - 1)]; }
  advance()  { return this.tokens[this.pos++]; }
  eat(type, val) {
    const t = this.cur();
    if (type && t.type !== type) throw new SyntaxError(`[Line ${t.line}] Expected ${type}, got ${t.type} (${JSON.stringify(t.value)})`);
    if (val !== undefined && t.value !== val) throw new SyntaxError(`[Line ${t.line}] Expected '${val}', got '${t.value}'`);
    return this.advance();
  }
  skipNewlines() { while (this.cur().type === TT.NEWLINE) this.advance(); }
  matchKw(v)     { const t = this.cur(); return t.type === TT.KEYWORD && t.value === v; }
  matchType(tp)  { return this.cur().type === tp; }
  matchVal(v)    { return this.cur().value === v; }
  isLineEnd()    { return this.cur().type === TT.NEWLINE || this.cur().type === TT.SEMI || this.cur().type === TT.EOF; }

  // ── output helpers ─────────────────────────────────────────
  emit(s)   { this.out.push(s); }
  nl()      { this.out.push('\n' + '  '.repeat(this.indent)); }
  semi()    { this.out.push(';'); }

  // ── main entry ─────────────────────────────────────────────
  transpile(includeRuntime = true) {
    this.emitRuntime(includeRuntime);
    this.skipNewlines();
    while (this.cur().type !== TT.EOF) {
      this.parseStmt();
      this.skipNewlines();
    }
    return this.out.join('');
  }

  // ── runtime preamble ───────────────────────────────────────
  emitRuntime(includeRuntime = true) {
    if (includeRuntime) {
      this.emit(`// ── NOVA Runtime ──────────────────────────────────────────\n`);
      this.emit(NOVA_RUNTIME);
    }
    this.emit(`\n// ── User Code ──────────────────────────────────────────────\n`);
  }

  // ── statements ─────────────────────────────────────────────
  parseStmt() {
    this.skipNewlines();
    const t = this.cur();
    if (t.type === TT.EOF) return;
    if (t.type === TT.SEMI) { this.advance(); return; }

    if (t.type === TT.KEYWORD) {
      switch(t.value) {
        case 'let': case 'const': case 'var':
          return this.parseVarDecl();
        case 'if':     return this.parseIf();
        case 'for':    return this.parseFor();
        case 'while':  return this.parseWhile();
        case 'do':     return this.parseDoWhile();
        case 'func': case 'function': case 'fn': return this.parseFuncDecl();
        case 'class':  return this.parseClass();
        case 'return': return this.parseReturn();
        case 'break':
          this.advance(); this.emit('break'); this.semi(); return;
        case 'continue':
          this.advance(); this.emit('continue'); this.semi(); return;
        case 'throw':  return this.parseThrow();
        case 'try':    return this.parseTry();
        case 'import': return this.parseImport();
        case 'export': return this.parseExport();
        case 'switch': return this.parseSwitch();
        case 'print':  return this.parsePrint();
      }
    }

    // expression statement
    this.parseExprStmt();
  }

  // Parse a type annotation after ':'.
  // Returns:
  //   null                          — no annotation found
  //   string                        — primitive type name e.g. 'number'
  //   { __shape: true, fields: [...] } — object shape type
  // Skip a return type annotation after ')' in function declarations.
  // Less restrictive than skipTypeAnnotation — no scope guard needed here
  // since we know we're after the param list.
  skipReturnTypeAnnotation() {
    if (!this.matchType(TT.COLON)) return null;
    const next = this.cur(1);
    // Only recognize known type keywords/names as return type.
    // This prevents consuming the start of a one-liner expression like
    //   fn double(x): number x * 2
    // where 'x' after 'number' is the expression, not part of the type.
    const TYPE_KW = new Set(['null','undefined','function','func','fn','any','never','void',
                              'object','obj','number','num','int','float','string','str','text',
                              'boolean','bool','array']);
    const isKnownType = (tok) =>
      (tok.type === TT.KEYWORD && TYPE_KW.has(tok.value)) ||
      (tok.type === TT.IDENT   && TYPE_KW.has(tok.value.toLowerCase())) ||
      tok.type === TT.NULL || tok.type === TT.UNDEF;

    if (!isKnownType(next)) return null;

    const savedPos    = this.pos;
    const savedOutLen = this.out.length;
    this.advance(); // consume ':'

    if (this.matchType(TT.LBRACE)) return this._parseObjectShapeType();

    let typeParts = [];
    while (this.cur().type !== TT.EOF) {
      const t = this.cur();
      // Only consume tokens that are definitively part of a type expression:
      //   - known type names (single token)
      //   - | for union
      //   - ? for nullable
      //   - [] for array suffix
      // Stop immediately at anything else (IDENT that's not a type keyword,
      // operators, numbers, strings — these are the start of the expression body)
      const isTypeTok =
        isKnownType(t) ||
        t.type === TT.OR                               ||   // ||
        (t.type === TT.IDENT && t.value === '|')       ||   // | (single pipe)
        t.type === TT.QUESTION ||   // ?
        t.type === TT.LBRACKET ||   // [
        t.type === TT.RBRACKET;     // ]
      if (!isTypeTok) break;
      typeParts.push(String(t.value ?? ''));
      this.advance();
    }

    const raw = typeParts.join('').trim();
    if (!raw) return null;
    return this._normalizeReturnType(raw);
  }

  _normalizeReturnType(raw) {
    if (!raw) return null;
    const t = raw.toLowerCase().replace(/\?$/, '').trim();
    const nullable = raw.endsWith('?');
    const suffix = nullable ? '?' : '';
    // union types — pass through as-is (lowercased)
    if (t.includes('|')) {
      return t.split('|').map(p => {
        const n = p.trim();
        if (n === 'number' || n === 'num' || n === 'int' || n === 'float') return 'number';
        if (n === 'string' || n === 'str' || n === 'text') return 'string';
        if (n === 'boolean' || n === 'bool') return 'boolean';
        if (n === 'array') return 'array';
        if (n === 'object' || n === 'obj') return 'object';
        if (n === 'null') return 'null';
        if (n === 'undefined') return 'undefined';
        if (n === 'any') return 'any';
        return n;
      }).join('|');
    }
    if (t === 'void') return 'void';
    if (t === 'any' || t === '') return null;
    if (t === 'number' || t === 'num' || t === 'int' || t === 'float') return 'number' + suffix;
    if (t === 'string' || t === 'str' || t === 'text') return 'string' + suffix;
    if (t === 'boolean' || t === 'bool') return 'boolean' + suffix;
    if (t === 'array') return 'array' + suffix;
    if (t === 'object' || t === 'obj') return 'object' + suffix;
    if (t === 'null') return 'null';
    if (t === 'undefined') return 'undefined';
    if (t === 'function' || t === 'func' || t === 'fn') return 'function' + suffix;
    return null; // unknown type — no enforcement
  }

  skipTypeAnnotation() {
    if (!this.matchType(TT.COLON)) return null;
    const next = this.cur(1);
    const isTypeStart = next.type === TT.IDENT || next.type === TT.KEYWORD ||
                        next.type === TT.QUESTION || next.type === TT.LBRACE ||
                        next.type === TT.NULL || next.type === TT.UNDEF;
    if (!isTypeStart) return null;

    // Guard: if the next token is an IDENT that is already declared in scope,
    // it is almost certainly a value (not a type annotation). Do not consume.
    if (next.type === TT.IDENT && this.scopeLookup(next.value) !== undefined) return null;

    // Save position so we can rollback if the token sequence doesn't look like
    // a real type annotation (e.g. colon inside a function-call argument list).
    const savedPos    = this.pos;
    const savedOutLen = this.out.length;

    this.advance(); // consume ':'

    // Object shape type: { name: string, age?: number }
    if (this.matchType(TT.LBRACE)) {
      return this._parseObjectShapeType();
    }

    // Keywords that are valid type names — all other keywords (is, and, or, not, equal…)
    // must NOT be consumed as type tokens.
    const TYPE_KW = new Set(['null','undefined','function','func','fn','any','never','void','object','obj']);

    // Primitive / named type
    let typeParts = [];
    while (this.cur().type !== TT.EOF) {
      const t = this.cur();
      const isValidTypeKw = t.type === TT.KEYWORD && TYPE_KW.has(t.value);
      if (
        t.type === TT.IDENT    ||
        isValidTypeKw          ||
        t.type === TT.NULL     ||
        t.type === TT.UNDEF    ||
        t.type === TT.OR       ||
        t.type === TT.LT       ||
        t.type === TT.GT       ||
        t.type === TT.LBRACKET ||
        t.type === TT.RBRACKET ||
        t.type === TT.QUESTION ||
        t.type === TT.AND
      ) { typeParts.push(String(t.value ?? (t.type === TT.NULL ? 'null' : t.type === TT.UNDEF ? 'undefined' : ''))); this.advance(); }
      else { break; }
    }

    // Validate: after the type tokens, the next token must be one that can
    // follow a type annotation (=, ;, ,, newline, ), {, EOF, }).
    // If it's something else (like another ident or operator), this was NOT
    // a real type annotation — rollback.
    const afterType = this.cur().type;
    const validAfterType = new Set([
      TT.EQ, TT.SEMI, TT.COMMA, TT.NEWLINE, TT.EOF,
      TT.RPAREN, TT.LBRACE, TT.RBRACE, TT.RBRACKET,
      TT.KEYWORD, // e.g. 'is' used as assignment after type annotation
      // one-liner return type: fn foo(): number 80  — expression follows
      TT.NUM, TT.STR, TT.BOOL, TT.NULL, TT.UNDEF,
      TT.IDENT, TT.LBRACKET, TT.NOT, TT.MINUS, TT.PLUS,
      TT.LPAREN, TT.TMPL,
    ]);
    if (!validAfterType.has(afterType)) {
      // Rollback
      this.pos = savedPos;
      this.out.splice(savedOutLen);
      return null;
    }

    return typeParts.join('') || null;
  }

  // Parse { key: Type, key?: Type, ... } shape — called after consuming ':'
  _parseObjectShapeType() {
    this.advance(); // consume '{'
    const fields = [];
    while (!this.matchType(TT.RBRACE) && this.cur().type !== TT.EOF) {
      // key name
      const keyTok = this.cur();
      if (keyTok.type !== TT.IDENT && keyTok.type !== TT.KEYWORD) break;
      const key = this.advance().value;

      // optional marker '?'
      let optional = false;
      if (this.matchType(TT.QUESTION)) { this.advance(); optional = true; }

      // must have ':'
      if (!this.matchType(TT.COLON)) throw new SyntaxError(`[NOVA] Expected ':' after key "${key}" in object type`);
      this.advance(); // consume ':'

      // nested object shape
      let fieldType;
      if (this.matchType(TT.LBRACE)) {
        fieldType = this._parseObjectShapeType();
      } else {
        let parts = [];
        while (this.cur().type !== TT.EOF) {
          const t = this.cur();
          if (
            t.type === TT.IDENT || t.type === TT.KEYWORD ||
            t.type === TT.OR   || t.type === TT.LT || t.type === TT.GT ||
            t.type === TT.LBRACKET || t.type === TT.RBRACKET ||
            t.type === TT.QUESTION || t.type === TT.AND
          ) { parts.push(String(t.value ?? '')); this.advance(); }
          else break;
        }
        fieldType = parts.join('') || 'any';
      }

      fields.push({ key, optional, type: fieldType });
      if (this.matchType(TT.COMMA)) this.advance();
    }
    if (this.matchType(TT.RBRACE)) this.advance(); // consume '}'
    return { __shape: true, fields };
  }

  parseVarDecl() {
    const kw = this.advance().value;
    const jsKw = kw === 'var' ? 'let' : kw;
    this.emit(jsKw + ' ');

    // possibly destructuring: let { a, b } = ...  or let [a, b] = ...
    if (this.matchType(TT.LBRACE) || this.matchType(TT.LBRACKET)) {
      this.parseDestructureTarget();
      this.skipTypeAnnotation(); // ignore type on destructure
    } else {
      const varName = this.eat(TT.IDENT).value;
      this.emit(varName);
      const annoType = this.skipTypeAnnotation(); // optional:  name: Type
      const normalizedType = annoType ? this._normalizeType(annoType) : null;
      this.scopeDeclare(varName, normalizedType);

      if (this.matchType(TT.EQ) || (this.matchType(TT.KEYWORD) && this.matchVal('is'))) {
        this.advance();
        this.emit(' = ');
        this._emitCheckedExpr(varName, normalizedType);
      }
    }

    // multiple: let a = 1, b = 2
    while (this.matchType(TT.COMMA)) {
      this.advance();
      this.emit(', ');
      const varName2 = this.eat(TT.IDENT).value;
      this.emit(varName2);
      const annoType2 = this.skipTypeAnnotation();
      const normalizedType2 = annoType2 ? this._normalizeType(annoType2) : null;
      this.scopeDeclare(varName2, normalizedType2);
      if (this.matchType(TT.EQ) || (this.matchType(TT.KEYWORD) && this.matchVal('is'))) {
        this.advance();
        this.emit(' = ');
        this._emitCheckedExpr(varName2, normalizedType2);
      }
    }

    this.semi();
  }

  // Emit an expression wrapped in the appropriate type check (primitive or shape).
  _emitCheckedExpr(varName, normalizedType) {
    if (!normalizedType) { this.parseExpr(); return; }
    if (normalizedType.__shape) {
      this.emit(`__novaShapeCheck__(${JSON.stringify(varName)}, ${JSON.stringify(normalizedType.fields)}, `);
      // If value is an object literal, validate shorthands at compile-time
      if (this.matchType(TT.LBRACE)) {
        this.parseObjectLit(normalizedType);
      } else {
        this.parseExpr();
      }
      this.emit(')');
    } else {
      this.emit(`__novaTypeCheck__(${JSON.stringify(varName)}, ${JSON.stringify(normalizedType)}, `);
      this.parseExpr();
      this.emit(')');
    }
  }

  // Normalize a type annotation to an internal representation.
  // Returns null (no enforcement), a string ('number', 'string', ...), or a shape object.
  _normalizeType(raw) {
    if (!raw) return null;
    // Shape object passed directly from _parseObjectShapeType
    if (raw && typeof raw === 'object' && raw.__shape) {
      // Recursively validate field types
      for (const field of raw.fields) {
        if (typeof field.type === 'string') {
          // validate the field type string (will throw if invalid)
          this._normalizeType(field.type);
        }
      }
      return raw; // return shape as-is
    }
    const t = raw.toLowerCase().replace(/\?/g, '').trim();
    if (t === 'any' || t === '') return null; // no enforcement
    if (t === 'number' || t === 'num' || t === 'int' || t === 'float') return 'number';
    if (t === 'string' || t === 'str' || t === 'text') return 'string';
    if (t === 'boolean' || t === 'bool') return 'boolean';
    if (t === 'object' || t === 'obj') return 'object';
    if (t === 'array') return 'array';
    if (t === 'function' || t === 'func' || t === 'fn') return 'function';
    if (t === 'null') return 'null';
    if (t === 'undefined') return 'undefined';
    // For union types (contains |), skip enforcement
    if (raw.includes('|')) return null;
    // For generic types like Array<T>, treat as 'array'
    if (raw.toLowerCase().startsWith('array')) return 'array';
    // Unknown type — throw a compile-time error
    throw new SyntaxError(`[NOVA] Unknown type: "${raw.replace(/\?/g, '').trim()}". Valid types: number, string, boolean, object, array, function, any`);
  }

  parseDestructureTarget() {
    if (this.matchType(TT.LBRACE)) {
      this.advance(); this.emit('{ ');
      let first = true;
      while (!this.matchType(TT.RBRACE) && this.cur().type !== TT.EOF) {
        if (!first) this.emit(', ');
        first = false;
        const key = this.advance().value;
        this.emit(key);
        if (this.matchType(TT.COLON)) {
          this.advance(); this.emit(': '); this.emit(this.advance().value);
        }
        if (this.matchType(TT.EQ)) {
          this.advance(); this.emit(' = '); this.parseExpr();
        }
        if (this.matchType(TT.COMMA)) this.advance();
      }
      this.eat(TT.RBRACE); this.emit(' }');
    } else {
      this.advance(); this.emit('[');
      let first = true;
      while (!this.matchType(TT.RBRACKET) && this.cur().type !== TT.EOF) {
        if (!first) this.emit(', ');
        first = false;
        if (this.matchType(TT.DOTDOTDOT)) { this.advance(); this.emit('...'); }
        this.emit(this.advance().value);
        if (this.matchType(TT.EQ)) {
          this.advance(); this.emit(' = '); this.parseExpr();
        }
        if (this.matchType(TT.COMMA)) this.advance();
      }
      this.eat(TT.RBRACKET); this.emit(']');
    }
  }

  parseIf() {
    this.eat(TT.KEYWORD, 'if');
    this.emit('if (');
    const hasParen = this.matchType(TT.LPAREN);
    if (hasParen) this.advance();
    this.parseExpr();
    if (hasParen) this.eat(TT.RPAREN);
    this.emit(') ');
    this.skipNewlines();
    this.parseBlock();

    this.skipNewlines();
    while (this.matchKw('else')) {
      this.advance();
      this.emit(' else ');
      this.skipNewlines();
      if (this.matchKw('if')) {
        this.advance();
        this.emit('if (');
        const hp = this.matchType(TT.LPAREN);
        if (hp) this.advance();
        this.parseExpr();
        if (hp) this.eat(TT.RPAREN);
        this.emit(') ');
        this.skipNewlines();
        this.parseBlock();
        this.skipNewlines();
      } else {
        this.parseBlock();
        break;
      }
    }
  }

  parseFor() {
    this.eat(TT.KEYWORD, 'for');
    this.skipNewlines();

    // for ... of / for ... in  (JS style)
    // Detect: for (let x of arr) / for x of arr / for x in arr
    // Classic C: for (init; cond; update)  or  for i = 0; i < 10; i++
    // NOVA: for i, start, end | for i: inc, start, end | for i: *inc, start, end | for i range(...)

    const hasParen = this.matchType(TT.LPAREN);
    if (hasParen) {
      // pass-through JS-style for
      this.emit('for (');
      this.advance();
      // emit everything until matching )
      let depth = 1;
      while (this.cur().type !== TT.EOF && depth > 0) {
        const tk = this.advance();
        if (tk.type === TT.LPAREN) { depth++; this.emit('('); }
        else if (tk.type === TT.RPAREN) { depth--; if (depth > 0) this.emit(')'); }
        else this.emitToken(tk);
      }
      this.emit(') ');
      this.skipNewlines();
      this.parseBlock();
      return;
    }

    // peek for var name
    if (this.cur().type === TT.IDENT || (this.cur().type === TT.KEYWORD && ['let','const'].includes(this.cur().value))) {
      const savedPos = this.pos;
      const savedOut = this.out.length;

      try {
        return this.parseForNova();
      } catch(e) {
        this.out.splice(savedOut);
        this.pos = savedPos;
        // fall through to classic
      }
    }

    this.err('Invalid for syntax');
  }

  parseForNova() {
    // Determine style by lookahead
    const identTok = this.advance(); // var name or 'let'/'const'
    let varName = identTok.value;
    let jsDecl  = 'let';

    if (varName === 'let' || varName === 'const') {
      jsDecl  = varName;
      varName = this.advance().value;
    }

    // for x of expr / for x in expr
    if (this.matchKw('of')) {
      this.advance();
      this.emit(`for (${jsDecl} ${varName} of `);
      this.parseExpr();
      this.emit(') ');
      this.skipNewlines();
      this.parseBlock();
      return;
    }

    if (this.matchKw('in')) {
      this.advance();
      this.emit(`for (${jsDecl} ${varName} in `);
      this.parseExpr();
      this.emit(') ');
      this.skipNewlines();
      this.parseBlock();
      return;
    }

    // for x range(...)
    if (this.matchKw('range') || (this.matchType(TT.IDENT) && this.matchVal('range'))) {
      this.advance();
      this.eat(TT.LPAREN);
      const args = [];
      while (!this.matchType(TT.RPAREN) && this.cur().type !== TT.EOF) {
        const savedOut = this.out.length;
        this._parseRawExpr();
        args.push(this.out.splice(savedOut).join(''));
        if (this.matchType(TT.COMMA)) this.advance();
      }
      this.eat(TT.RPAREN);
      this.skipNewlines();
      const [start, end, step] = this.resolveRangeArgs(args);
      // range is exclusive upper bound (Python-style).
      // Direction auto-detected at runtime; step always treated as positive magnitude.
      this.emit(`for (let ${varName} = ${start}; ((${start}) <= (${end}) ? ${varName} < ${end} : ${varName} > ${end}); ${varName} += ((${start}) <= (${end}) ? Math.abs(${step}) : -Math.abs(${step}))) `);
      this.parseBlock();
      return;
    }

    // Classic C style: for i = expr; expr; expr
    if (this.matchType(TT.EQ)) {
      this.advance();
      const initSaved = this.out.length;
      this._parseRawExpr();
      const initVal = this.out.splice(initSaved).join('');
      // consume ; or newline
      if (this.matchType(TT.SEMI) || this.matchType(TT.NEWLINE)) this.advance();
      const condSaved = this.out.length;
      this._parseRawExpr();
      const condVal = this.out.splice(condSaved).join('');
      if (this.matchType(TT.SEMI) || this.matchType(TT.NEWLINE)) this.advance();
      const updSaved = this.out.length;
      this._parseRawExpr();
      const updVal = this.out.splice(updSaved).join('');
      this.skipNewlines();
      this.emit(`for (let ${varName} = ${initVal}; ${condVal}; ${updVal}) `);
      this.parseBlock();
      return;
    }

    // for i: inc, start, end  OR  for i: *inc, start, end
    if (this.matchType(TT.COLON)) {
      this.advance();
      let mulMode = false;
      if (this.matchType(TT.STAR)) { this.advance(); mulMode = true; }
      const incSaved = this.out.length;
      this._parseRawExpr();
      const incVal = this.out.splice(incSaved).join('');
      this.eat(TT.COMMA);
      const startSaved = this.out.length;
      this._parseRawExpr();
      const startVal = this.out.splice(startSaved).join('');
      this.eat(TT.COMMA);
      const endSaved = this.out.length;
      this._parseRawExpr();
      const endVal = this.out.splice(endSaved).join('');
      this.skipNewlines();

      if (mulMode) {
        // Multiplicative: start=0 would loop forever (0*n=0), so clamp start to 1 when 0.
        // Factor must be > 1 to go up, < 1 (fraction) to go down — user's responsibility.
        // We ensure |factor| > 1 at runtime to avoid infinite loop.
        const safeStart = `((${startVal}) === 0 ? 1 : (${startVal}))`;
        const safeFactor = `(Math.abs(${incVal}) > 1 ? Math.abs(${incVal}) : (Math.abs(${incVal}) < 1 && Math.abs(${incVal}) > 0 ? Math.abs(${incVal}) : 2))`;
        this.emit(`for (let ${varName} = ${safeStart}; ${varName} <= ${endVal}; ${varName} *= ${safeFactor}) `);
      } else {
        // Additive: inc is always a positive magnitude — direction auto from start/end.
        // Using Math.abs ensures negative inc values don't invert the intended direction.
        const absInc = `Math.abs(${incVal})`;
        const dir = `((${startVal}) <= (${endVal}) ? 1 : -1)`;
        this.emit(`for (let ${varName} = ${startVal}; ((${startVal}) <= (${endVal}) ? ${varName} <= ${endVal} : ${varName} >= ${endVal}); ${varName} += (${dir} * ${absInc})) `);
      }
      this.parseBlock();
      return;
    }

    // for i, first [, second]
    if (this.matchType(TT.COMMA)) {
      this.advance();
      const firstSaved = this.out.length;
      this._parseRawExpr();
      const firstVal = this.out.splice(firstSaved).join('');

      if (this.matchType(TT.COMMA)) {
        this.advance();
        const secondSaved = this.out.length;
        this._parseRawExpr();
        const secondVal = this.out.splice(secondSaved).join('');
        this.skipNewlines();
        // for i, start, end — auto direction
        const dir = `((${firstVal}) <= (${secondVal}) ? 1 : -1)`;
        this.emit(`for (let ${varName} = ${firstVal}; ((${firstVal}) <= (${secondVal}) ? ${varName} <= ${secondVal} : ${varName} >= ${secondVal}); ${varName} += ${dir}) `);
        this.parseBlock();
      } else {
        this.skipNewlines();
        // for i, end — starts at 0
        this.emit(`for (let ${varName} = 0; ${varName} < ${firstVal}; ${varName}++) `);
        this.parseBlock();
      }
      return;
    }

    throw new SyntaxError('Cannot parse for-nova');
  }

  resolveRangeArgs(args) {
    if (args.length === 1) return ['0', args[0], '1'];
    if (args.length === 2) return [args[0], args[1], '1'];
    return args;
  }

  parseWhile() {
    this.eat(TT.KEYWORD, 'while');
    this.emit('while (');
    const hp = this.matchType(TT.LPAREN);
    if (hp) this.advance();
    this.parseExpr();
    if (hp) this.eat(TT.RPAREN);
    this.emit(') ');
    this.skipNewlines();
    this.parseBlock();
  }

  parseDoWhile() {
    this.eat(TT.KEYWORD, 'do');
    this.emit('do ');
    this.parseBlock();
    this.skipNewlines();
    this.eat(TT.KEYWORD, 'while');
    this.emit(' while (');
    const hp = this.matchType(TT.LPAREN);
    if (hp) this.advance();
    this.parseExpr();
    if (hp) this.eat(TT.RPAREN);
    this.emit(')');
    this.semi();
  }

  parseFuncDecl() {
    const kw = this.advance().value; // 'func' | 'function' | 'fn'
    let isAsync = false;
    if (kw === 'async') isAsync = true;
    if (this.matchKw('async')) { this.advance(); isAsync = true; }

    const prefix = isAsync ? 'async function ' : 'function ';
    let name = '';
    if (this.cur().type === TT.IDENT) name = this.advance().value;

    this.emit(prefix + name);
    this.eat(TT.LPAREN);
    this.emit('(');
    const typedParams = this.parseParams();
    this.eat(TT.RPAREN);
    this.emit(')');
    const returnType = this.skipReturnTypeAnnotation(); // optional return type annotation
    this.emit(' ');
    this.skipNewlines();

    // Build param check preamble
    const paramChecks = typedParams
      .map(p => `__novaTypeCheck__(${JSON.stringify(p.name)}, ${JSON.stringify(p.type)}, ${p.name});`)
      .join(' ');

    // One-liner:  func add(a, b) a + b   (no braces)
    if (!this.matchType(TT.LBRACE)) {
      const saved = this.out.length;
      this.parseExpr();
      const expr = this.out.splice(saved).join('');
      const wrappedExpr = returnType
        ? `__novaReturnCheck__(${JSON.stringify(name || '<fn>')}, ${JSON.stringify(returnType)}, ${expr})`
        : expr;
      if (paramChecks) {
        this.emit(`{ ${paramChecks} return ${wrappedExpr}; }`);
      } else {
        this.emit(`{ return ${wrappedExpr}; }`);
      }
      return;
    }

    // Block body
    this.parseFuncBlock(paramChecks, name, returnType);
  }

  // Peek ahead (from current pos, which is AT the '{') to decide if
  // this looks like an object-literal body: { key: val, ... } rather than
  // a real block of statements.  Returns true when it looks like an object.
  _looksLikeObjectLiteral() {
    // We scan forward without consuming tokens.
    // Pattern: { (NEWLINE|SPACE)* (IDENT|STR|NUM) : ...
    let i = this.pos; // currently pointing AT the '{'
    i++; // skip '{'
    // skip newlines / nothing (tokens only, whitespace already stripped by lexer)
    while (i < this.tokens.length && this.tokens[i].type === TT.NEWLINE) i++;
    if (i >= this.tokens.length) return false;
    const first = this.tokens[i];
    // key must be IDENT, STR, or NUM
    if (first.type !== TT.IDENT && first.type !== TT.STR && first.type !== TT.NUM) return false;
    const second = this.tokens[i + 1];
    if (!second) return false;
    // Next token after the key must be ':' (COLON) — that's the object key separator
    return second.type === TT.COLON;
  }

  // Parse a function body block { ... }.
  // If the last statement is a bare expression (not return/if/for/…), it becomes `return expr`.
  // Tracks whether any explicit `return` was already emitted in this block level.
  parseFuncBlock(paramChecks = '', fnName = null, returnType = null) {
    // Special case: if the body looks like { key: val, ... } (object literal),
    // emit it as an implicit return of that object rather than parsing as a block.
    if (this._looksLikeObjectLiteral()) {
      if (paramChecks) {
        this.emit(`{ ${paramChecks} return (`);
      } else {
        this.emit('{ return (');
      }
      this.parseObjectLit();
      this.emit('); }');
      return;
    }

    this.advance(); // eat '{'
    this.emit('{');
    this.indent++;
    this.scopePush();
    this.skipNewlines();

    // Track current function's return type for explicit return statements
    const prevReturnType = this._currentReturnType ?? null;
    const prevReturnName = this._currentFnName ?? null;
    this._currentReturnType = returnType;
    this._currentFnName = fnName;

    // Emit parameter type checks at the top of the function body
    if (paramChecks) {
      this.nl();
      this.emit(paramChecks);
    }

    // We'll record, for each statement, whether it was a bare expression statement
    // and the output array positions so we can retroactively insert 'return '.
    // lastExpr = { nlIdx, exprStartIdx } of the last bare-expression statement
    let lastExpr = null;   // { nlIdx, exprStartIdx }
    let hasExplicitReturn = false;

    const CTRL_KW = new Set([
      'if','for','while','do','return','break','continue',
      'throw','try','func','function','fn','class',
      'import','export','switch','print','let','const','var',
    ]);

    while (!this.matchType(TT.RBRACE) && this.cur().type !== TT.EOF) {
      this.skipNewlines();
      if (this.matchType(TT.RBRACE)) break;

      const t = this.cur();
      const isBareExpr =
        t.type !== TT.EOF && t.type !== TT.RBRACE &&
        !(t.type === TT.KEYWORD && CTRL_KW.has(t.value));

      // Record explicit return
      if (t.type === TT.KEYWORD && t.value === 'return') hasExplicitReturn = true;

      // Note position of nl() + start of the expression
      const nlIdx   = this.out.length;      // nl() will push one item here
      this.nl();
      const exprStartIdx = this.out.length; // expression output starts here

      if (isBareExpr) {
        lastExpr = { nlIdx, exprStartIdx };
        this.parseExprStmt();
      } else {
        lastExpr = null; // a control statement resets – it's no longer the last bare expr
        this.parseStmt();
      }

      this.skipNewlines();
    }

    // Implicit return: if last statement was bare expr and no explicit return in this block
    if (lastExpr && !hasExplicitReturn) {
      // out layout for that statement:
      //   out[nlIdx]         = '\n  ...'  (indentation string from nl())
      //   out[exprStartIdx]  = first token of expression
      //   out[...]           = more expr tokens
      //   out[last]          = ';'        (from semi())
      // We insert 'return ' at exprStartIdx (right after the indent string).
      if (returnType) {
        // Wrap the expression in __novaReturnCheck__
        // Find the semicolon at the end and replace the expr with wrapped version
        const exprTokens = this.out.splice(lastExpr.exprStartIdx);
        // Remove trailing semicolon
        const hasSemi = exprTokens[exprTokens.length - 1] === ';';
        if (hasSemi) exprTokens.pop();
        const exprStr = exprTokens.join('');
        this.out.push(`return __novaReturnCheck__(${JSON.stringify(fnName || '<fn>')}, ${JSON.stringify(returnType)}, ${exprStr});`);
      } else {
        this.out.splice(lastExpr.exprStartIdx, 0, 'return ');
      }
    }

    this._currentReturnType = prevReturnType;
    this._currentFnName = prevReturnName;
    this.indent--;
    this.scopePop();
    this.nl();
    this.eat(TT.RBRACE);
    this.emit('}');
  }

  parseParams() {
    // Returns array of { name, type } for typed params
    const typedParams = [];
    let first = true;
    while (!this.matchType(TT.RPAREN) && this.cur().type !== TT.EOF) {
      if (!first) this.emit(', ');
      first = false;
      if (this.matchType(TT.DOTDOTDOT)) { this.advance(); this.emit('...'); }
      const paramName = this.advance().value;
      this.emit(paramName);
      const annoType = this.skipTypeAnnotation(); // optional: param: Type
      const normalizedType = this._normalizeType(annoType);
      this.scopeDeclare(paramName, normalizedType);
      if (normalizedType) typedParams.push({ name: paramName, type: normalizedType });
      if (this.matchType(TT.EQ) || (this.matchType(TT.KEYWORD) && this.matchVal('is'))) { this.advance(); this.emit(' = '); this.parseExpr(); }
      if (this.matchType(TT.COMMA)) this.advance();
    }
    return typedParams;
  }

  parseClass() {
    this.eat(TT.KEYWORD, 'class');
    this.emit('class ');
    if (this.cur().type === TT.IDENT || this.cur().type === TT.KEYWORD) this.emit(this.advance().value + ' ');
    if (this.matchKw('extends') || (this.cur().type === TT.IDENT && this.cur().value === 'extends')) { this.advance(); this.emit('extends '); this.emit(this.advance().value + ' '); }
    this.skipNewlines();
    this.eat(TT.LBRACE);
    this.emit('{');
    this.indent++;
    this.scopePush();
    this.skipNewlines();
    while (!this.matchType(TT.RBRACE) && this.cur().type !== TT.EOF) {
      this.nl();
      this.parseClassMember();
      this.skipNewlines();
    }
    this.scopePop();
    this.indent--;
    this.nl();
    this.eat(TT.RBRACE);
    this.emit('}');
  }

  parseClassMember() {
    this.skipNewlines();
    if (this.cur().type === TT.EOF || this.matchType(TT.RBRACE)) return;

    // static modifier
    let isStatic = false;
    if (this.matchKw('static') || (this.cur().type === TT.IDENT && this.cur().value === 'static')) {
      isStatic = true;
      this.advance();
      this.emit('static ');
    }

    // async modifier
    let isAsync = false;
    if (this.matchKw('async')) {
      isAsync = true;
      this.advance();
      this.emit('async ');
    }

    // get/set accessor
    let accessor = '';
    if (
      (this.cur().type === TT.IDENT || this.cur().type === TT.KEYWORD) &&
      (this.cur().value === 'get' || this.cur().value === 'set') &&
      (this.cur(1).type === TT.IDENT || this.cur(1).type === TT.KEYWORD)
    ) {
      accessor = this.cur().value;
      this.advance();
      this.emit(accessor + ' ');
    }

    // func/function/fn keyword — optional in class body
    if (this.matchKw('func') || this.matchKw('function') || this.matchKw('fn')) {
      this.advance(); // consume keyword, don't emit — class methods don't use 'function'
    }

    // generator: *method()
    if (this.matchType(TT.STAR)) {
      this.advance();
      this.emit('*');
    }

    // method name or field name
    const nameTok = this.cur();
    if (
      nameTok.type !== TT.IDENT &&
      nameTok.type !== TT.KEYWORD &&
      nameTok.type !== TT.STR &&
      nameTok.type !== TT.NUM
    ) {
      // computed: [expr]
      if (nameTok.type === TT.LBRACKET) {
        this.advance(); this.emit('[');
        this.parseExpr();
        this.eat(TT.RBRACKET); this.emit(']');
      } else {
        // unknown — skip
        this.advance();
        return;
      }
    } else {
      this.advance();
      this.emit(nameTok.value);
    }

    this.skipNewlines();

    // Method: name(...) { }
    if (this.matchType(TT.LPAREN)) {
      this.emit('(');
      this.advance();
      this.parseParams();
      this.eat(TT.RPAREN);
      this.emit(') ');
      this.skipReturnTypeAnnotation(); // optional return type
      this.skipNewlines();
      this.parseBlock();
      return;
    }

    // Field assignment: name = expr
    if (this.matchType(TT.EQ)) {
      this.advance();
      this.emit(' = ');
      this.parseExpr();
      this.semi();
      return;
    }

    // Type-annotated field: name: Type = expr  OR  name: Type
    if (this.matchType(TT.COLON)) {
      this.skipTypeAnnotation();
      if (this.matchType(TT.EQ)) {
        this.advance();
        this.emit(' = ');
        this.parseExpr();
      }
      this.semi();
      return;
    }

    // Bare field declaration (no value)
    this.semi();
  }

  parseReturn() {
    this.eat(TT.KEYWORD, 'return');
    if (!this.isLineEnd() && this._currentReturnType) {
      const saved = this.out.length;
      this.parseExpr();
      const expr = this.out.splice(saved).join('');
      this.emit(`return __novaReturnCheck__(${JSON.stringify(this._currentFnName || '<fn>')}, ${JSON.stringify(this._currentReturnType)}, ${expr})`);
    } else {
      this.emit('return');
      if (!this.isLineEnd()) { this.emit(' '); this.parseExpr(); }
    }
    this.semi();
  }

  parseThrow() {
    this.eat(TT.KEYWORD, 'throw');
    this.emit('throw ');
    this.parseExpr();
    this.semi();
  }

  parseTry() {
    this.eat(TT.KEYWORD, 'try');
    this.emit('try ');
    this.parseBlock();
    this.skipNewlines();
    const hasCatch   = this.matchKw('catch');
    const hasFinally = this.matchKw('finally');

    if (hasCatch) {
      this.advance(); this.emit(' catch (');
      if (this.matchType(TT.LPAREN)) {
        this.advance(); this.emit(this.advance().value); this.eat(TT.RPAREN);
      } else if (this.cur().type === TT.IDENT) {
        this.emit(this.advance().value);
      } else {
        this.emit('_e');
      }
      this.emit(') ');
      this.skipNewlines(); this.parseBlock(); this.skipNewlines();
    } else if (!hasFinally) {
      // No catch and no finally — emit silent catch to satisfy JS
      this.emit(' catch (_e) {}');
    }

    if (this.matchKw('finally')) {
      this.advance(); this.emit(' finally '); this.skipNewlines(); this.parseBlock();
    }
  }

  parseImport() {
    this.eat(TT.KEYWORD, 'import');
    this.emit('import ');
    // emit until end of line
    while (!this.isLineEnd()) { this.emitToken(this.advance()); }
    this.semi();
  }

  parseExport() {
    this.eat(TT.KEYWORD, 'export');
    this.emit('export ');
    this.parseStmt();
  }

  // Parse a case expression — like parseExpr but stops at ':' (the case separator)
  // This prevents 'case "foo": x = 1' from being parsed as 'case {"foo": x} = 1'
  parseCaseExpr() {
    // Temporarily override parseObjectLit to not trigger on STR/NUM followed by COLON
    // Strategy: parse only up to ternary level, but block object literal parsing at primary level
    this._inCaseExpr = true;
    this.parseTernary();
    this._inCaseExpr = false;
  }

  parseSwitch() {
    this.eat(TT.KEYWORD, 'switch');
    this.emit('switch (');
    const hp = this.matchType(TT.LPAREN);
    if (hp) this.advance();
    this.parseExpr();
    if (hp) this.eat(TT.RPAREN);
    this.emit(') ');
    this.skipNewlines();
    this.eat(TT.LBRACE);
    this.emit('{\n');
    this.indent++;
    this.skipNewlines();
    while (!this.matchType(TT.RBRACE) && this.cur().type !== TT.EOF) {
      this.skipNewlines();
      if (this.matchKw('case')) {
        this.advance(); this.nl(); this.emit('case '); this.parseCaseExpr(); this.eat(TT.COLON); this.emit(':');
      } else if (this.matchKw('default')) {
        this.advance(); this.nl(); this.emit('default:'); if (this.matchType(TT.COLON)) this.advance();
      } else {
        this.indent++;
        this.nl();
        this.parseStmt();
        this.indent--;
      }
      this.skipNewlines();
    }
    this.indent--;
    this.eat(TT.RBRACE);
    this.nl(); this.emit('}');
  }

  // ── print statement ────────────────────────────────────────
  // print("hello")             → console.log("hello")
  // print({}: table)           → console.table({})
  // print([]: table)           → console.table([])
  // print("": warn)            → console.warn("")
  // print.table(...)           → console.table(...)
  // print: table(...)          → console.table(...)
  parsePrint() {
    this.eat(TT.KEYWORD, 'print');

    // print: table(...) / print: warn(...) / etc
    if (this.matchType(TT.COLON)) {
      this.advance();
      const method = this.advance().value; // table, warn, error, info, etc
      this.emit(`console.${method}(`);
      this.eat(TT.LPAREN);
      this.parseArgList(TT.RPAREN);
      this.eat(TT.RPAREN);
      this.emit(')');
      this.semi();
      return;
    }

    // print.table(...) / print.warn(...)
    if (this.matchType(TT.DOT)) {
      this.advance();
      const method = this.advance().value;
      this.emit(`console.${method}(`);
      this.eat(TT.LPAREN);
      this.parseArgList(TT.RPAREN);
      this.eat(TT.RPAREN);
      this.emit(')');
      this.semi();
      return;
    }

    // print(args...) with optional trailing modifier: print({}: table)
    // Each arg can have its own :method  →  print("a": warn, "b": error)
    // emits: console.warn("a"); console.error("b");
    // All args without a modifier share the last/only method found, or 'log'.
    const hp = this.matchType(TT.LPAREN);
    if (hp) this.advance();

    const emitArg = () => {
      const s = this.out.length;
      this.parseExpr();
      return this.out.splice(s).join('');
    };

    // Collect pairs of [argStr, methodOrNull]
    const pairs = []; // { arg: string, method: string|null }

    while (hp ? !this.matchType(TT.RPAREN) : !this.isLineEnd()) {
      if (this.cur().type === TT.EOF) break;
      const argStr = emitArg();

      if (this.matchType(TT.COLON)) {
        this.advance();
        const m = this.advance().value;
        pairs.push({ arg: argStr, method: m });
      } else {
        pairs.push({ arg: argStr, method: null });
      }

      if (this.matchType(TT.COMMA)) { this.advance(); }
      else break;
    }

    if (hp) { if (this.matchType(TT.RPAREN)) this.advance(); }

    if (pairs.length === 0) {
      this.emit('console.log()');
      this.semi();
      return;
    }

    // If ALL args have no method, emit a single console.log(args...)
    const hasAnyMethod = pairs.some(p => p.method !== null);
    if (!hasAnyMethod) {
      this.emit(`console.log(${pairs.map(p => p.arg).join(', ')})`);
      this.semi();
      return;
    }

    // Mix: group consecutive args with the same method into one call.
    // An arg with no method inherits from the next method found, or 'log' if none.
    // Strategy: resolve each arg's effective method first.
    // Forward-fill: an arg with no method gets the method of the next arg that has one,
    // or 'log' if no subsequent arg has a method.
    const resolved = pairs.map(p => p.method);
    let lastMethod = 'log';
    // backward pass to forward-fill nulls with the next method
    for (let i = resolved.length - 1; i >= 0; i--) {
      if (resolved[i] !== null) { lastMethod = resolved[i]; }
      else { resolved[i] = lastMethod; }
    }

    // Group consecutive same-method args
    const calls = [];
    let i = 0;
    while (i < pairs.length) {
      const m = resolved[i];
      const args = [];
      while (i < pairs.length && resolved[i] === m) {
        args.push(pairs[i].arg);
        i++;
      }
      calls.push({ method: m, args });
    }

    // Emit each call
    calls.forEach((c, idx) => {
      if (idx > 0) { this.emit('; '); }
      this.emit(`console.${c.method}(${c.args.join(', ')})`);
    });
    this.semi();
  }

  parseExprStmt() {
    const t = this.cur();

    // IDENT : Type [= expr]  →  implicit let with type enforcement
    if (
      t.type === TT.IDENT &&
      this.cur(1).type === TT.COLON
    ) {
      const next2 = this.cur(2);
      const next3 = this.cur(3);
      // Exclude: IDENT : IDENT (  →  this is object: method() call syntax, not a type annotation
      const isColonMethodCall = (next2.type === TT.IDENT || next2.type === TT.KEYWORD) && next3.type === TT.LPAREN;
      const isTypeStart = !isColonMethodCall && (next2.type === TT.IDENT || next2.type === TT.KEYWORD ||
                          next2.type === TT.QUESTION || next2.type === TT.LBRACE);
      if (isTypeStart) {
        const varName = this.advance().value; // consume IDENT
        const annoType = this.skipTypeAnnotation(); // consume : Type
        const normalizedType = this._normalizeType(annoType);
        if (normalizedType) this.scopeDeclare(varName, normalizedType);
        this.emit(`let ${varName}`);
        if (this.matchType(TT.EQ) || (this.matchType(TT.KEYWORD) && this.matchVal('is'))) {
          this.advance();
          this.emit(' = ');
          this._emitCheckedExpr(varName, normalizedType);
        }
        this.semi();
        return;
      }
    }

    // ALL_CAPS IDENT = expr  →  const IDENT = expr  (implicit const)
    if (
      t.type === TT.IDENT &&
      /^[A-Z][A-Z0-9_]*$/.test(t.value) &&
      (this.cur(1).type === TT.EQ || (this.cur(1).type === TT.KEYWORD && this.cur(1).value === 'is'))
    ) {
      const name = this.advance().value; // consume IDENT
      this.advance();                    // consume = or 'is'
      this.emit(`const ${name} = `);
      this.parseExpr();
      this.semi();
      return;
    }

    this.parseExpr();
    this.semi();
  }

  // ── block ─────────────────────────────────────────────────
  parseBlock() {
    if (this.matchType(TT.LBRACE)) {
      this.advance();
      this.emit('{');
      this.indent++;
      this.scopePush();
      this.skipNewlines();
      while (!this.matchType(TT.RBRACE) && this.cur().type !== TT.EOF) {
        this.nl();
        this.parseStmt();
        this.skipNewlines();
      }
      this.scopePop();
      this.indent--;
      this.nl();
      this.eat(TT.RBRACE);
      this.emit('}');
    } else {
      // single-statement block
      this.skipNewlines();
      this.scopePush();
      this.emit('{ ');
      this.parseStmt();
      this.emit(' }');
      this.scopePop();
    }
  }

  // ── expressions ───────────────────────────────────────────
  parseExpr() { return this.parseTernary(); }

  // Like parseExpr but skips assignment-level type-checking.
  // Used when collecting sub-expressions as strings (for loop parts, etc.)
  // so that a typed variable like `x: number` doesn't emit __novaTypeCheck__
  // into a for-loop increment/bound expression.
  _parseRawExpr() { return this._parseTernaryRaw(); }
  _parseTernaryRaw() {
    this._parseOrRaw();
    if (this.matchType(TT.QUESTION)) {
      this.advance(); this.emit(' ? ');
      this._parseRawExpr();
      this.eat(TT.COLON); this.emit(' : ');
      this._parseRawExpr();
    }
  }
  _parseOrRaw() {
    this._parseAndRaw();
    while (this.matchType(TT.OR) || this.matchType(TT.NULLCOAL) || this.matchKw('or')) {
      const tok = this.advance();
      const op = tok.value === 'or' ? '||' : tok.value;
      this.emit(` ${op} `); this._parseAndRaw();
    }
  }
  _parseAndRaw() {
    this._parseEqualityRaw();
    while (this.matchType(TT.AND) || this.matchKw('and')) {
      this.advance(); this.emit(' && '); this._parseEqualityRaw();
    }
  }
  _parseEqualityRaw() {
    this._parseRelationalRaw();
    while (true) {
      if (this.matchType(TT.EQEQ) || this.matchType(TT.EQEQEQ) || this.matchKw('equal')) {
        this.advance(); this.emit(' === '); this._parseRelationalRaw();
      } else if (this.matchType(TT.EQLOOSE)) {
        this.advance(); this.emit(' == '); this._parseRelationalRaw();
      } else if (this.matchType(TT.NEQ) || this.matchType(TT.NEQEQ) || this.matchKw('isNot') || this.matchKw('notEqual')) {
        this.advance(); this.emit(' !== '); this._parseRelationalRaw();
      } else if (this.matchType(TT.NEQLOOSE)) {
        this.advance(); this.emit(' != '); this._parseRelationalRaw();
      } else break;
    }
  }
  _parseRelationalRaw() {
    this._parseAddSubRaw();
    while (true) {
      if (this.matchType(TT.GTE) || this.matchKw('greaterEqual')) { this.advance(); this.emit(' >= '); this._parseAddSubRaw(); }
      else if (this.matchType(TT.LTE) || this.matchKw('lessEqual')) { this.advance(); this.emit(' <= '); this._parseAddSubRaw(); }
      else if (this.matchType(TT.GT) || this.matchKw('greaterThan'))  { this.advance(); this.emit(' > ');  this._parseAddSubRaw(); }
      else if (this.matchType(TT.LT) || this.matchKw('lessThan'))  { this.advance(); this.emit(' < ');  this._parseAddSubRaw(); }
      else if (this.matchKw('instanceof')) {
        const kw = this.advance().value; this.emit(` ${kw} `); this._parseAddSubRaw();
      }
      else break;
    }
  }
  _parseAddSubRaw() {
    this._parseMulDivRaw();
    while (this.matchType(TT.PLUS) || this.matchType(TT.MINUS)) {
      const op = this.advance().value; this.emit(` ${op} `); this._parseMulDivRaw();
    }
  }
  _parseMulDivRaw() {
    this._parseUnaryRaw();
    while (this.matchType(TT.STAR) || this.matchType(TT.SLASH) || this.matchType(TT.PERCENT) || this.matchType(TT.STARSTAR) || this.matchType(TT.CARET)) {
      const op = this.advance();
      this.emit(` ${op.type === TT.CARET ? '**' : op.value} `);
      this._parseUnaryRaw();
    }
  }
  _parseUnaryRaw() {
    if (this.matchType(TT.NOT) || this.matchKw('not')) { this.advance(); this.emit('!'); this._parseUnaryRaw(); return; }
    if (this.matchType(TT.MINUS))  { this.advance(); this.emit('-'); this._parseUnaryRaw(); return; }
    if (this.matchType(TT.PLUS))   { this.advance(); this.emit('+'); this._parseUnaryRaw(); return; }
    if (this.matchKw('typeof'))    { this.advance(); this.emit('typeof '); this._parseUnaryRaw(); return; }
    if (this.matchKw('await'))     { this.advance(); this.emit('await '); this._parseUnaryRaw(); return; }
    if (this.matchKw('delete'))    { this.advance(); this.emit('delete '); this._parseUnaryRaw(); return; }
    if (this.matchType(TT.PLUSPLUS))   { this.advance(); this.emit('++'); this._parseUnaryRaw(); return; }
    if (this.matchType(TT.MINUSMINUS)) { this.advance(); this.emit('--'); this._parseUnaryRaw(); return; }
    this.parsePostfix();
  }

  parseTernary() {
    this.parseAssign();
    if (this.matchType(TT.QUESTION)) {
      this.advance(); this.emit(' ? ');
      this.parseExpr();
      this.eat(TT.COLON); this.emit(' : ');
      this.parseExpr();
    }
  }

  parseAssign() {
    // Peek ahead to detect:
    //   IDENT = expr              → simple var assignment
    //   IDENT . IDENT = expr      → member assignment on shaped var
    const lhsNameTok = (this.cur().type === TT.IDENT) ? this.cur() : null;
    const lhsMemberField = (
      lhsNameTok &&
      this.cur(1).type === TT.DOT &&
      this.cur(2).type === TT.IDENT &&
      this.cur(3).type === TT.EQ
    ) ? this.cur(2).value : null;

    const lhsStartIdx = this.out.length;
    this.parseOr();
    const t = this.cur();
    const assignOps = [TT.EQ, TT.PLUSEQ, TT.MINUSEQ, TT.STAREQ, TT.SLASHEQ, TT.PERCENTEQ];
    // 'is' keyword acts as '=' assignment (e.g.  x is 10  →  x = 10)
    const isIsAssign = t.type === TT.KEYWORD && t.value === 'is';
    if (assignOps.includes(t.type) || isIsAssign) {
      const lhsTokens = this.out.slice(lhsStartIdx);
      const lhsStr = lhsTokens.join('');

      const op = this.advance();
      // 'is' always emits '='
      this.emit(` ${isIsAssign ? '=' : op.value} `);

      if ((op.type === TT.EQ || isIsAssign) && lhsNameTok) {
        const lhsName = lhsNameTok.value;
        const knownType = this.typeEnv[lhsName];

        // Case 1: simple var — user = ...
        const isSimpleIdent = lhsTokens.length === 1 && lhsTokens[0] === lhsName;
        if (knownType && isSimpleIdent) {
          if (knownType.__shape) {
            this.emit(`__novaShapeCheck__(${JSON.stringify(lhsName)}, ${JSON.stringify(knownType.fields)}, `);
          } else {
            this.emit(`__novaTypeCheck__(${JSON.stringify(lhsName)}, ${JSON.stringify(knownType)}, `);
          }
          this.parseAssign();
          this.emit(')');
          return;
        }

        // Case 2: member assignment — user.name = ...
        if (lhsMemberField && knownType && knownType.__shape) {
          const field = knownType.fields.find(f => f.key === lhsMemberField);
          if (field) {
            const fieldPath = `${lhsName}.${lhsMemberField}`;
            if (field.type && typeof field.type === 'object' && field.type.__shape) {
              this.emit(`__novaShapeCheck__(${JSON.stringify(fieldPath)}, ${JSON.stringify(field.type.fields)}, `);
            } else {
              const ft = (field.type || 'any').replace(/\?/g, '').trim().toLowerCase();
              if (ft && ft !== 'any') {
                this.emit(`__novaTypeCheck__(${JSON.stringify(fieldPath)}, ${JSON.stringify(ft)}, `);
              } else {
                this.parseAssign(); return;
              }
            }
            this.parseAssign();
            this.emit(')');
            return;
          }
        }
      }
      this.parseAssign();
    }
  }

  parseOr() {
    this.parseAnd();
    while (this.matchType(TT.OR) || this.matchType(TT.NULLCOAL) || this.matchKw('or')) {
      const tok = this.advance();
      const op = tok.value === 'or' ? '||' : tok.value;
      this.emit(` ${op} `); this.parseAnd();
    }
  }

  parseAnd() {
    this.parseEquality();
    while (this.matchType(TT.AND) || this.matchKw('and')) {
      const op = this.advance().value === 'and' ? '&&' : '&&';
      this.emit(` ${op} `); this.parseEquality();
    }
  }

  parseEquality() {
    this.parseRelational();
    while (true) {
      if (this.matchType(TT.EQEQ) || this.matchType(TT.EQEQEQ) || this.matchKw('equal')) {
        // == and === and equal all → ===  (strict)
        this.advance(); this.emit(' === '); this.parseRelational();
      } else if (this.matchType(TT.EQLOOSE)) {
        // ?= → == (loose)
        this.advance(); this.emit(' == '); this.parseRelational();
      } else if (this.matchType(TT.NEQ) || this.matchType(TT.NEQEQ) || this.matchKw('isNot') || this.matchKw('notEqual')) {
        // != and !== and isNot and notEqual all → !==  (strict)
        this.advance(); this.emit(' !== '); this.parseRelational();
      } else if (this.matchType(TT.NEQLOOSE)) {
        // ?!= → != (loose)
        this.advance(); this.emit(' != '); this.parseRelational();
      } else break;
    }
  }

  parseRelational() {
    this.parseAddSub();
    while (true) {
      if (this.matchType(TT.GTE) || this.matchKw('greaterEqual')) { this.advance(); this.emit(' >= '); this.parseAddSub(); }
      else if (this.matchType(TT.LTE) || this.matchKw('lessEqual')) { this.advance(); this.emit(' <= '); this.parseAddSub(); }
      else if (this.matchType(TT.GT) || this.matchKw('greaterThan'))  { this.advance(); this.emit(' > ');  this.parseAddSub(); }
      else if (this.matchType(TT.LT) || this.matchKw('lessThan'))  { this.advance(); this.emit(' < ');  this.parseAddSub(); }
      else if (this.matchKw('instanceof') || this.matchKw('in')) {
        const kw = this.advance().value; this.emit(` ${kw} `); this.parseAddSub();
      }
      else break;
    }
  }

  parseAddSub() {
    const startIdx = this.out.length;
    this.parseMulDiv();
    while (this.matchType(TT.PLUS) || this.matchType(TT.MINUS)) {
      const op = this.advance().value;
      const leftTokens = this.out.splice(startIdx);
      const leftStr = leftTokens.join('');
      const rightStart = this.out.length;
      this.parseMulDiv();
      const rightTokens = this.out.splice(rightStart);
      const rightStr = rightTokens.join('');
      this.out.splice(startIdx); // clear anything leftover
      this.emit(`__novaOp__(${leftStr}, ${JSON.stringify(op)}, ${rightStr})`);
    }
  }

  parseMulDiv() {
    const startIdx = this.out.length;
    this.parseUnary();
    while (this.matchType(TT.STAR) || this.matchType(TT.SLASH) || this.matchType(TT.PERCENT) || this.matchType(TT.STARSTAR) || this.matchType(TT.CARET)) {
      const op = this.advance();
      const opStr = op.type === TT.CARET ? '**' : op.value;
      if (opStr === '*' || opStr === '/') {
        const leftTokens = this.out.splice(startIdx);
        const leftStr = leftTokens.join('');
        const rightStart = this.out.length;
        this.parseUnary();
        const rightTokens = this.out.splice(rightStart);
        const rightStr = rightTokens.join('');
        this.out.splice(startIdx);
        this.emit(`__novaOp__(${leftStr}, ${JSON.stringify(opStr)}, ${rightStr})`);
      } else {
        this.emit(` ${opStr} `);
        this.parseUnary();
      }
    }
  }

  parseUnary() {
    if (this.matchType(TT.NOT) || this.matchKw('not')) { this.advance(); this.emit('!'); this.parseUnary(); return; }
    if (this.matchType(TT.MINUS))  { this.advance(); this.emit('-'); this.parseUnary(); return; }
    if (this.matchType(TT.PLUS))   { this.advance(); this.emit('+'); this.parseUnary(); return; }
    if (this.matchKw('typeof'))    { this.advance(); this.emit('typeof '); this.parseUnary(); return; }
    if (this.matchKw('await'))     { this.advance(); this.emit('await '); this.parseUnary(); return; }
    if (this.matchKw('delete'))    { this.advance(); this.emit('delete '); this.parseUnary(); return; }
    if (this.matchType(TT.PLUSPLUS))   { this.advance(); this.emit('++'); this.parseUnary(); return; }
    if (this.matchType(TT.MINUSMINUS)) { this.advance(); this.emit('--'); this.parseUnary(); return; }
    this.parsePostfix();
  }

  // Check if a call site uses the NOVA colon-method syntax:
  //   object(args: method)  or  object(args: method1, args: method2)
  // Returns null if not detected, or an array of { argStr, method } if detected.
  _tryColonMethodArgs() {
    const savedPos    = this.pos;
    const savedOutLen = this.out.length;
    try {
      this.skipNewlines();
      if (this.matchType(TT.RPAREN)) return null;
      const groups = [];
      while (!this.matchType(TT.RPAREN) && this.cur().type !== TT.EOF) {
        this.skipNewlines();
        if (this.matchType(TT.RPAREN)) break;
        const argSaved = this.out.length;
        this.parseExpr();
        const argStr = this.out.splice(argSaved).join('');
        this.skipNewlines();
        if (!this.matchType(TT.COLON)) throw new Error('bail');
        this.advance();
        const methodTok = this.cur();
        if (methodTok.type !== TT.IDENT && methodTok.type !== TT.KEYWORD) throw new Error('bail');
        const method = this.advance().value;
        groups.push({ argStr, method });
        this.skipNewlines();
        if (this.matchType(TT.COMMA)) { this.advance(); this.skipNewlines(); }
      }
      if (!this.matchType(TT.RPAREN)) throw new Error('bail');
      if (groups.length === 0) throw new Error('bail');
      this.advance(); // consume ')'
      return groups;
    } catch(e) {
      this.pos = savedPos;
      this.out.splice(savedOutLen);
      return null;
    }
  }

  parsePostfix() {
    this._objExprStart = this.out.length;
    this.parsePrimary();
    while (true) {
      if (this.matchType(TT.PLUSPLUS))   { this.advance(); this.emit('++'); this._objExprStart = this.out.length; }
      else if (this.matchType(TT.MINUSMINUS)) { this.advance(); this.emit('--'); this._objExprStart = this.out.length; }
      else if (this.matchType(TT.DOT) || this.matchType(TT.OPTCHAIN)) {
        const op = this.advance().value;
        this.emit(op);
        const prop = this.advance().value;
        this.emit(prop);
        if (this.matchType(TT.LPAREN)) {
          const savedObjExprStart2 = this._objExprStart;
          this.advance();
          const groups = this._tryColonMethodArgs();
          this._objExprStart = savedObjExprStart2;
          if (groups !== null) {
            const objStr = this.out.splice(this._objExprStart).join('');
            groups.forEach((g, idx) => {
              if (idx > 0) this.emit('; ');
              this.emit(`${objStr}.${g.method}(${g.argStr})`);
            });
            if (groups.length > 1) break;
            break;
          } else {
            this.emit('(');
            this.parseArgList(TT.RPAREN);
            this.eat(TT.RPAREN); this.emit(')');
            this._objExprStart = this.out.length;
          }
        }
        // bare .prop: do NOT reset _objExprStart so obj.prop(arg: method) still works
      }
      // object: method()  →  object.method()
      else if (this.matchType(TT.COLON)) {
        const next = this.cur(1);
        const afterNext = this.cur(2);
        const CTRL_KW = new Set(['if','else','for','while','do','return','break','continue',
          'switch','case','default','throw','try','catch','finally',
          'function','func','fn','class','new','import','export']);
        const isValidMethod =
          (next.type === TT.IDENT ||
           (next.type === TT.KEYWORD && !CTRL_KW.has(next.value))) &&
          afterNext.type === TT.LPAREN;
        if (isValidMethod) {
          this.advance();
          const method = this.advance().value;
          this.emit('.' + method);
          this.advance(); this.emit('(');
          this.parseArgList(TT.RPAREN);
          this.eat(TT.RPAREN); this.emit(')');
          this._objExprStart = this.out.length;
        } else {
          break;
        }
      }
      else if (this.matchType(TT.LBRACKET)) {
        this.advance();
        // Detect float literal index: arr[0.5]
        const isFloatLiteral = this.cur().type === TT.NUM &&
          String(this.cur().value).includes('.') &&
          !Number.isInteger(Number(this.cur().value));
        if (isFloatLiteral) {
          const idxVal = this.advance().value;
          this.eat(TT.RBRACKET);
          // Check if followed by assignment
          const isAssign = this.cur().type === TT.EQ ||
            (this.cur().type === TT.KEYWORD && this.cur().value === 'is');
          if (isAssign) {
            // arr[0.5] = val  →  __novaArrSet__(arr, 0.5, val)
            this.advance(); // consume = or is
            const objStr = this.out.splice(this._objExprStart).join('');
            const valStart = this.out.length;
            this.parseAssign();
            const valStr = this.out.splice(valStart).join('');
            this.emit(`__novaArrSet__(${objStr}, ${idxVal}, ${valStr})`);
          } else {
            // arr[0.5]  →  null (float read always returns null)
            this.out.splice(this._objExprStart);
            this.emit('null');
          }
        } else {
          this.emit('[');
          this.parseExpr();
          this.eat(TT.RBRACKET); this.emit(']');
        }
        this._objExprStart = this.out.length;
      }
      else if (this.matchType(TT.LPAREN)) {
        const savedObjExprStart = this._objExprStart;
        this.advance();
        const groups = this._tryColonMethodArgs();
        this._objExprStart = savedObjExprStart;
        if (groups !== null) {
          const objStr = this.out.splice(this._objExprStart).join('');
          groups.forEach((g, idx) => {
            if (idx > 0) this.emit('; ');
            this.emit(`${objStr}.${g.method}(${g.argStr})`);
          });
          if (groups.length > 1) break;
          break;
        } else {
          this.emit('(');
          this.skipNewlines();
          this.parseArgList(TT.RPAREN);
          this.skipNewlines();
          this.eat(TT.RPAREN); this.emit(')');
          this._objExprStart = this.out.length;
        }
      }
      else break;
    }
  }

  parsePrimary() {
    const t = this.cur();

    if (t.type === TT.NUM)  { this.advance(); this.emit(t.value); return; }
    if (t.type === TT.BOOL) { this.advance(); this.emit(String(t.value)); return; }
    if (t.type === TT.NULL) { this.advance(); this.emit('null'); return; }
    if (t.type === TT.UNDEF){ this.advance(); this.emit('undefined'); return; }

    if (t.type === TT.STR)  {
      this.advance();
      // re-quote
      const escaped = t.value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\t/g,'\\t');
      this.emit(`"${escaped}"`);
      return;
    }

    if (t.type === TT.TMPL) { this.advance(); this.emit(t.value); return; }

    if (t.type === TT.IDENT) {
      // arrow with single param: x => body  (no parens) — check BEFORE emitting ident
      if (this.cur(1).type === TT.ARROW) {
        this.advance(); // consume ident
        this.advance(); // consume =>
        this.emit(t.value + ' => ');
        this.skipNewlines();
        if (this.matchType(TT.LBRACE)) { this.parseBlock(); }
        else this.parseExpr();
        return;
      }
      this.advance();
      this.emit(t.value);
      return;
    }

    if (t.type === TT.KEYWORD) {
      switch(t.value) {
        case 'true': case 'false': this.advance(); this.emit(t.value); return;
        case 'null':  this.advance(); this.emit('null'); return;
        case 'undefined': this.advance(); this.emit('undefined'); return;
        case 'this':  this.advance(); this.emit('this'); return;
        case 'super': this.advance(); this.emit('super'); return;
        case 'new':   this.advance(); this.emit('new '); this.parsePostfix(); return;
        case 'async': {
          this.advance();
          if (this.matchKw('function') || this.matchKw('func')) {
            this.advance(); this.emit('async function ');
            if (this.cur().type === TT.IDENT) this.emit(this.advance().value);
            this.eat(TT.LPAREN); this.emit('(');
            this.parseParams(); this.eat(TT.RPAREN); this.emit(') ');
            this.skipNewlines(); this.parseBlock();
          } else {
            // async arrow
            this.emit('async (');
            if (this.matchType(TT.LPAREN)) { this.advance(); this.parseParams(); this.eat(TT.RPAREN); }
            else this.emit(this.advance().value);
            this.emit(') => ');
            if (this.matchType(TT.LBRACE)) this.parseBlock();
            else { this.skipNewlines(); this.parseExpr(); }
          }
          return;
        }
        case 'yield': this.advance(); this.emit('yield '); this.parseExpr(); return;
        // fall through remaining keywords as identifiers
        default: this.advance(); this.emit(t.value); return;
      }
    }

    if (t.type === TT.LPAREN) {
      this.advance();
      // Try to detect arrow function: (params) => body
      const arrowCheck = this.tryArrow();
      if (arrowCheck) return;
      // Regular grouped expression
      this.emit('(');
      this.parseExpr();
      this.eat(TT.RPAREN); this.emit(')');
      // Shouldn't happen after tryArrow rollback, but guard anyway
      if (this.matchType(TT.ARROW)) {
        this.advance(); this.emit(' => ');
        if (this.matchType(TT.LBRACE)) { this.skipNewlines(); this.parseBlock(); }
        else this.parseExpr();
      }
      return;
    }

    if (t.type === TT.LBRACE) {
      this.parseObjectLit();
      return;
    }

    if (t.type === TT.LBRACKET) {
      this.advance(); this.emit('[');
      this.skipNewlines();
      let first = true;
      while (!this.matchType(TT.RBRACKET) && this.cur().type !== TT.EOF) {
        if (!first) this.emit(', '); first = false;
        this.skipNewlines();
        if (this.matchType(TT.RBRACKET)) break;
        if (this.matchType(TT.DOTDOTDOT)) { this.advance(); this.emit('...'); }
        this.parseExpr();
        this.skipNewlines();
        if (this.matchType(TT.COMMA)) { this.advance(); this.skipNewlines(); }
      }
      this.eat(TT.RBRACKET); this.emit(']');
      return;
    }

    if (t.type === TT.DOTDOTDOT) { this.advance(); this.emit('...'); this.parseExpr(); return; }

    // unknown — emit raw
    this.advance();
    this.emit(t.value ?? '');
  }

  tryArrow() {
    // pos is right after the '(' was consumed (but NOT yet emitted)
    const savedPos    = this.pos;
    const savedOutLen = this.out.length;
    try {
      const params = [];
      while (!this.matchType(TT.RPAREN) && this.cur().type !== TT.EOF) {
        if (this.matchType(TT.NEWLINE)) { this.advance(); continue; }
        if (this.matchType(TT.DOTDOTDOT)) { this.advance(); params.push('...'); }
        const p = this.advance();
        if (p.type !== TT.IDENT) throw new Error('bail');
        // handle rest param
        const last = params[params.length - 1];
        if (last === '...') { params[params.length - 1] = '...' + p.value; }
        else { params.push(p.value); }
        if (this.matchType(TT.EQ)) throw new Error('bail'); // default params bail
        // Type annotation on arrow param: (x: number) => ... — skip type silently
        if (this.matchType(TT.COLON)) {
          this.advance(); // consume ':'
          // consume type tokens until , or )
          while (this.cur().type !== TT.EOF &&
                 this.cur().type !== TT.COMMA &&
                 this.cur().type !== TT.RPAREN) {
            const tt = this.cur().type;
            if (tt === TT.IDENT || tt === TT.KEYWORD || tt === TT.OR ||
                tt === TT.LT || tt === TT.GT || tt === TT.LBRACKET ||
                tt === TT.RBRACKET || tt === TT.QUESTION || tt === TT.AND ||
                tt === TT.NULL || tt === TT.UNDEF) {
              this.advance();
            } else {
              break;
            }
          }
        }
        if (this.matchType(TT.COMMA)) this.advance();
      }
      if (this.cur().type !== TT.RPAREN) throw new Error('bail');
      this.advance(); // ')'
      if (!this.matchType(TT.ARROW)) throw new Error('bail');
      this.advance(); // '=>'

      // Confirmed arrow — emit (params) => body
      this.emit('(' + params.join(', ') + ') => ');
      this.skipNewlines();
      if (this.matchType(TT.LBRACE)) { this.parseBlock(); }
      else { this.parseExpr(); }
      return true;
    } catch(e) {
      this.pos = savedPos;
      this.out.splice(savedOutLen);
      return false;
    }
  }

  parseObjectLit(expectedShape = null) {
    this.advance(); this.emit('{');
    this.skipNewlines();
    let first = true;
    while (!this.matchType(TT.RBRACE) && this.cur().type !== TT.EOF) {
      this.skipNewlines();
      if (this.matchType(TT.RBRACE)) break;
      if (!first) this.emit(', '); first = false;

      if (this.matchType(TT.DOTDOTDOT)) { this.advance(); this.emit('...'); this.parseExpr(); }
      else if ((this.matchType(TT.IDENT) || this.matchType(TT.KEYWORD) || this.matchType(TT.STR) || this.matchType(TT.NUM)) && this.cur(1).type === TT.COLON) {
        this.emitToken(this.advance()); // key
        this.advance(); this.emit(': ');
        this.parseExpr();
      }
      else if (this.matchType(TT.LBRACKET)) {
        // computed key: [expr]: val
        this.advance(); this.emit('['); this.parseExpr(); this.eat(TT.RBRACKET); this.emit(']');
        this.eat(TT.COLON); this.emit(': '); this.parseExpr();
      }
      else if ((this.matchKw('get') || this.matchKw('set') || this.matchKw('async')) &&
                this.cur(1).type === TT.IDENT) {
        this.emit(this.advance().value + ' ');
        this.emit(this.advance().value);
        this.eat(TT.LPAREN); this.emit('('); this.parseParams(); this.eat(TT.RPAREN); this.emit(') ');
        this.parseBlock();
      }
      else if (this.cur(1).type === TT.LPAREN) {
        // method shorthand
        this.emitToken(this.advance());
        this.eat(TT.LPAREN); this.emit('('); this.parseParams(); this.eat(TT.RPAREN); this.emit(') ');
        this.parseBlock();
      }
      else {
        // shorthand  { name }  — validate against scope and expected shape
        const keyTok = this.cur();
        const keyName = keyTok.value;
        const keyLine = keyTok.line;

        if (expectedShape) {
          // Check variable exists in scope
          const scopeType = this.scopeLookup(keyName);
          if (scopeType === undefined) {
            throw new SyntaxError(`[Line ${keyLine}] Cannot find name '${keyName}' in current scope`);
          }
          // Check type matches the shape field
          const field = expectedShape.fields.find(f => f.key === keyName);
          if (field && field.type && field.type !== 'any' && scopeType) {
            const expectedFieldType = typeof field.type === 'string'
              ? field.type.replace(/\?/g, '').trim().toLowerCase()
              : null;
            const actualType = typeof scopeType === 'object' && scopeType.__shape
              ? '__shape__'
              : String(scopeType).toLowerCase();
            if (expectedFieldType && expectedFieldType !== 'any' && actualType !== expectedFieldType) {
              throw new SyntaxError(`[Line ${keyLine}] Type error: shorthand '${keyName}' has type '${actualType}' but field '${keyName}' expects '${expectedFieldType}'`);
            }
          }
        }

        this.emitToken(this.advance());
      }

      this.skipNewlines();
      if (this.matchType(TT.COMMA)) { this.advance(); this.skipNewlines(); }
    }
    this.eat(TT.RBRACE); this.emit('}');
  }

  parseArgList(endToken) {
    let first = true;
    this.skipNewlines();
    while (!this.matchType(endToken) && this.cur().type !== TT.EOF) {
      if (!first) this.emit(', '); first = false;
      this.skipNewlines();
      if (this.matchType(endToken)) break;
      if (this.matchType(TT.DOTDOTDOT)) { this.advance(); this.emit('...'); }
      this.parseExpr();
      this.skipNewlines();
      if (this.matchType(TT.COMMA)) { this.advance(); this.skipNewlines(); }
    }
  }

  emitToken(t) {
    if (t.type === TT.STR) {
      const esc = t.value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n');
      this.emit(`"${esc}"`);
    } else if (t.type === TT.TMPL) {
      this.emit(t.value);
    } else {
      this.emit(String(t.value ?? ''));
    }
  }
}

// ============================================================
// NOVA RUNTIME  — injected at top of every compiled output
// ============================================================
const NOVA_RUNTIME = `
// ── Operator overloading ────────────────────────────────────────
function __novaOp__(left, op, right) {
  const typeOf = (v) => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  };
  const L = typeOf(left);
  const R = typeOf(right);
  const err = () => { throw new TypeError(\`[NOVA] Unsupported operation: \${L} \${op} \${R}\`); };

  // ── NULL rules (identity element) ──────────────────────────────
  if (op === '+') {
    if (L === 'null') return right;
    if (R === 'null') return left;
  }
  if (op === '-') {
    if (L === 'null') return null;
    if (R === 'null' && L !== 'array') return left;
  }
  if (op === '*') {
    if (L === 'null' || R === 'null') return null;
  }
  if (op === '/') {
    if (R === 'null') throw new TypeError('[NOVA] Division by null');
    if (L === 'null') return null;
  }

  // ── BOOLEAN coercion ────────────────────────────────────────────
  // Boolean acts as number (0/1) when paired with number or boolean
  // and as "true"/"false" string when paired with string
  if (L === 'boolean' || R === 'boolean') {
    if (op === '*') {
      // String * Boolean → return string or ""
      if (L === 'string') return right ? left : '';
      // Boolean * String → return string or ""
      if (R === 'string') return left ? right : '';
      // Array * Boolean → return array or []
      if (L === 'array') return right ? left : [];
      if (R === 'array') return left ? right : [];
    }
    // Boolean used as number for arithmetic
    const toNum = (v) => v === true ? 1 : v === false ? 0 : v;
    if ((L === 'boolean' || L === 'number') && (R === 'boolean' || R === 'number')) {
      if (op === '+') return toNum(left) + toNum(right);
      if (op === '-') return toNum(left) - toNum(right);
      if (op === '*') return toNum(left) * toNum(right);
      if (op === '/') {
        if (toNum(right) === 0) throw new TypeError('[NOVA] Division by zero (false)');
        return toNum(left) / toNum(right);
      }
    }
    // Boolean + String / String + Boolean → concatenation
    if ((L === 'boolean' && R === 'string') || (L === 'string' && R === 'boolean')) {
      if (op === '+') return String(left) + String(right);
      err();
    }
  }

  // ── PLUS (+) ────────────────────────────────────────────────────
  if (op === '+') {
    // Number + Number
    if (L === 'number' && R === 'number') return left + right;
    // String + String
    if (L === 'string' && R === 'string') return left + right;
    // Number + String | String + Number
    if (L === 'number' && R === 'string') return String(left) + right;
    if (L === 'string' && R === 'number') return left + String(right);
    // Array + Array
    if (L === 'array' && R === 'array') return [...left, ...right];
    // Array + Number → push to end
    if (L === 'array' && R === 'number') return [...left, right];
    // Number + Array → unshift to start
    if (L === 'number' && R === 'array') return [left, ...right];
    // Array + String → push to end
    if (L === 'array' && R === 'string') return [...left, right];
    // String + Array → unshift to start
    if (L === 'string' && R === 'array') return [left, ...right];
    // Array + Boolean → push to end
    if (L === 'array' && R === 'boolean') return [...left, right];
    // Boolean + Array → unshift to start
    if (L === 'boolean' && R === 'array') return [left, ...right];
    // Object + Object → merge
    if (L === 'object' && R === 'object') return Object.assign({}, left, right);
    // Object + String → add attr with string name and value
    if (L === 'object' && R === 'string') return Object.assign({}, left, { [right]: right });
    // Object + Number → add attr with number key and value
    if (L === 'object' && R === 'number') return Object.assign({}, left, { [String(right)]: right });
    err();
  }

  // ── MINUS (-) ───────────────────────────────────────────────────
  if (op === '-') {
    // Number - Number
    if (L === 'number' && R === 'number') return left - right;
    // String - Number → remove last N chars
    if (L === 'string' && R === 'number') return left.slice(0, Math.max(0, left.length - right));
    // Number - String → remove first N chars (N = left)
    if (L === 'number' && R === 'string') return right.slice(left);
    // String - String → remove first occurrence of right in left
    if (L === 'string' && R === 'string') return left.replace(right, '');
    // Array - Number → remove last N elements
    if (L === 'array' && R === 'number') return left.slice(0, Math.max(0, left.length - right));
    // Number - Array → remove first N elements
    if (L === 'number' && R === 'array') return right.slice(left);
    // Array - String → remove all occurrences of string
    if (L === 'array' && R === 'string') return left.filter(v => v !== right);
    // Array - Boolean → remove all occurrences of boolean
    if (L === 'array' && R === 'boolean') return left.filter(v => v !== right);
    // Array - Null → remove all nulls
    if (L === 'array' && R === 'null') return left.filter(v => v !== null);
    // Array - Array → posicional: remove from right array elements matching left by position
    if (L === 'array' && R === 'array') {
      const result = [...right];
      for (let i = 0; i < left.length; i++) {
        if (i < result.length && result[i] === left[i]) {
          result.splice(i, 1);
          // adjust i since we removed an element
          // but we continue checking remaining positions
        }
      }
      // Simpler interpretation confirmed: remove from RIGHT the elements that match LEFT positionally
      const res2 = [...right];
      const toRemove = [];
      for (let i = 0; i < left.length && i < res2.length; i++) {
        if (res2[i] === left[i]) toRemove.push(i);
      }
      return res2.filter((_, i) => !toRemove.includes(i));
    }
    // Object - String → remove property
    if (L === 'object' && R === 'string') { const o = Object.assign({}, left); delete o[right]; return o; }
    // Object - Number → remove property with numeric key
    if (L === 'object' && R === 'number') { const o = Object.assign({}, left); delete o[String(right)]; delete o[right]; return o; }
    // Object - Array → remove all keys listed in array
    if (L === 'object' && R === 'array') {
      const o = Object.assign({}, left);
      right.forEach(k => delete o[k]);
      return o;
    }
    // Object - Object → remove keys from left that exist in right
    if (L === 'object' && R === 'object') {
      const o = Object.assign({}, left);
      Object.keys(right).forEach(k => delete o[k]);
      return o;
    }
    err();
  }

  // ── MULTIPLY (*) ────────────────────────────────────────────────
  if (op === '*') {
    // Number * Number
    if (L === 'number' && R === 'number') return left * right;
    // String * Number | Number * String → repeat
    if (L === 'string' && R === 'number') return left.repeat(Math.max(0, Math.floor(right)));
    if (L === 'number' && R === 'string') return right.repeat(Math.max(0, Math.floor(left)));
    // Array * Number → repeat array
    if (L === 'array' && R === 'number') {
      let r = [];
      for (let i = 0; i < Math.max(0, Math.floor(right)); i++) r = r.concat(left);
      return r;
    }
    // Number * Array → multiply each element
    if (L === 'number' && R === 'array') return right.map(v => __novaOp__(left, '*', v));
    // Array * Array → zip with multiplication
    if (L === 'array' && R === 'array') {
      const len = Math.max(left.length, right.length);
      const result = [];
      for (let i = 0; i < len; i++) {
        const a = i < left.length ? left[i] : (typeof left[0] === 'number' ? 1 : null);
        const b = i < right.length ? right[i] : (typeof right[0] === 'number' ? 1 : null);
        if (typeof a === 'number' && typeof b === 'number') {
          result.push(a * b);
        } else if (a === null || b === null) {
          result.push(null);
        } else {
          result.push([a, b]);
        }
      }
      return result;
    }
    // Object * Object → merge, multiply common numeric keys
    if (L === 'object' && R === 'object') {
      const result = Object.assign({}, left);
      for (const k of Object.keys(right)) {
        if (k in result) {
          const lv = result[k], rv = right[k];
          if (typeof lv === 'number' && typeof rv === 'number') result[k] = lv * rv;
          else result[k] = [lv, rv];
        } else {
          result[k] = right[k];
        }
      }
      return result;
    }
    // Object * Number | Number * Object → multiply each numeric value
    if (L === 'object' && R === 'number') {
      const result = {};
      for (const [k, v] of Object.entries(left)) result[k] = __novaOp__(v, '*', right);
      return result;
    }
    if (L === 'number' && R === 'object') {
      const result = {};
      for (const [k, v] of Object.entries(right)) result[k] = __novaOp__(left, '*', v);
      return result;
    }
    err();
  }

  // ── DIVIDE (/) ──────────────────────────────────────────────────
  if (op === '/') {
    // Number / Number
    if (L === 'number' && R === 'number') {
      if (right === 0) throw new TypeError('[NOVA] Division by zero');
      return left / right;
    }
    // String / String → split
    if (L === 'string' && R === 'string') return left.split(right);
    // String / Number → split into chunks of size N
    if (L === 'string' && R === 'number') {
      if (right <= 0) throw new TypeError('[NOVA] Chunk size must be > 0');
      const chunks = [];
      for (let i = 0; i < left.length; i += right) chunks.push(left.slice(i, i + right));
      return chunks;
    }
    // Array / Number → partition into subarrays of size N
    if (L === 'array' && R === 'number') {
      if (right <= 0) throw new TypeError('[NOVA] Partition size must be > 0');
      const chunks = [];
      for (let i = 0; i < left.length; i += right) chunks.push(left.slice(i, i + right));
      return chunks;
    }
    // Array / String → split array by separator value
    if (L === 'array' && R === 'string') {
      const result = [];
      let current = [];
      for (const v of left) {
        if (v === right) { result.push(current); current = []; }
        else current.push(v);
      }
      result.push(current);
      return result;
    }
    // Array / Array → zip of divisions
    if (L === 'array' && R === 'array') {
      const len = Math.max(left.length, right.length);
      const result = [];
      for (let i = 0; i < len; i++) {
        const a = i < left.length ? left[i] : 1;
        const b = i < right.length ? right[i] : 1;
        result.push(__novaOp__(a, '/', b));
      }
      return result;
    }
    // Object / Object → divide values of common keys
    if (L === 'object' && R === 'object') {
      const result = Object.assign({}, left);
      for (const k of Object.keys(right)) {
        if (k in result) result[k] = __novaOp__(result[k], '/', right[k]);
      }
      return result;
    }
    // Object / Number → divide each numeric value
    if (L === 'object' && R === 'number') {
      if (right === 0) throw new TypeError('[NOVA] Division by zero');
      const result = {};
      for (const [k, v] of Object.entries(left)) result[k] = __novaOp__(v, '/', right);
      return result;
    }
    err();
  }

  err();
}

// ── Type checking ──────────────────────────────────────────────
function __novaTypeCheck__(name, expectedType, value) {
  let actualType;
  if (expectedType === 'array') {
    actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== 'array') {
      throw new TypeError(\`[NOVA] Type error: variable "\${name}" expects array but got \${actualType}\`);
    }
    return value;
  }
  const primitives = new Set(['number','string','boolean','object','function','undefined']);
  if (primitives.has(expectedType)) {
    actualType = typeof value;
    if (value === null) actualType = 'null';
    if (actualType !== expectedType) {
      throw new TypeError(\`[NOVA] Type error: variable "\${name}" expects \${expectedType} but got \${actualType}\`);
    }
    return value;
  }
  return value;
}

function __novaReturnCheck__(fnName, expectedType, value) {
  if (expectedType === 'void') {
    // void: warn if something was returned, but don't throw
    return value;
  }
  // null-safe: type ending in '?' accepts null/undefined
  const nullable = expectedType.endsWith('?');
  const baseType = nullable ? expectedType.slice(0, -1) : expectedType;
  if (nullable && (value === null || value === undefined)) return value;

  // union: "number|null" etc.
  if (baseType.includes('|')) {
    const accepted = baseType.split('|').map(t => t.trim());
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (accepted.includes(actual) || accepted.includes('any')) return value;
    throw new TypeError(\`[NOVA] Return type error: function "\${fnName}" expects \${expectedType} but got \${actual}\`);
  }

  if (baseType === 'any' || baseType === '') return value;

  let actual;
  if (value === null)          actual = 'null';
  else if (Array.isArray(value)) actual = 'array';
  else                           actual = typeof value;

  if (baseType === 'array') {
    if (!Array.isArray(value))
      throw new TypeError(\`[NOVA] Return type error: function "\${fnName}" expects array but got \${actual}\`);
    return value;
  }

  const primitives = new Set(['number','string','boolean','object','function','undefined']);
  if (primitives.has(baseType) && actual !== baseType)
    throw new TypeError(\`[NOVA] Return type error: function "\${fnName}" expects \${expectedType} but got \${actual}\`);

  return value;
}

function __novaShapeCheck__(name, fields, value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(\`[NOVA] Type error: variable "\${name}" expects object shape but got \${Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value}\`);
  }
  for (const field of fields) {
    const exists = Object.prototype.hasOwnProperty.call(value, field.key);
    if (!field.optional && !exists) {
      throw new TypeError(\`[NOVA] Type error: variable "\${name}" is missing required field "\${field.key}"\`);
    }
    if (exists && field.type && field.type !== 'any') {
      const fval = value[field.key];
      // nested shape
      if (field.type && typeof field.type === 'object' && field.type.__shape) {
        __novaShapeCheck__(\`\${name}.\${field.key}\`, field.type.fields, fval);
      } else {
        const expectedType = field.type.replace(/\\?/g, '').trim().toLowerCase();
        const primitives = new Set(['number','string','boolean','object','function','undefined']);
        if (primitives.has(expectedType)) {
          const actualType = fval === null ? 'null' : Array.isArray(fval) ? 'array' : typeof fval;
          if (actualType !== expectedType) {
            throw new TypeError(\`[NOVA] Type error: "\${name}.\${field.key}" expects \${expectedType} but got \${actualType}\`);
          }
        } else if (expectedType === 'array') {
          if (!Array.isArray(fval)) {
            throw new TypeError(\`[NOVA] Type error: "\${name}.\${field.key}" expects array but got \${typeof fval}\`);
          }
        }
      }
    }
  }
  return value;
}

// ── print ─────────────────────────────────────────────────────
const print = (...args) => console.log(...args);
print.table = (...args) => console.table(...args);
print.warn  = (...args) => console.warn(...args);
print.error = (...args) => console.error(...args);
print.info  = (...args) => console.info(...args);
print.dir   = (...args) => console.dir(...args);
print.group = (...args) => console.group(...args);
print.groupEnd = () => console.groupEnd();
print.time  = (label) => console.time(label);
print.timeEnd = (label) => console.timeEnd(label);
print.count = (label) => console.count(label);
print.assert = (cond, ...args) => console.assert(cond, ...args);
print.clear = () => console.clear();

// ── NovaElement — wraps a DOM element ─────────────────────────
class NovaElement {
  constructor(el) {
    this._el = el;
    if (!el) return;
    // proxy-like: forward property access to the raw element
    return new Proxy(this, {
      get(target, key) {
        if (key in target) {
          // Check if it's a getter on the prototype — if so, return the value directly
          // without .bind(), because bind() creates a new function that loses sub-properties
          // (e.g. box.class returns fn with .add/.remove/.toggle etc.)
          const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), key);
          if (desc && desc.get) return desc.get.call(target);
          const val = target[key];
          return typeof val === 'function' ? val.bind(target) : val;
        }
        const val = target._el[key];
        return typeof val === 'function' ? val.bind(target._el) : val;
      },
      set(target, key, value) {
        if (key in target) { target[key] = value; return true; }
        try {
          target._el[key] = value;
        } catch(_) {
          // silently ignore read-only / getter-only properties on the DOM element
        }
        return true;
      }
    });
  }

  // .class → gets class string | .class("name") → sets className
  get class() {
    const self = this;
    const fn = (name) => { self._el.className = name; return self; };
    fn[Symbol.toPrimitive] = () => self._el.className;
    fn.toString = () => self._el.className;
    fn.add    = (...c) => { self._el.classList.add(...c); return self; };
    fn.remove = (...c) => { self._el.classList.remove(...c); return self; };
    fn.toggle = (c, f) => { self._el.classList.toggle(c, f); return self; };
    fn.has    = (c) => self._el.classList.contains(c);
    fn.list   = () => [...self._el.classList];
    return fn;
  }

  // .id → gets id | .id("new") → sets id
  get id() {
    const self = this;
    const fn = (v) => { if (v !== undefined) { self._el.id = v; return self; } return self._el.id; };
    fn[Symbol.toPrimitive] = () => self._el.id;
    fn.toString = () => self._el.id;
    return fn;
  }

  // .attr("name") → gets | .attr("name", "value") → sets
  attr(name, value) {
    if (value === undefined) return this._el.getAttribute(name);
    this._el.setAttribute(name, value);
    return this;
  }

  // .style({ fontSize: "10px" }) | .style("font-size: 10px") | .style("color") → getter
  style(input) {
    if (input === undefined) return this._el.style.cssText;
    if (typeof input === 'string' && !input.includes(':') && !input.includes(';')) {
      return this._el.style[input] || getComputedStyle(this._el)[input];
    }
    if (typeof input === 'string') {
      this._el.style.cssText += ';' + input;
    } else if (input !== null && typeof input === 'object') {
      // Use Object.keys to only iterate own enumerable properties,
      // avoiding any Object.prototype methods added by the NOVA runtime.
      for (const key of Object.keys(input)) {
        try { this._el.style[key] = input[key]; } catch(_) {}
      }
    }
    return this;
  }

  // .text / .text("value")
  get text() {
    const self = this;
    const fn = (v) => { if (v !== undefined) { self._el.textContent = v; return self; } return self._el.textContent; };
    fn[Symbol.toPrimitive] = () => self._el.textContent;
    return fn;
  }

  // .html / .html("value")
  get html() {
    const self = this;
    const fn = (v) => { if (v !== undefined) { self._el.innerHTML = v; return self; } return self._el.innerHTML; };
    fn[Symbol.toPrimitive] = () => self._el.innerHTML;
    return fn;
  }

  // .val / .val("value") — for inputs
  get val() {
    const self = this;
    const fn = (v) => { if (v !== undefined) { self._el.value = v; return self; } return self._el.value; };
    fn[Symbol.toPrimitive] = () => self._el.value;
    return fn;
  }

  // .on("click", fn)
  on(event, fn, opts) { this._el.addEventListener(event, fn, opts); return this; }
  off(event, fn)       { this._el.removeEventListener(event, fn); return this; }
  once(event, fn)      { this._el.addEventListener(event, fn, { once: true }); return this; }

  // .append(el | NovaElement | string)
  append(...items) {
    for (const item of items) {
      if (item instanceof NovaElement) this._el.appendChild(item._el);
      else if (item instanceof HTMLElement) this._el.appendChild(item);
      else this._el.insertAdjacentHTML('beforeend', String(item));
    }
    return this;
  }

  prepend(...items) {
    for (const item of [...items].reverse()) {
      if (item instanceof NovaElement) this._el.prepend(item._el);
      else this._el.insertAdjacentHTML('afterbegin', String(item));
    }
    return this;
  }

  remove()       { this._el.remove(); return this; }
  clone(deep=true) { return new NovaElement(this._el.cloneNode(deep)); }

  // .find(selector) → NovaElement
  find(sel) { return _wrapEl(this._el.querySelector(sel)); }
  findAll(sel) { return [...this._el.querySelectorAll(sel)].map(_wrapEl); }

  // .data(key) / .data(key, value)
  data(key, value) {
    if (value === undefined) return this._el.dataset[key];
    this._el.dataset[key] = value;
    return this;
  }

  // .show() / .hide() / .toggle()
  show(display = '') { this._el.style.display = display; return this; }
  hide()             { this._el.style.display = 'none'; return this; }
  toggle(display='') {
    this._el.style.display = this._el.style.display === 'none' ? display : 'none';
    return this;
  }

  // .focus() / .blur() / .click()
  focus() { this._el.focus(); return this; }
  blur()  { this._el.blur();  return this; }
  click() { this._el.click(); return this; }

  // .scroll(opts)
  scroll(opts) { this._el.scrollIntoView(opts); return this; }

  // .rect() — getBoundingClientRect
  rect() { return this._el.getBoundingClientRect(); }

  // .el — raw element
  get el() { return this._el; }
}

// NovaElementList — array of NovaElement with bulk operations
class NovaElementList extends Array {
  on(event, fn, opts) { this.forEach(el => el.on(event, fn, opts)); return this; }
  style(input)        { this.forEach(el => el.style(input)); return this; }
  attr(k, v)          { this.forEach(el => el.attr(k, v)); return this; }
  text(v)             { this.forEach(el => el.text(v)); return this; }
  html(v)             { this.forEach(el => el.html(v)); return this; }
  show(d)             { this.forEach(el => el.show(d)); return this; }
  hide()              { this.forEach(el => el.hide()); return this; }
  remove()            { this.forEach(el => el.remove()); return this; }
  append(...items)    { this.forEach(el => el.append(...items)); return this; }
  class(name)         { this.forEach(el => el._el.className = name); return this; }
}

function _wrapEl(el) {
  if (!el) return null;
  return new NovaElement(el);
}

// ── dom ──────────────────────────────────────────────────────
const dom = (typeof document !== 'undefined') ? {
  // dom.get(selector) → querySelector
  get(selector) {
    return _wrapEl(document.querySelector(selector));
  },

  // dom.id(id) → getElementById
  id(id) {
    return _wrapEl(document.getElementById(id));
  },

  // dom.getAll(selector) → querySelectorAll → NovaElementList
  getAll(selector) {
    const list = new NovaElementList();
    document.querySelectorAll(selector).forEach(el => list.push(_wrapEl(el)));
    return list;
  },

  // dom.classAll(className) → all elements with class
  classAll(className) {
    const list = new NovaElementList();
    document.getElementsByClassName(className.replace(/^\\./, ''))
      .forEach ? [...document.getElementsByClassName(className.replace(/^\\./, ''))].forEach(el => list.push(_wrapEl(el)))
               : Array.from(document.getElementsByClassName(className.replace(/^\\./, ''))).forEach(el => list.push(_wrapEl(el)));
    return list;
  },

  // dom.tag(tag) → getElementsByTagName → NovaElementList
  tag(tag) {
    const list = new NovaElementList();
    Array.from(document.getElementsByTagName(tag)).forEach(el => list.push(_wrapEl(el)));
    return list;
  },

  // dom.create(tag, attrs?, content?) → NovaElement
  create(tag, attrs, content) {
    const el = document.createElement(tag);
    if (attrs && typeof attrs === 'object') {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'class') el.className = v;
        else if (k === 'text')  el.textContent = v;
        else if (k === 'html')  el.innerHTML = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
      }
    }
    if (content !== undefined) {
      if (content instanceof NovaElement) el.appendChild(content._el);
      else if (content instanceof HTMLElement) el.appendChild(content);
      else el.innerHTML = String(content);
    }
    return _wrapEl(el);
  },

  // dom.body, dom.head, dom.html
  get body()  { return _wrapEl(document.body); },
  get head()  { return _wrapEl(document.head); },
  get root()  { return _wrapEl(document.documentElement); },

  // dom.ready(fn)
  ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
    return dom;
  },

  // dom.on(selector, event, fn) — delegated event
  on(selector, event, fn) {
    document.addEventListener(event, e => {
      if (e.target.closest(selector)) fn.call(e.target.closest(selector), e);
    });
    return dom;
  },

  // dom.off(event, fn) — on document
  off(event, fn) { document.removeEventListener(event, fn); return dom; },

  // dom.title / dom.title = val
  get title()    { return document.title; },
  set title(v)   { document.title = v; },

  // dom.load(url) — load external script
  load(url) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  },

  // dom.css(text) — inject style
  css(text) {
    const s = document.createElement('style');
    s.textContent = text;
    document.head.appendChild(s);
    return dom;
  },

  // dom.cookie(name) / dom.cookie(name, value, opts)
  cookie(name, value, opts = {}) {
    if (value === undefined) {
      const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    }
    let c = \`\${name}=\${encodeURIComponent(value)}\`;
    if (opts.days)   c += \`; max-age=\${opts.days * 86400}\`;
    if (opts.path)   c += \`; path=\${opts.path}\`;
    if (opts.secure) c += '; secure';
    document.cookie = c;
    return dom;
  },
} : new Proxy({}, {
  get(_, key) {
    if (key === 'then') return undefined; // prevent Promise confusion
    return (...args) => { throw new Error(\`[NOVA] dom.\${key}() is not available in Node.js\`); };
  }
});


// ── canvas ───────────────────────────────────────────────────
class NovaCanvas {
  constructor(el) {
    this._canvas = el instanceof NovaElement ? el._el : el;
    this._ctx = this._canvas.getContext('2d');
    this._ = this._ctx; // direct ctx access
  }

  // size
  size(w, h) { this._canvas.width = w; this._canvas.height = h; return this; }
  get width()  { return this._canvas.width; }
  get height() { return this._canvas.height; }

  // clear
  clear(color) {
    if (color) { this.fill(color); this.rect(0, 0, this.width, this.height); }
    else this._ctx.clearRect(0, 0, this.width, this.height);
    return this;
  }

  // style
  fill(color)   { this._ctx.fillStyle = color; return this; }
  stroke(color) { this._ctx.strokeStyle = color; return this; }
  lineWidth(w)  { this._ctx.lineWidth = w; return this; }
  opacity(v)    { this._ctx.globalAlpha = v; return this; }
  font(f)       { this._ctx.font = f; return this; }
  textAlign(a)  { this._ctx.textAlign = a; return this; }
  textBaseline(b){ this._ctx.textBaseline = b; return this; }
  shadow(color, blur, x = 0, y = 0) {
    this._ctx.shadowColor = color;
    this._ctx.shadowBlur  = blur;
    this._ctx.shadowOffsetX = x;
    this._ctx.shadowOffsetY = y;
    return this;
  }
  noShadow() { this._ctx.shadowColor = 'transparent'; this._ctx.shadowBlur = 0; return this; }
  lineCap(c)  { this._ctx.lineCap = c; return this; }
  lineJoin(j) { this._ctx.lineJoin = j; return this; }
  blend(mode) { this._ctx.globalCompositeOperation = mode; return this; }

  // shapes
  rect(x, y, w, h, r) {
    if (r) {
      this._roundRect(x, y, w, h, r);
      this._ctx.fill();
    } else {
      this._ctx.fillRect(x, y, w, h);
    }
    return this;
  }
  rectStroke(x, y, w, h, r) {
    if (r) { this._roundRect(x, y, w, h, r); this._ctx.stroke(); }
    else    this._ctx.strokeRect(x, y, w, h);
    return this;
  }
  _roundRect(x, y, w, h, r) {
    this._ctx.beginPath();
    this._ctx.moveTo(x + r, y);
    this._ctx.lineTo(x + w - r, y);
    this._ctx.arcTo(x + w, y, x + w, y + r, r);
    this._ctx.lineTo(x + w, y + h - r);
    this._ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    this._ctx.lineTo(x + r, y + h);
    this._ctx.arcTo(x, y + h, x, y + h - r, r);
    this._ctx.lineTo(x, y + r);
    this._ctx.arcTo(x, y, x + r, y, r);
    this._ctx.closePath();
  }

  circle(x, y, r) { this._ctx.beginPath(); this._ctx.arc(x, y, r, 0, Math.PI * 2); this._ctx.fill(); return this; }
  circleStroke(x, y, r) { this._ctx.beginPath(); this._ctx.arc(x, y, r, 0, Math.PI * 2); this._ctx.stroke(); return this; }
  ellipse(x, y, rx, ry, rot = 0) { this._ctx.beginPath(); this._ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); this._ctx.fill(); return this; }
  ellipseStroke(x, y, rx, ry, rot = 0) { this._ctx.beginPath(); this._ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); this._ctx.stroke(); return this; }

  line(x1, y1, x2, y2) { this._ctx.beginPath(); this._ctx.moveTo(x1, y1); this._ctx.lineTo(x2, y2); this._ctx.stroke(); return this; }
  lines(...pts) {
    this._ctx.beginPath();
    this._ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) this._ctx.lineTo(pts[i], pts[i+1]);
    this._ctx.stroke();
    return this;
  }
  poly(...pts) {
    this._ctx.beginPath();
    this._ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) this._ctx.lineTo(pts[i], pts[i+1]);
    this._ctx.closePath(); this._ctx.fill();
    return this;
  }
  polyStroke(...pts) {
    this._ctx.beginPath();
    this._ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) this._ctx.lineTo(pts[i], pts[i+1]);
    this._ctx.closePath(); this._ctx.stroke();
    return this;
  }

  arc(x, y, r, startDeg, endDeg, ccw = false) {
    this._ctx.beginPath();
    this._ctx.arc(x, y, r, startDeg * Math.PI/180, endDeg * Math.PI/180, ccw);
    this._ctx.stroke();
    return this;
  }
  arcFill(x, y, r, startDeg, endDeg, ccw = false) {
    this._ctx.beginPath();
    this._ctx.arc(x, y, r, startDeg * Math.PI/180, endDeg * Math.PI/180, ccw);
    this._ctx.fill();
    return this;
  }

  bezier(x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2) {
    this._ctx.beginPath(); this._ctx.moveTo(x1, y1);
    this._ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
    this._ctx.stroke();
    return this;
  }
  quadratic(x1, y1, cpx, cpy, x2, y2) {
    this._ctx.beginPath(); this._ctx.moveTo(x1, y1);
    this._ctx.quadraticCurveTo(cpx, cpy, x2, y2);
    this._ctx.stroke();
    return this;
  }

  // text
  text(str, x, y, maxWidth) {
    maxWidth !== undefined ? this._ctx.fillText(str, x, y, maxWidth) : this._ctx.fillText(str, x, y);
    return this;
  }
  textStroke(str, x, y, maxWidth) {
    maxWidth !== undefined ? this._ctx.strokeText(str, x, y, maxWidth) : this._ctx.strokeText(str, x, y);
    return this;
  }
  measureText(str) { return this._ctx.measureText(str); }

  // image
  image(img, x, y, w, h, sx, sy, sw, sh) {
    const el = img instanceof NovaElement ? img._el : img;
    if (sw !== undefined) this._ctx.drawImage(el, sx, sy, sw, sh, x, y, w, h);
    else if (w !== undefined) this._ctx.drawImage(el, x, y, w, h);
    else this._ctx.drawImage(el, x, y);
    return this;
  }

  // path
  begin()         { this._ctx.beginPath(); return this; }
  move(x, y)      { this._ctx.moveTo(x, y); return this; }
  to(x, y)        { this._ctx.lineTo(x, y); return this; }
  close()         { this._ctx.closePath(); return this; }
  fillPath()      { this._ctx.fill(); return this; }
  strokePath()    { this._ctx.stroke(); return this; }
  clip()          { this._ctx.clip(); return this; }

  // gradient
  linearGradient(x1, y1, x2, y2, stops) {
    const g = this._ctx.createLinearGradient(x1, y1, x2, y2);
    for (const [pos, color] of Object.entries(stops)) g.addColorStop(pos, color);
    return g;
  }
  radialGradient(x1, y1, r1, x2, y2, r2, stops) {
    const g = this._ctx.createRadialGradient(x1, y1, r1, x2, y2, r2);
    for (const [pos, color] of Object.entries(stops)) g.addColorStop(pos, color);
    return g;
  }

  // transform
  translate(x, y) { this._ctx.translate(x, y); return this; }
  rotate(deg)     { this._ctx.rotate(deg * Math.PI/180); return this; }
  scale(x, y = x) { this._ctx.scale(x, y); return this; }
  save()          { this._ctx.save(); return this; }
  restore()       { this._ctx.restore(); return this; }
  reset()         { this._ctx.setTransform(1, 0, 0, 1, 0, 0); return this; }
  transform(a,b,c,d,e,f) { this._ctx.transform(a,b,c,d,e,f); return this; }

  // pixel
  pixel(x, y, color) {
    this._ctx.fillStyle = color;
    this._ctx.fillRect(x, y, 1, 1);
    return this;
  }
  getPixel(x, y) { return this._ctx.getImageData(x, y, 1, 1).data; }
  imageData(x=0, y=0, w=this.width, h=this.height) { return this._ctx.getImageData(x, y, w, h); }
  putImageData(data, x=0, y=0) { this._ctx.putImageData(data, x, y); return this; }

  // snapshot
  toDataURL(type='image/png', quality=1) { return this._canvas.toDataURL(type, quality); }
  toBlob(cb, type='image/png', quality=1) { this._canvas.toBlob(cb, type, quality); return this; }

  // loop
  loop(fn) {
    let id;
    let frame = 0;
    const tick = (ts) => { fn(ts, frame++); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }
}

// ── window API ───────────────────────────────────────────────
// Extends the global window object with Nova-style helpers.
// Only active in browser context.
if (typeof window !== 'undefined') {
  // ── Events
  window.on   = (event, fn, opts) => { window.addEventListener(event, fn, opts);   return window; };
  window.off  = (event, fn)       => { window.removeEventListener(event, fn);       return window; };
  window.once = (event, fn)       => { window.addEventListener(event, fn, { once: true }); return window; };

  // ── Common event shorthands
  window.ready  = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
    return window;
  };
  window.resize = (fn, opts) => { window.addEventListener('resize',  fn, { passive: true, ...opts }); return window; };
  window.scroll = (fn, opts) => { window.addEventListener('scroll',  fn, { passive: true, ...opts }); return window; };
  window.key    = (fn, opts) => { window.addEventListener('keydown', fn, opts); return window; };
  window.keyUp  = (fn, opts) => { window.addEventListener('keyup',   fn, opts); return window; };

  // ── Size
  Object.defineProperty(window, 'size', {
    get() { return { w: window.innerWidth, h: window.innerHeight }; },
    configurable: true,
  });

  // ── Navigation
  window.goto   = (url)  => { location.href = url; };
  window.reload = ()     => location.reload();
  window.back   = ()     => history.back();
  window.forward= ()     => history.forward();
  window.push   = (url, state = {}) => history.pushState(state, '', url);
  window.replace= (url, state = {}) => history.replaceState(state, '', url);

  // ── hash
  Object.defineProperty(window, 'hash', {
    get() { return location.hash.slice(1); },
    set(v) { location.hash = v; },
    configurable: true,
  });

  // ── URLSearchParams sugar
  window.query = (key) => new URLSearchParams(location.search).get(key);

  // ── localStorage wrapper
  window.storage = {
    get(key)        { try { return JSON.parse(localStorage.getItem(key)); } catch { return localStorage.getItem(key); } },
    set(key, value) { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); return window.storage; },
    remove(key)     { localStorage.removeItem(key); return window.storage; },
    clear()         { localStorage.clear(); return window.storage; },
    has(key)        { return localStorage.getItem(key) !== null; },
    keys()          { return Object.keys(localStorage); },
  };

  // ── sessionStorage wrapper
  window.session = {
    get(key)        { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return sessionStorage.getItem(key); } },
    set(key, value) { sessionStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); return window.session; },
    remove(key)     { sessionStorage.removeItem(key); return window.session; },
    clear()         { sessionStorage.clear(); return window.session; },
    has(key)        { return sessionStorage.getItem(key) !== null; },
    keys()          { return Object.keys(sessionStorage); },
  };

  // ── Clipboard
  window.copy  = (text) => navigator.clipboard.writeText(text);
  window.paste = ()     => navigator.clipboard.readText();

  // ── Timers (return cancel fn)
  window.wait    = (ms, fn) => { const id = setTimeout(fn, ms);    return () => clearTimeout(id); };
  window.every   = (ms, fn) => { const id = setInterval(fn, ms);   return () => clearInterval(id); };
  window.nextFrame = (fn)   => { const id = requestAnimationFrame(fn); return () => cancelAnimationFrame(id); };

  // ── Idle (runs when browser is idle)
  window.idle = (fn) => {
    if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(fn);
    else setTimeout(fn, 0);
  };

  // ── matchMedia sugar
  window.mq = (query) => window.matchMedia(query).matches;
}

// canvas(selector | el) → NovaCanvas
const canvas = (typeof document !== 'undefined')
  ? (selectorOrEl) => {
      const el = typeof selectorOrEl === 'string'
        ? document.querySelector(selectorOrEl)
        : (selectorOrEl instanceof NovaElement ? selectorOrEl._el : selectorOrEl);
      return new NovaCanvas(el);
    }
  : () => { throw new Error('[NOVA] canvas() is not available in Node.js'); };



// ── Nova Array decimal index ──────────────────────────────────
function __novaArrGet__(arr, idx) {
  if (typeof idx === 'number' && !Number.isInteger(idx) && idx >= 0) return null;
  return arr[idx];
}
function __novaArrSet__(arr, idx, val) {
  if (typeof idx === 'number' && !Number.isInteger(idx) && idx >= 0) {
    arr.splice(Math.ceil(idx), 0, val);
  } else {
    arr[idx] = val;
  }
}

// ── range helper ─────────────────────────────────────────────
const range = (startOrEnd, end, step = 1) => {
  const arr = [];
  const start = end === undefined ? 0 : startOrEnd;
  const to    = end === undefined ? startOrEnd : end;
  if (step > 0) for (let i = start; i < to; i += step) arr.push(i);
  else          for (let i = start; i > to; i += step) arr.push(i);
  return arr;
};

// ── random ───────────────────────────────────────────────────
// random()          → Math.random()
// random(max)       → 0..max
// random(min, max)  → min..max
// random(array)     → random element
const random = (a, b) => {
  if (a === undefined)        return Math.random();
  if (Array.isArray(a))       return a[Math.floor(Math.random() * a.length)];
  if (b === undefined)        return Math.random() * a;
  return a + Math.random() * (b - a);
};
const randomInt = (a, b) => {
  if (b === undefined) return Math.floor(Math.random() * a);
  return Math.floor(a + Math.random() * (b - a + 1));
};

// ── math extras ──────────────────────────────────────────────
const clamp  = (v, min, max) => Math.min(Math.max(v, min), max);
const lerp   = (a, b, t) => a + (b - a) * t;
const map    = (v, inMin, inMax, outMin, outMax) => outMin + (v - inMin) / (inMax - inMin) * (outMax - outMin);
const norm   = (v, min, max) => (v - min) / (max - min);
const deg2rad = (d) => d * Math.PI / 180;
const rad2deg = (r) => r * 180 / Math.PI;
const dist   = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const dist3  = (x1, y1, z1, x2, y2, z2) => Math.hypot(x2-x1, y2-y1, z2-z1);
const sign   = (v) => Math.sign(v);
const frac   = (v) => v - Math.floor(v);
const mod    = (v, m) => ((v % m) + m) % m; // always positive modulo
const smoothstep = (edge0, edge1, x) => { const t = clamp((x-edge0)/(edge1-edge0),0,1); return t*t*(3-2*t); };
const smootherstep = (edge0, edge1, x) => { const t = clamp((x-edge0)/(edge1-edge0),0,1); return t*t*t*(t*(t*6-15)+10); };
const mix    = lerp; // alias
const sum    = (...args) => (Array.isArray(args[0]) ? args[0] : args).reduce((a,b) => a+b, 0);
const avg    = (...args) => { const a = Array.isArray(args[0]) ? args[0] : args; return sum(a) / a.length; };
const gcd    = (a, b) => b === 0 ? Math.abs(a) : gcd(b, a % b);
const lcm    = (a, b) => Math.abs(a * b) / gcd(a, b);
const isPrime = (n) => { if (n < 2) return false; for (let i=2,s=Math.sqrt(n);i<=s;i++) if(n%i===0) return false; return true; };
const factorial = (n) => n <= 1 ? 1 : n * factorial(n-1);
const fibonacci = (n) => { let a=0,b=1; for(let i=0;i<n;i++){[a,b]=[b,a+b];} return a; };
const log2   = (v) => Math.log2(v);
const log10  = (v) => Math.log10(v);
const loge   = (v) => Math.log(v);

// ── string prototype extensions ──────────────────────────────
// Use getter descriptors so they appear as methods on all strings
Object.defineProperties(String.prototype, {
  // "hello".upper() → "HELLO"
  upper: { get() { return () => this.toUpperCase(); }, configurable: true },
  // "HELLO".lower() → "hello"
  lower: { get() { return () => this.toLowerCase(); }, configurable: true },
  // "123".number() → 123
  number: { get() { return () => {
    const n = parseFloat(this);
    return isNaN(n) ? 0 : n;
  }}, configurable: true },
  // "hello".int() → 0  (parseInt)
  int: { get() { return () => parseInt(this, 10) || 0; }, configurable: true },
  // "hello world".words() → ["hello","world"]
  words: { get() { return () => this.trim().split(/\\s+/); }, configurable: true },
  // "a,b,c".split(",") already exists — add chars()
  chars: { get() { return () => [...this]; }, configurable: true },
  // "hello".capitalize()
  capitalize: { get() { return () => this.charAt(0).toUpperCase() + this.slice(1); }, configurable: true },
  // "hello world".title()
  title: { get() { return () => this.replace(/\\b\\w/g, c => c.toUpperCase()); }, configurable: true },
  // "  hi  ".trim() already exists — alias
  strip: { get() { return () => this.trim(); }, configurable: true },
  // "hello".repeat already exists
  // "hello".pad(10) / "hello".pad(10, "0")
  pad:  { get() { return (n, ch=' ') => this.padStart(n, ch); }, configurable: true },
  padR: { get() { return (n, ch=' ') => this.padEnd(n, ch); }, configurable: true },
  // "abc".has("a") → true
  has: { get() { return (sub) => this.includes(sub); }, configurable: true },
  // "hello world".count("l") → 3
  count: { get() { return (sub) => this.split(sub).length - 1; }, configurable: true },
  // "hello".reverse()
  reverse: { get() { return () => [...this].reverse().join(''); }, configurable: true },
  // "hi\\nbye".lines()
  lines: { get() { return () => this.split('\\n'); }, configurable: true },
  // "hello".bytes() → Uint8Array
  bytes: { get() { return () => new TextEncoder().encode(this); }, configurable: true },
  // "hello".is(type)  "hello".is("string") → true
  is: { get() { return (t) => typeof this.valueOf() === t; }, configurable: true },
});

// ── number prototype extensions ──────────────────────────────
Object.defineProperties(Number.prototype, {
  // (3.7).floor() → 3
  floor:  { get() { return () => Math.floor(this); }, configurable: true },
  // (3.2).ceil() → 4
  ceil:   { get() { return () => Math.ceil(this); }, configurable: true },
  // (3.567).round(2) → 3.57
  round:  { get() { return (decimals=0) => {
    const f = Math.pow(10, decimals);
    return Math.round(this * f) / f;
  }}, configurable: true },
  // (42).string() → "42"
  string: { get() { return () => String(this.valueOf()); }, configurable: true },
  // (0.5).clamp(0,1)
  clamp:  { get() { return (min, max) => Math.min(Math.max(this, min), max); }, configurable: true },
  // (3).abs()
  abs:    { get() { return () => Math.abs(this); }, configurable: true },
  // (2).pow(8) → 256
  pow:    { get() { return (exp) => Math.pow(this, exp); }, configurable: true },
  // (4).sqrt()
  sqrt:   { get() { return () => Math.sqrt(this); }, configurable: true },
  // (1).lerp(10, 0.5) → 5.5
  lerp:   { get() { return (to, t) => this + (to - this) * t; }, configurable: true },
  // (45).deg2rad()
  deg2rad:{ get() { return () => this * Math.PI / 180; }, configurable: true },
  // (Math.PI).rad2deg()
  rad2deg:{ get() { return () => this * 180 / Math.PI; }, configurable: true },
  // (5).sign()
  sign:   { get() { return () => Math.sign(this); }, configurable: true },
  // (5).between(1, 10) → true
  between:{ get() { return (min, max) => this >= min && this <= max; }, configurable: true },
  // (255).hex() → "ff"
  hex:    { get() { return () => Math.round(this).toString(16); }, configurable: true },
  // (255).bin()
  bin:    { get() { return () => Math.round(this).toString(2); }, configurable: true },
  // (5).isInt()
  isInt:  { get() { return () => Number.isInteger(this.valueOf()); }, configurable: true },
  // (NaN).isNaN()
  isNaN:  { get() { return () => isNaN(this.valueOf()); }, configurable: true },
  // (1000).format() → "1,000"
  format: { get() { return (locale='en-US', opts={}) => this.valueOf().toLocaleString(locale, opts); }, configurable: true },
  // trig
  sin:    { get() { return () => Math.sin(this); }, configurable: true },
  cos:    { get() { return () => Math.cos(this); }, configurable: true },
  tan:    { get() { return () => Math.tan(this); }, configurable: true },
  asin:   { get() { return () => Math.asin(this); }, configurable: true },
  acos:   { get() { return () => Math.acos(this); }, configurable: true },
  atan:   { get() { return () => Math.atan(this); }, configurable: true },
  // misc
  exp:    { get() { return () => Math.exp(this); }, configurable: true },
  log:    { get() { return () => Math.log(this); }, configurable: true },
  log2:   { get() { return () => Math.log2(this); }, configurable: true },
  log10:  { get() { return () => Math.log10(this); }, configurable: true },
  abs:    { get() { return () => Math.abs(this); }, configurable: true },
});

// ── array prototype extensions ────────────────────────────────
Object.defineProperties(Array.prototype, {
  // [1,2,3].clone() — shallow copy
  clone: { get() { return () => [...this]; }, configurable: true },
  // [1,2,3].sum()
  sum: { get() { return () => this.reduce((a,b) => a+b, 0); }, configurable: true },
  // [1,2,3].avg()
  avg: { get() { return () => this.reduce((a,b) => a+b, 0) / this.length; }, configurable: true },
  // [3,1,2].min()
  min: { get() { return () => Math.min(...this); }, configurable: true },
  // [3,1,2].max()
  max: { get() { return () => Math.max(...this); }, configurable: true },
  // [1,2,3].last()
  last: { get() { return () => this[this.length - 1]; }, configurable: true },
  // [1,2,3].first()
  first: { get() { return () => this[0]; }, configurable: true },
  // [[1],[2]].flat already exists — alias flatten
  flatten: { get() { return (depth=Infinity) => this.flat(depth); }, configurable: true },
  // [1,2,2,3].unique()
  unique: { get() { return () => [...new Set(this)]; }, configurable: true },
  // [1,2,3].shuffle() — Fisher-Yates, returns NEW array
  shuffle: { get() { return () => {
    const a = [...this];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }}, configurable: true },
  // [1,2,3].sample() — random element
  sample: { get() { return () => this[Math.floor(Math.random() * this.length)]; }, configurable: true },
  // [1,2,3].chunk(2) → [[1,2],[3]]
  chunk: { get() { return (size) => {
    const out = [];
    for (let i = 0; i < this.length; i += size) out.push(this.slice(i, i+size));
    return out;
  }}, configurable: true },
  // [{a:1},{a:2}].pluck("a") → [1,2]
  pluck: { get() { return (key) => this.map(x => x[key]); }, configurable: true },
  // [1,2,3].compact() — removes falsy
  compact: { get() { return () => this.filter(Boolean); }, configurable: true },
  // [1,2,3].count(x => x > 1) or .count(2)
  count: { get() { return (fn) => typeof fn === 'function' ? this.filter(fn).length : this.filter(x => x === fn).length; }, configurable: true },
  // [1,2,3].zip([4,5,6]) → [[1,4],[2,5],[3,6]]
  zip: { get() { return (other) => this.map((v,i) => [v, other[i]]); }, configurable: true },
  // [1,2,3].rotate(1) → [2,3,1]
  rotate: { get() { return (n=1) => { const a=[...this]; const r=((n%a.length)+a.length)%a.length; return [...a.slice(r),...a.slice(0,r)]; }; }, configurable: true },
  // array.object() — array of [key,val] pairs to object, or array of {key,val}
  object: { get() { return () => {
    if (this.length === 0) return {};
    if (Array.isArray(this[0])) return Object.fromEntries(this);
    if (typeof this[0] === 'object') {
      const o = {};
      this.forEach(item => { if(item.key !== undefined) o[item.key] = item.value; else Object.assign(o, item); });
      return o;
    }
    return Object.fromEntries(this.map((v,i) => [i,v]));
  }}, configurable: true },
  // [1,2,3].string() → "1,2,3"
  string: { get() { return (sep=',') => this.join(sep); }, configurable: true },
  // [1,2,3].has(2) → true
  has: { get() { return (v) => this.includes(v); }, configurable: true },
  // [1,2,3].random()
  random: { get() { return () => this[Math.floor(Math.random() * this.length)]; }, configurable: true },
  // [{name:'a'},{name:'b'}].sortBy('name')
  sortBy: { get() { return (key, dir=1) => [...this].sort((a,b) => a[key]>b[key]?dir:a[key]<b[key]?-dir:0); }, configurable: true },
  // [1,[2,[3]]].flat already exists
  // [1,2,3].toSet()
  toSet: { get() { return () => new Set(this); }, configurable: true },
});

// ── object extensions (standalone functions) ──────────────────
// object.array() — attached as method via wrapper
// Use a proxy wrapper — but simpler: provide standalone functions
const obj = {
  // obj.array({a:1,b:2}) → [["a",1],["b",2]]
  array:   (o) => Object.entries(o),
  // obj.keys({a:1}) → ["a"]
  keys:    (o) => Object.keys(o),
  // obj.values({a:1}) → [1]
  values:  (o) => Object.values(o),
  // obj.entries
  entries: (o) => Object.entries(o),
  // obj.merge(a,b)
  merge:   (...objs) => Object.assign({}, ...objs),
  // obj.clone(o)
  clone:   (o) => JSON.parse(JSON.stringify(o)),
  // obj.has(o, key)
  has:     (o, key) => Object.prototype.hasOwnProperty.call(o, key),
  // obj.pick(o, keys)
  pick:    (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]])),
  // obj.omit(o, keys)
  omit:    (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))),
  // obj.map(o, fn)
  map:     (o, fn) => Object.fromEntries(Object.entries(o).map(([k,v],i) => fn([k,v],i))),
  // obj.filter(o, fn)
  filter:  (o, fn) => Object.fromEntries(Object.entries(o).filter(([k,v],i) => fn([k,v],i))),
  // obj.size(o)
  size:    (o) => Object.keys(o).length,
  // obj.freeze(o)
  freeze:  (o) => Object.freeze(o),
};

// Also attach .array() and .clone() directly on Object.prototype (non-enumerable)
Object.defineProperty(Object.prototype, 'array', {
  get() {
    const self = this;
    return function() { return Object.entries(self); };
  },
  configurable: true,
  enumerable: false,
});
Object.defineProperty(Object.prototype, 'clone', {
  get() {
    const self = this;
    return function() {
      if (Array.isArray(self)) return [...self];
      try { return JSON.parse(JSON.stringify(self)); } catch(_) { return Object.assign({}, self); }
    };
  },
  configurable: true,
  enumerable: false,
});

// ── Object.prototype method extensions ───────────────────────
// Direct value methods (not getters) so they are reliably callable as obj.method()
// in all browsers and environments. All non-enumerable.
// filter/map/find/some/every/reduce check Array.isArray(this) first so they
// never shadow or break the native array built-ins.
(function() {
  const __safeMethod = (proto, name, fn) => {
    try {
      const existing = Object.getOwnPropertyDescriptor(proto, name);
      if (existing && !existing.configurable) return;
      Object.defineProperty(proto, name, {
        value: fn,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    } catch(_) {}
  };
  const P = Object.prototype;
  __safeMethod(P, 'keys',    function() { return Object.keys(this); });
  __safeMethod(P, 'values',  function() { return Object.values(this); });
  __safeMethod(P, 'entries', function() { return Object.entries(this); });
  __safeMethod(P, 'has',     function(key) {
    if (Array.isArray(this)) return Array.prototype.includes.call(this, key);
    return Object.prototype.hasOwnProperty.call(this, key);
  });
  __safeMethod(P, 'size',    function() {
    if (Array.isArray(this)) return this.length;
    return Object.keys(this).length;
  });
  __safeMethod(P, 'merge',   function(...others) { return Object.assign({}, this, ...others); });
  __safeMethod(P, 'pick',    function(keys) { return Object.fromEntries(keys.map(k => [k, this[k]])); });
  __safeMethod(P, 'omit',    function(keys) { return Object.fromEntries(Object.entries(this).filter(([k]) => !keys.includes(k))); });
  __safeMethod(P, 'freeze',  function() { return Object.freeze(this); });
  __safeMethod(P, 'toJson',  function(indent) { return JSON.stringify(this, null, indent); });
  __safeMethod(P, 'assign',  function(...others) { return Object.assign(this, ...others); });
  __safeMethod(P, 'each',    function(fn) {
    if (Array.isArray(this)) { Array.prototype.forEach.call(this, (v,i) => fn(v,i)); }
    else { Object.entries(this).forEach(([k,v],i) => fn([k,v],i)); }
    return this;
  });
  __safeMethod(P, 'isEmpty', function() {
    if (Array.isArray(this)) return this.length === 0;
    return Object.keys(this).length === 0;
  });
  __safeMethod(P, 'invert',  function() { return Object.fromEntries(Object.entries(this).map(([k,v]) => [v,k])); });
  __safeMethod(P, 'filter',  function(fn) {
    if (Array.isArray(this)) return Array.prototype.filter.call(this, fn);
    return Object.fromEntries(Object.entries(this).filter(([k,v],i) => fn([k,v],i)));
  });
  __safeMethod(P, 'map',     function(fn) {
    if (Array.isArray(this)) return Array.prototype.map.call(this, fn);
    return Object.fromEntries(Object.entries(this).map(([k,v],i) => fn([k,v],i)));
  });
  __safeMethod(P, 'find',    function(fn) {
    if (Array.isArray(this)) return Array.prototype.find.call(this, fn);
    const e = Object.entries(this).find(([k,v],i) => fn([k,v],i));
    return e ? e[1] : undefined;
  });
  __safeMethod(P, 'some',    function(fn) {
    if (Array.isArray(this)) return Array.prototype.some.call(this, fn);
    return Object.entries(this).some(([k,v],i) => fn([k,v],i));
  });
  __safeMethod(P, 'every',   function(fn) {
    if (Array.isArray(this)) return Array.prototype.every.call(this, fn);
    return Object.entries(this).every(([k,v],i) => fn([k,v],i));
  });
  __safeMethod(P, 'reduce',  function(fn, init) {
    if (Array.isArray(this)) return Array.prototype.reduce.call(this, fn, init);
    return Object.entries(this).reduce((acc,[k,v],i) => fn(acc,[k,v],i), init);
  });
})();

// ── file() — synchronous-style file loader ───────────────────
// Browser: uses XMLHttpRequest synchronous mode (same-origin or file://)
// Node.js: uses fs.readFileSync
// file("a.json") → parsed JSON object
// file("a.txt")  → raw string
// file("a.json", "text") → raw string even for .json
const file = (url, forceType) => {
  const __parseFileContent = (text, url, forceType) => {
    const ext = url.split('.').pop().toLowerCase();
    if (forceType === 'text' || forceType === 'txt') return text;
    if (ext === 'json' || forceType === 'json') {
      try { return JSON.parse(text); } catch(e) { throw new Error(\`[NOVA] file(): invalid JSON in "\${url}": \${e.message}\`); }
    }
    if (ext === 'csv' || forceType === 'csv') {
      const lines = text.trim().split('\\n');
      const headers = lines[0].split(',').map(h => h.trim());
      return lines.slice(1).map(row => {
        const vals = row.split(',');
        const obj  = {};
        headers.forEach((h,i) => { obj[h] = vals[i] !== undefined ? vals[i].trim() : ''; });
        return obj;
      });
    }
    return text;
  };
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const fs = require('fs');
    const text = fs.readFileSync(url, 'utf8');
    return __parseFileContent(text, url, forceType);
  }
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, false);
  xhr.send(null);
  if (xhr.status !== 200 && xhr.status !== 0) {
    throw new Error(\`[NOVA] file(): failed to load "\${url}" (HTTP \${xhr.status})\`);
  }
  return __parseFileContent(xhr.responseText, url, forceType);
};

// Async variant (non-blocking)
const fileAsync = async (url, forceType) => {
  const __parseFileContent = (text, url, forceType) => {
    const ext = url.split('.').pop().toLowerCase();
    if (forceType === 'text' || forceType === 'txt') return text;
    if (ext === 'json' || forceType === 'json') return JSON.parse(text);
    if (ext === 'csv'  || forceType === 'csv') {
      const lines = text.trim().split('\\n');
      const headers = lines[0].split(',').map(h => h.trim());
      return lines.slice(1).map(row => {
        const vals = row.split(',');
        const o = {};
        headers.forEach((h,i) => { o[h] = vals[i] !== undefined ? vals[i].trim() : ''; });
        return o;
      });
    }
    return text;
  };
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const fs = require('fs').promises;
    const text = await fs.readFile(url, 'utf8');
    return __parseFileContent(text, url, forceType);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(\`[NOVA] fileAsync(): failed to load "\${url}" (HTTP \${res.status})\`);
  const text = await res.text();
  return __parseFileContent(text, url, forceType);
};
`;

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Transpile NOVA source code to JavaScript source code.
 * @param {string} src - NOVA source
 * @returns {string} - JavaScript source
 */
function transpile(src, includeRuntime = true) {
  const lexer      = new Lexer(src);
  const tokens     = lexer.tokenize();
  const transpiler = new Transpiler(tokens);
  return transpiler.transpile(includeRuntime);
}

/**
 * Execute NOVA source code in the browser (appends a <script> tag).
 * @param {string} src - NOVA source
 * @returns {string} - generated JS (for inspection)
 */
function execute(src) {
  // Inject the runtime only once across all NOVA script blocks.
  if (!window.__novaRuntimeLoaded) {
    window.__novaRuntimeLoaded = true;
    const runtimeScript = document.createElement('script');
    runtimeScript.type = 'text/javascript';
    runtimeScript.textContent = NOVA_RUNTIME;
    document.head.appendChild(runtimeScript);
  }
  // Wrap user code in an async IIFE so that:
  //  1. let/const/var declarations don't leak into the global scope,
  //     preventing "already been declared" errors on re-runs.
  //  2. top-level await works inside the block.
  const userJs = transpile(src, false);
  const wrapped = `(async () => {\n${userJs}\n})().catch(e => console.error('[NOVA]', e));`;
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.textContent = wrapped;
  document.head.appendChild(script);
  return wrapped;
}

/**
 * Execute NOVA source code in Node.js using the vm module.
 * @param {string} src - NOVA source
 * @returns {Promise<void>}
 */
async function executeNode(src) {
  const vm = require('vm');
  const userJs = transpile(src, false);
  const wrapped = `(async () => {\n${userJs}\n})().catch(e => { throw e; });`;
  const fullJs = NOVA_RUNTIME + '\n' + wrapped;
  const script = new vm.Script(fullJs, { filename: '<nova>' });
  // Do NOT pass Object/Array/String/etc. from the outer context.
  // The vm sandbox has its own Object.prototype for object literals created inside it.
  // The NOVA_RUNTIME installs methods on Object.prototype inside the vm, so they must
  // share the same prototype chain as the objects created by user code inside the vm.
  const ctx = vm.createContext({
    require,
    process,
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    setImmediate,
    clearImmediate,
    Buffer,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    queueMicrotask,
  });
  await script.runInContext(ctx);
}

/**
 * Load and execute a NOVA file by URL.
 * @param {string} url
 */
async function load(url) {
  const res = await fetch(url);
  const src = await res.text();
  return execute(src);
}

/**
 * Auto-execute all <script type="text/nova"> blocks in the page.
 */
function autoRun() {
  execute(
    Array.from(document.querySelectorAll('script[type="text/nova"], script[type="text/novajs"]'))
      .map(el => el.textContent)
      .join('\n')
  );
}

// ── exports ──────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { transpile, execute, executeNode, load, autoRun, Lexer, Transpiler, NOVA_RUNTIME };
} else if (typeof window !== 'undefined') {
  window.Nova = { transpile, execute, executeNode, load, autoRun, Lexer, Transpiler };
  // auto-run on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoRun);
  } else {
    autoRun();
  }
}
/**
 * Lists every player-facing English sentence in the game logic (src/game) and the server, as message
 * templates: `${expr}` parts become {name} placeholders. Used by scripts/i18n-test.ts to check that the
 * message catalogue (src/i18n/messages.ts) covers them, and by hand to find new strings.
 *   npx tsx scripts/i18n/extract.ts [--json]
 */
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface Found { text: string; file: string; line: number }

function walk(dir: string, out: string[]): void {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
}

/** Placeholder name for an interpolated expression: its last identifier, lower-cased. */
export function placeholderName(expr: string): string {
  const ids = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? ['x'];
  let n = ids[ids.length - 1];
  if (/^(toLowerCase|toUpperCase|toFixed|join|name|length|trim|toLocaleString|round|floor|ceil|max|min|String)$/.test(n) && ids.length > 1) {
    // `${tree.name}` → tree, `${x.toLowerCase()}` → x
    const keep = ids.filter((i) => !/^(toLowerCase|toUpperCase|toFixed|join|length|trim|toLocaleString|Math|round|floor|ceil|max|min|String|en|GB|US)$/.test(i));
    n = keep.length ? keep[keep.length - 1] : n;
  }
  return n.replace(/^_+/, '') || 'x';
}

const SKIP_CALLS = /^(console\.|log\(|import|require|new Error|addEventListener|querySelector|startsWith|endsWith|includes|split|replace|match|test|localStorage|setItem|getItem)/;

export function extract(files: string[]): Found[] {
  const found: Found[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);
    const visit = (n: ts.Node): void => {
      let text: string | null = null;
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text;
      else if (ts.isTemplateExpression(n)) {
        const used = new Map<string, number>();
        text = n.head.text;
        for (const span of n.templateSpans) {
          let name = placeholderName(span.expression.getText(sf));
          const c = used.get(name) ?? 0;
          used.set(name, c + 1);
          if (c) name = `${name}${c + 1}`;
          text += `{${name}}` + span.literal.text;
        }
      }
      if (text !== null) {
        // skip property names, import paths, types, comparisons and console calls
        const p = n.parent;
        const skip = ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || (ts.isPropertyAssignment(p) && p.name === n)
          || ts.isElementAccessExpression(p) || ts.isCaseClause(p)
          || (ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText(sf)))
          || (ts.isCallExpression(p) && SKIP_CALLS.test(p.expression.getText(sf)));
        if (!skip && /[A-Za-z]{2,}/.test(text) && / /.test(text.replace(/\{[^}]*\}/g, 'X')) && !/^[a-z_]+:/.test(text) && !/^\s*$/.test(text)) {
          found.push({ text, file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
        }
        if (ts.isTemplateExpression(n)) { n.templateSpans.forEach((s) => visit(s.expression)); return; }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return found;
}

export function sourceFiles(root: string, dirs: string[]): string[] {
  const out: string[] = [];
  for (const d of dirs) {
    const p = join(root, d);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

if (process.argv[1]?.endsWith('extract.ts')) {
  const root = process.cwd();
  const files = sourceFiles(root, process.argv.slice(2).filter((a: string) => !a.startsWith('--')).length ? process.argv.slice(2).filter((a: string) => !a.startsWith('--')) : ['src/game']);
  const f = extract(files);
  if (process.argv.includes('--json')) console.log(JSON.stringify(f, null, 1));
  else for (const x of f) console.log(`${x.file.replace(root + '/', '')}:${x.line}\t${x.text}`);
}

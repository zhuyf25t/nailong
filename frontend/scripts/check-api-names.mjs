/** Execute API implementations from reachable production chunks. Source filenames
 * enumerate required APIs only: no source code is transpiled or imported instead.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { executeEmittedAPIs, selfTestHarness } from './production-module-harness.mjs';
import { productionCases } from '../tests/fixtures/expansion-production.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (typeof vm.SourceTextModule !== 'function') {
  const child = spawnSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', cwd: root, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}
if (process.argv.includes('--self-test')) { await selfTestHarness(path.join(root, 'tests', 'fixtures', 'virtual-emitted-modules')); process.exit(0); }
assert.equal(process.argv.length, 2, 'Supported option: --self-test');
async function filesIn(directory, extension) {
  const nested = await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? filesIn(path.join(directory, entry.name), extension) : Promise.resolve(entry.name.endsWith(extension) ? [path.join(directory, entry.name)] : [])));
  return nested.flat();
}
async function shippedModules() {
  const dist = path.join(root, 'dist'), html = await readFile(path.join(dist, 'index.html'), 'utf8');
  const entries = [...html.matchAll(/<script\b[^>]*>/gi)].flatMap(([tag]) => /\btype\s*=\s*["']module["']/i.test(tag) ? [/\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]].filter(Boolean) : []);
  assert(entries.length, 'No production module entry in dist/index.html');
  const seen = new Set(), modules = [];
  function resolve(specifier, importer) {
    assert(!/^[a-z]+:/i.test(specifier), `Unsupported external module ${specifier}`);
    const clean = decodeURIComponent(specifier.split(/[?#]/, 1)[0]);
    const filename = clean.startsWith('/') ? path.resolve(dist, '.' + clean) : path.resolve(path.dirname(importer), clean);
    const relative = path.relative(dist, filename);
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `Module escapes dist: ${specifier}`);
    return filename;
  }
  async function visit(filename) {
    if (seen.has(filename)) return;
    seen.add(filename);
    const source = await readFile(filename, 'utf8'), ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), dependencies = new Set();
    function walk(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) dependencies.add(node.moduleSpecifier.text);
      else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) dependencies.add(node.arguments[0].text);
      ts.forEachChild(node, walk);
    }
    walk(ast);
    for (const dependency of dependencies) await visit(resolve(dependency, filename));
    modules.push({ filename, source });
  }
  for (const entry of entries) await visit(resolve(entry, path.join(dist, 'index.html')));
  return modules;
}
const apiNames = (await filesIn(path.join(root, 'src/apis'), '.ts')).map(filename => path.basename(filename, '.ts')).sort();
const cases = await productionCases(root), covered = [...new Set(cases.map(test => test.name))].sort();
assert.deepEqual(covered, apiNames, 'Every API needs an emitted-code protocol case; old cases cannot be dropped');
const originalTwelve = ['RegisterPlayerAPI','LoginPlayerAPI','GetCurrentPlayerAPI','LogoutPlayerAPI','GetTrainingConfigAPI','StartTrainingRunAPI','GetTrainingRunAPI','AbandonTrainingRunAPI','SaveTrainingResultAPI','GetTrainingResultAPI','ListMyResultsAPI','GetMyBestAPI'];
for (const name of originalTwelve) assert(covered.includes(name), `Missing original API ${name}`);
const token = 'A'.repeat(43), calls = [];
let active, rejectResponse = false;
const shipped = await shippedModules();
const linked = await executeEmittedAPIs(shipped, apiNames, {
  Response, console, AbortController, TextEncoder, TextDecoder, crypto: webcrypto,
  fetch: async (url, options) => {
    assert(active, 'Unexpected production request outside test');
    assert.equal(url, '/api/' + active.name.toLowerCase()); assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { ...active.request, ...(active.needsToken ? { userToken: token } : {}) });
    calls.push({ name: active.name, invalidResponse: rejectResponse });
    return Response.json(rejectResponse ? null : active.response);
  },
});
for (const test of cases) {
  active = test;
  const API = linked.apis.get(test.name);
  assert.equal(API.name, test.name, 'Emitted constructor name must drive shipped route');
  const result = await new API(...test.args).send({ token });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), test.response, `${test.label ?? test.name}: emitted response decoding changed data`);
  rejectResponse = true;
  await assert.rejects(() => new API(...test.args).send({ token }), error => error?.kind === 'decode', `${test.name} must reject malformed response JSON`);
  rejectResponse = false;
}
assert.equal(calls.length, cases.length * 2);
console.log(`Production verification passed: ${apiNames.length} emitted API classes including original 12; ${cases.length} protocol cases and ${cases.length} malformed-response rejections across ${linked.moduleCount}/${shipped.length} shipped chunks. Production send, route, payload and decoder executed; no source fallback.`);

/**
 * Execute the actual emitted production API implementation, with only fetch replaced.
 * The TypeScript AST selects API/DTO declarations out of Vite's browser bundle so
 * React/Three.js do not require a DOM here. Nothing is recompiled from source.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
async function filesIn(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? filesIn(path.join(directory, entry.name), extension)
    : Promise.resolve(entry.name.endsWith(extension) ? [path.join(directory, entry.name)] : [])));
  return nested.flat();
}
function declarations(source, filename) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const results = [];
  for (const node of ast.statements) {
    if ((ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name) {
      results.push({ name: node.name.text, text: node.getText(ast) });
    } else if (ts.isVariableStatement(node)) {
      const kind = node.declarationList.flags & ts.NodeFlags.Const ? 'const' : node.declarationList.flags & ts.NodeFlags.Let ? 'let' : 'var';
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) results.push({ name: declaration.name.text, text: `${kind} ${declaration.getText(ast)};` });
      }
    }
  }
  return results;
}

/** Follow the shipped HTML entry, never stale hash files retained by incremental builds. */
async function shippedModules() {
  const dist = path.join(root, 'dist');
  const html = await readFile(path.join(dist, 'index.html'), 'utf8');
  const entries = [...html.matchAll(/<script\b[^>]*>/gi)].flatMap(([tag]) => {
    if (!/\btype\s*=\s*["']module["']/i.test(tag)) return [];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    return src ? [src] : [];
  });
  assert(entries.length > 0, 'No production module entry in dist/index.html.');
  const seen = new Set();
  const modules = [];
  function resolveModule(specifier, importer) {
    assert(!/^[a-z]+:/i.test(specifier), `External production module is unsupported: ${specifier}`);
    const clean = decodeURIComponent(specifier.split(/[?#]/, 1)[0]);
    const filename = clean.startsWith('/') ? path.resolve(dist, '.' + clean) : path.resolve(path.dirname(importer), clean);
    const relative = path.relative(dist, filename);
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `Module escapes dist: ${specifier}`);
    return filename;
  }
  async function visit(filename) {
    if (seen.has(filename)) return;
    seen.add(filename);
    const source = await readFile(filename, 'utf8');
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    const dependencies = new Set();
    function walk(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        dependencies.add(node.moduleSpecifier.text);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
        dependencies.add(node.arguments[0].text);
      }
      ts.forEachChild(node, walk);
    }
    walk(ast);
    for (const specifier of dependencies) await visit(resolveModule(specifier, filename));
    modules.push({ filename, source });
  }
  for (const entry of entries) await visit(resolveModule(entry, path.join(dist, 'index.html')));
  return modules;
}
const names = new Set();
for (const directory of ['src/apis', 'src/objects', 'src/system/api']) {
  for (const filename of await filesIn(path.join(root, directory), '.ts')) {
    for (const declaration of declarations(await readFile(filename,'utf8'), filename)) names.add(declaration.name);
  }
}
const bundle = [];
const emitted = new Set();
for (const { filename, source } of await shippedModules()) {
  for (const declaration of declarations(source, filename)) {
    if (!names.has(declaration.name)) continue;
    assert(!emitted.has(declaration.name), `Duplicate production binding: ${declaration.name}`);
    emitted.add(declaration.name);
    bundle.push(declaration.text);
  }
}
const fixture = JSON.parse(await readFile(path.join(root,'tests/fixtures/contract.json'),'utf8'));
const { run, config, submission } = fixture;
const specs = [
  ['RegisterPlayerAPI',['demo_player','password123','奶糖'],fixture.auth,false],
  ['LoginPlayerAPI',['demo_player','password123'],fixture.auth,false],
  ['GetCurrentPlayerAPI',[],fixture.player,true], ['LogoutPlayerAPI',[],{loggedOut:true},true],
  ['GetTrainingConfigAPI',[],fixture.config,false],
  ['StartTrainingRunAPI',[run.requestId,config.id,config.version,config.terrain],fixture.run,true],
  ['GetTrainingRunAPI',[run.id],fixture.run,true],
  ['AbandonTrainingRunAPI',[run.id],fixture.abandoned,true],
  ['SaveTrainingResultAPI',[run.id,submission],fixture.result,true],
  ['GetTrainingResultAPI',[run.id],fixture.lookup,true],
  ['ListMyResultsAPI',[0,10],fixture.list,true],
  ['GetMyBestAPI',[config.id,config.version,config.terrain],fixture.best,true],
];
for (const name of ['APIMessage','APIWithTokenMessage','NoRequestMessage','apiNameOf','sendAPI','apiRequest',...specs.map(item=>item[0])]) {
  assert(emitted.has(name), `Missing production declaration ${name}; class may have been renamed or tree-shaken.`);
}
const expected = new Map(specs.map(([name,,response,needsToken]) => ['/api/'+name.toLowerCase(), {response,needsToken}]));
const calls = [];
const token = 'A'.repeat(43);
const sandbox = vm.createContext({
  Response, console, AbortController,
  fetch: async (url, options) => {
    const endpoint = expected.get(url);
    assert(endpoint, `Unexpected production URL: ${url}`);
    assert.equal(options.method,'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.userToken, endpoint.needsToken ? token : undefined);
    assert.equal(Object.hasOwn(body,'decodeResponse'),false);
    assert.equal(Object.hasOwn(body,'responseType'),false);
    calls.push(url);
    return Response.json(endpoint.response);
  },
});
vm.runInContext(bundle.join('\n'),sandbox,{timeout:10000});
for (const [name,args] of specs) {
  sandbox.argumentsForAPI = args;
  sandbox.frozenToken = token;
  const result = await vm.runInContext(`new ${name}(...argumentsForAPI).send({token:frozenToken})`,sandbox,{timeout:10000});
  assert(result && typeof result === 'object', `${name} did not decode its production response`);
}
assert.deepEqual(calls,[...expected.keys()]);
console.log('Production verification passed: all 12 emitted API classes sent the derived route with validated responses.');

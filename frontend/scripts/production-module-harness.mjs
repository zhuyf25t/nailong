/** Select and execute emitted JavaScript declarations, never TypeScript source.
 * The TS binder selects dependencies; native VM ESM preserves chunk scopes and aliases.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const canonical = filename => { const absolute = path.resolve(filename).replaceAll('\\', '/'); return process.platform === 'win32' ? absolute.toLowerCase() : absolute; };
const exportName = name => /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);

export async function executeEmittedAPIs(inputs, apiNames, globals) {
  assert.equal(typeof vm.SourceTextModule, 'function', 'Run Node with --experimental-vm-modules');
  const modules = new Map(inputs.map(input => [canonical(input.filename), { ...input, filename: path.resolve(input.filename), declarations: [], imports: new Map(), selected: new Set(), usedImports: new Map(), requestedExports: new Map() }]));
  function resolve(specifier, importer) {
    const filename = path.isAbsolute(specifier) ? specifier : path.resolve(path.dirname(importer), specifier);
    const found = modules.get(canonical(filename));
    assert(found, `Emitted dependency outside shipped graph: ${specifier} from ${importer}`);
    return found;
  }
  const options = { allowJs: true, checkJs: false, noLib: true, types: [], target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
  const host = ts.createCompilerHost(options);
  host.fileExists = filename => modules.has(canonical(filename));
  host.readFile = filename => modules.get(canonical(filename))?.source;
  host.getSourceFile = (filename, languageVersion) => { const found = modules.get(canonical(filename)); return found ? ts.createSourceFile(found.filename, found.source, languageVersion, true, ts.ScriptKind.JS) : undefined; };
  host.resolveModuleNames = (names, importer) => names.map(name => ({ resolvedFileName: resolve(name, importer).filename, extension: ts.Extension.Js }));
  const program = ts.createProgram({ rootNames: [...modules.values()].map(module => module.filename), options, host });
  const checker = program.getTypeChecker();
  const bindings = new Map(), bindingsByName = new Map();
  let nextBinding = 0;
  function identifiers(name) { return ts.isIdentifier(name) ? [name] : name.elements.flatMap(element => ts.isOmittedExpression(element) ? [] : identifiers(element.name)); }
  function addDeclaration(module, node, names, code) {
    const declaration = { module, node, code, position: node.pos, bindings: [] };
    module.declarations.push(declaration);
    for (const name of names) {
      const symbol = checker.getSymbolAtLocation(name);
      assert(symbol, `Cannot bind emitted declaration ${name.text}`);
      const binding = { name: name.text, symbol, declaration, exportId: `__qa_emitted_binding_${nextBinding++}` };
      assert(!bindings.has(symbol), `Unsupported repeated emitted binding ${name.text}`);
      bindings.set(symbol, binding); declaration.bindings.push(binding);
      bindingsByName.set(name.text, [...(bindingsByName.get(name.text) ?? []), binding]);
    }
  }
  for (const file of program.getSourceFiles()) {
    const module = modules.get(canonical(file.fileName));
    if (!module) continue;
    module.file = file;
    for (const node of file.statements) {
      if ((ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name) addDeclaration(module, node, [node.name], node.getText(file).replace(/^export\s+(?:default\s+)?/, ''));
      else if (ts.isVariableStatement(node)) {
        const kind = node.declarationList.flags & ts.NodeFlags.Const ? 'const' : node.declarationList.flags & ts.NodeFlags.Let ? 'let' : 'var';
        for (const declaration of node.declarationList.declarations) addDeclaration(module, declaration, identifiers(declaration.name), `${kind} ${declaration.getText(file)};`);
      } else if (ts.isImportDeclaration(node) && node.importClause && ts.isStringLiteral(node.moduleSpecifier)) {
        const target = resolve(node.moduleSpecifier.text, module.filename);
        function addImport(local, imported) { const symbol = checker.getSymbolAtLocation(local); assert(symbol, `Cannot bind import ${local.text}`); module.imports.set(symbol, { local: local.text, imported, target }); }
        if (node.importClause.name) addImport(node.importClause.name, 'default');
        const named = node.importClause.namedBindings;
        if (named && ts.isNamespaceImport(named)) addImport(named.name, '*');
        else if (named) for (const element of named.elements) addImport(element.name, element.propertyName?.text ?? element.name.text);
      }
    }
  }
  const actualSymbol = symbol => symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  function exportsOf(module) { const symbol = checker.getSymbolAtLocation(module.file); assert(symbol, `Emitted file is not a module: ${module.filename}`); return checker.getExportsOfModule(symbol); }
  function requestExport(module, name) {
    if (module.requestedExports.has(name)) return;
    const exported = exportsOf(module).find(symbol => symbol.name === name);
    assert(exported, `Missing emitted export ${name} in ${module.filename}`);
    const binding = bindings.get(actualSymbol(exported));
    assert(binding, `Unsupported emitted export ${name} in ${module.filename}; refusing source fallback`);
    module.requestedExports.set(name, binding); select(binding.declaration);
  }
  function select(declaration) {
    const module = declaration.module;
    if (module.selected.has(declaration)) return;
    module.selected.add(declaration);
    function walk(node) {
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol) {
          const imported = module.imports.get(symbol);
          if (imported) {
            module.usedImports.set(imported.local, imported);
            if (imported.imported === '*') for (const item of exportsOf(imported.target)) requestExport(imported.target, item.name);
            else requestExport(imported.target, imported.imported);
          } else { const dependency = bindings.get(actualSymbol(symbol)); if (dependency) select(dependency.declaration); }
        }
      }
      ts.forEachChild(node, walk);
    }
    walk(declaration.node);
  }
  const apiBindings = new Map();
  for (const name of apiNames) {
    const candidates = bindingsByName.get(name) ?? [];
    assert.equal(candidates.length, 1, `Expected one reachable emitted ${name}, found ${candidates.length}; missing/tree-shaken/renamed APIs cannot pass`);
    apiBindings.set(name, candidates[0]); select(candidates[0].declaration);
  }
  const context = vm.createContext(globals), executable = new Map();
  for (const module of modules.values()) {
    if (!module.selected.size && !module.requestedExports.size) continue;
    const code = [];
    for (const imported of module.usedImports.values()) code.push(imported.imported === '*' ? `import * as ${imported.local} from ${JSON.stringify(imported.target.filename)};` : `import { ${exportName(imported.imported)} as ${imported.local} } from ${JSON.stringify(imported.target.filename)};`);
    for (const declaration of [...module.selected].sort((a, b) => a.position - b.position)) {
      code.push(declaration.code);
      for (const binding of declaration.bindings) code.push(`export { ${binding.name} as ${binding.exportId} };`);
    }
    for (const [name, binding] of module.requestedExports) code.push(binding.declaration.module === module ? `export { ${binding.name} as ${exportName(name)} };` : `export { ${binding.exportId} as ${exportName(name)} } from ${JSON.stringify(binding.declaration.module.filename)};`);
    executable.set(canonical(module.filename), new vm.SourceTextModule(code.join('\n'), { context, identifier: module.filename }));
  }
  const linker = (specifier, importer) => { const target = executable.get(canonical(resolve(specifier, importer.identifier).filename)); assert(target, `Missing selected production dependency ${specifier}`); return target; };
  for (const module of executable.values()) if (module.status === 'unlinked') await module.link(linker);
  for (const module of executable.values()) if (module.status === 'linked') await module.evaluate({ timeout: 10_000 });
  const apis = new Map([...apiBindings].map(([name, binding]) => [name, executable.get(canonical(binding.declaration.module.filename)).namespace[binding.exportId]]));
  return { apis, moduleCount: executable.size, declarationCount: [...modules.values()].reduce((sum, module) => sum + module.selected.size, 0) };
}

export async function selfTestHarness(directory) {
  const filename = name => path.join(directory, name);
  const inputs = [
    { filename: filename('base.js'), source: `class Base { send(){ return fetch('/api/'+this.constructor.name.toLowerCase(),{method:'POST',body:JSON.stringify(this.toRequest())}).then(r=>r.json()).then(x=>this.decodeResponse(x)); } } export { Base as b };` },
    { filename: filename('codec.js'), source: `const transform = value => ({right:value.number+7}); export {transform as d};` },
    { filename: filename('facade.js'), source: `export {b as renamedBase} from './base.js'; export {d as renamedDecoder} from './codec.js';` },
    { filename: filename('entry.js'), source: `import {b as Alias} from './base.js'; const transform = value => ({left:value.number*2}); var FirstAPI=class extends Alias {toRequest(){return {first:true};}decodeResponse(x){return transform(x);}}; export {};` },
    { filename: filename('lazy.js'), source: `import {renamedBase as OtherBase,renamedDecoder as otherDecode} from './facade.js'; var SecondAPI=class extends OtherBase {toRequest(){return {second:true};}decodeResponse(x){return otherDecode(x);}}; export {};` },
  ];
  const calls = [];
  const linked = await executeEmittedAPIs(inputs, ['FirstAPI', 'SecondAPI'], { fetch: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return { json: async () => ({ number: 3 }) }; } });
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(await new (linked.apis.get('FirstAPI'))().send()), { left: 6 });
  assert.deepEqual(plain(await new (linked.apis.get('SecondAPI'))().send()), { right: 10 });
  assert.deepEqual(calls, [{ url: '/api/firstapi', body: { first: true } }, { url: '/api/secondapi', body: { second: true } }]);
  console.log('Harness self-test passed: cross-chunk aliases, re-exports, local-name isolation and emitted class calls. No application build was tested.');
}

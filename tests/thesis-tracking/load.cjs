const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const modules = new Map();
module.exports = function load(name) {
  const file = path.resolve(__dirname, '../../server/thesis-tracking', name.endsWith('.ts') ? name : `${name}.ts`);
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)((specifier) => {
    if (!specifier.startsWith('.')) throw new Error(`Unexpected dependency ${specifier}`);
    return load(path.resolve(path.dirname(file), specifier));
  }, module, module.exports);
  return module.exports;
};

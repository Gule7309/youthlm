import { readFileSync } from 'node:fs';
import ts from 'typescript';

// For boundary/state modules whose only imports are erased TypeScript types.
export async function loadTs(path, env = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('import.meta.env', JSON.stringify(env));
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

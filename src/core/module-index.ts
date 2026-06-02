import type { Symbol, ModuleInfo } from './types.js';
import { generateId } from '../shared/utils.js';
import { dirname } from 'path';

export class ModuleIndex {
  buildFromSymbols(symbols: Symbol[]): ModuleInfo[] {
    const moduleMap = new Map<string, { paths: Set<string>; symbols: string[] }>();

    for (const sym of symbols) {
      const moduleName = dirname(sym.filePath);
      if (!moduleMap.has(moduleName)) {
        moduleMap.set(moduleName, { paths: new Set(), symbols: [] });
      }
      const mod = moduleMap.get(moduleName)!;
      mod.paths.add(sym.filePath);
      mod.symbols.push(sym.name);
    }

    return [...moduleMap.entries()].map(([name, data]) => ({
      id: generateId(),
      name,
      paths: [...data.paths],
      symbols: data.symbols,
      dependencies: [],
    }));
  }
}

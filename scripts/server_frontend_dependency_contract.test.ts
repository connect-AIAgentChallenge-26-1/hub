import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const SERVER_DIRECTORY = resolve(process.cwd(), 'server');
const IMPORT_SPECIFIER_PATTERN = /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/gu;

function listProductionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return listProductionTypeScriptFiles(path);
    }

    return entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts')
      ? [path]
      : [];
  });
}

function findForbiddenImports(forbiddenSegment: string) {
  return listProductionTypeScriptFiles(SERVER_DIRECTORY).flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    const specifiers = [...source.matchAll(IMPORT_SPECIFIER_PATTERN)]
      .map((match) => match[1])
      .filter((specifier): specifier is string => specifier !== undefined)
      .filter((specifier) => specifier.includes(forbiddenSegment));

    return specifiers.map((specifier) => ({
      file: relative(process.cwd(), path).replaceAll('\\', '/'),
      specifier,
    }));
  });
}

describe('서버와 프론트엔드 의존 경계', () => {
  it('서버 생산 코드가 src/entities를 직접 import하지 않는다', () => {
    expect(findForbiddenImports('/src/entities/')).toEqual([]);
  });

  it('서버 생산 코드가 src/features를 직접 import하지 않는다', () => {
    expect(findForbiddenImports('/src/features/')).toEqual([]);
  });
});

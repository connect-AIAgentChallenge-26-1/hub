import { describe, expect, it } from 'vitest';

import { analyzeImportCandidates, type ImportCandidate } from './index.js';

function createCandidate(
  overrides: Partial<ImportCandidate> = {}
): ImportCandidate {
  return {
    candidateId: 'candidate:0',
    capturedAtCandidate: null,
    collectionPath: [],
    explicitMemoCandidate: null,
    originalUrl: 'https://example.com/a',
    sourceLocation: '1번째 줄',
    titleCandidate: '제목',
    warnings: [],
    ...overrides,
  };
}

describe('가져오기 후보 분석', () => {
  it('정규화된 같은 URL의 두 후보를 유지하고 두 번째만 입력 중복으로 분류한다', () => {
    const analysis = analyzeImportCandidates([
      createCandidate({
        candidateId: 'candidate:first',
        originalUrl: 'https://example.com/a?utm_source=x#top',
      }),
      createCandidate({
        candidateId: 'candidate:second',
        originalUrl: 'https://example.com/a',
      }),
    ]);

    expect(
      analysis.items.map(({ classification, exclusionCode }) => [
        classification,
        exclusionCode,
      ])
    ).toEqual([
      ['candidate', null],
      ['input_duplicate', null],
    ]);
    expect(analysis.items.map(({ normalizedUrl }) => normalizedUrl)).toEqual([
      'https://example.com/a',
      'https://example.com/a',
    ]);
  });

  it('URL 오류만 제외하고 원래 후보 순서를 보존한다', () => {
    const analysis = analyzeImportCandidates([
      createCandidate({
        candidateId: 'candidate:invalid',
        originalUrl: 'not a url',
      }),
      createCandidate({
        candidateId: 'candidate:safe',
        originalUrl: 'https://www.Example.com/a',
      }),
      createCandidate({
        candidateId: 'candidate:private',
        originalUrl: 'http://127.0.0.1/a',
      }),
    ]);

    expect(
      analysis.items.map(
        ({ candidateId, classification, domain, exclusionCode }) => ({
          candidateId,
          classification,
          domain,
          exclusionCode,
        })
      )
    ).toEqual([
      {
        candidateId: 'candidate:invalid',
        classification: 'excluded',
        domain: null,
        exclusionCode: 'invalid-url',
      },
      {
        candidateId: 'candidate:safe',
        classification: 'candidate',
        domain: 'example.com',
        exclusionCode: null,
      },
      {
        candidateId: 'candidate:private',
        classification: 'excluded',
        domain: null,
        exclusionCode: 'private-address',
      },
    ]);
  });

  it('필드를 정리하고 길이를 제한하며 필요한 경고를 중복 없이 추가한다', () => {
    const analysis = analyzeImportCandidates([
      createCandidate({
        collectionPath: Array.from(
          { length: 22 },
          (_, index) => `컬렉션 ${index + 1}`
        ),
        explicitMemoCandidate: `  ${'메'.repeat(201)}  `,
        sourceLocation: '위'.repeat(501),
        titleCandidate: `  ${'제'.repeat(501)}  `,
        warnings: ['trimmed-title', 'trimmed-title'],
      }),
      createCandidate({
        candidateId: 'candidate:empty-title',
        originalUrl: 'https://example.com/b',
        titleCandidate: '   ',
        warnings: [],
      }),
    ]);

    expect(analysis.items[0]).toMatchObject({
      collectionPath: Array.from(
        { length: 20 },
        (_, index) => `컬렉션 ${index + 1}`
      ),
      explicitMemoCandidate: '메'.repeat(200),
      sourceLocation: '위'.repeat(500),
      titleCandidate: '제'.repeat(500),
      warnings: ['trimmed-title', 'trimmed-memo'],
    });
    expect(analysis.items[1]).toMatchObject({
      titleCandidate: null,
      warnings: ['missing-title'],
    });
  });

  it('제한된 컬렉션 경로 키를 기준으로 최초 순서대로 중복을 제거한다', () => {
    const commonPath = Array.from(
      { length: 20 },
      (_, index) => `단계 ${index + 1}`
    );
    const analysis = analyzeImportCandidates([
      createCandidate({
        candidateId: 'candidate:first',
        collectionPath: [...commonPath, '첫 번째 초과 단계'],
      }),
      createCandidate({
        candidateId: 'candidate:second',
        collectionPath: ['다른 컬렉션'],
        originalUrl: 'https://example.com/b',
      }),
      createCandidate({
        candidateId: 'candidate:duplicate-collection',
        collectionPath: [...commonPath, '다른 초과 단계'],
        originalUrl: 'https://example.com/c',
      }),
      createCandidate({
        candidateId: 'candidate:no-collection',
        collectionPath: [],
        originalUrl: 'https://example.com/d',
      }),
    ]);

    expect(analysis.collections).toEqual([commonPath, ['다른 컬렉션']]);
  });

  it('분석 단계 분류를 집계하고 반영 전 개수는 0으로 둔다', () => {
    const analysis = analyzeImportCandidates([
      createCandidate({ candidateId: 'candidate:new' }),
      createCandidate({
        candidateId: 'candidate:duplicate',
        originalUrl: 'https://example.com/a#duplicate',
      }),
      createCandidate({
        candidateId: 'candidate:excluded',
        originalUrl: 'file:///C:/secret.txt',
      }),
    ]);

    expect(analysis.summary).toEqual({
      createdCount: 0,
      duplicateCount: 0,
      excludedCount: 1,
      inputDuplicateCount: 1,
      newCount: 1,
      totalCount: 3,
    });
  });
});

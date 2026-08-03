import type { ImportCandidate } from '@amadda/domain/insight-import';

const RICH_TEXT_BLOCK_TYPES = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'quote',
  'callout',
  'to_do',
  'toggle',
]);
const URL_BLOCK_TYPES = new Set(['bookmark', 'embed', 'link_preview']);
const TRAILING_URL_PUNCTUATION = new Set(['.', ',', '!', ';', ':']);
const CLOSING_URL_BRACKETS = new Map([
  [')', '('],
  [']', '['],
  ['}', '{'],
]);

export type NotionFieldMappingRequest = {
  dataSourceId: string;
  dataSourceName: string;
  fields: Array<{
    id: string;
    name: string;
    type: 'rich_text' | 'url';
  }>;
  suggestedUrlPropertyId: string;
};

export type NotionFieldMapping = {
  dataSourceId: string;
  memoPropertyId: string | null;
  titlePropertyId: string | null;
  urlPropertyId: string;
};

export type NotionCandidateExtractionInput = {
  blocks: Array<{ block: unknown; collectionPath: string[] }>;
  dataSources: unknown[];
  includePageUrls: boolean;
  mappings?: NotionFieldMapping[];
  pages: Array<{ collectionPath: string[]; page: unknown }>;
  propertyItems?: NotionPropertyItem[];
};

export type NotionCandidateExtractionResult = {
  candidates: ImportCandidate[];
  mappingRequests: NotionFieldMappingRequest[];
  propertyRequests: NotionPropertyRequest[];
};

export type NotionPropertyRequest = {
  collectionPath: string[];
  explicitMemoCandidate: string | null;
  pageId: string;
  propertyId: string;
  titleCandidate: string | null;
};

export type NotionPropertyItem = NotionPropertyRequest & {
  index: number;
  item: unknown;
};

export function extractNotionCandidates({
  blocks,
  dataSources,
  includePageUrls,
  mappings = [],
  pages,
  propertyItems = [],
}: NotionCandidateExtractionInput): NotionCandidateExtractionResult {
  const dataSourceById = new Map(
    dataSources
      .map(parseDataSource)
      .filter((value) => value !== null)
      .map((dataSource) => [dataSource.id, dataSource])
  );
  const pagesByDataSource = groupPagesByDataSource(pages);
  const inferredMappings = new Map<string, NotionFieldMapping>();
  const mappingRequests: NotionFieldMappingRequest[] = [];

  for (const [dataSourceId, dataSource] of dataSourceById) {
    const explicitMapping = mappings.find(
      (mapping) => mapping.dataSourceId === dataSourceId
    );

    if (explicitMapping) {
      inferredMappings.set(dataSourceId, explicitMapping);
      continue;
    }

    const fieldResult = inferDataSourceFields(
      dataSource,
      pagesByDataSource.get(dataSourceId) ?? []
    );

    if (fieldResult.request) {
      mappingRequests.push(fieldResult.request);
    } else if (fieldResult.mapping) {
      inferredMappings.set(dataSourceId, fieldResult.mapping);
    }
  }

  if (mappingRequests.length > 0) {
    return { candidates: [], mappingRequests, propertyRequests: [] };
  }

  const pageResult = extractPageCandidates(
    pages,
    inferredMappings,
    includePageUrls
  );
  const candidates = [
    ...pageResult.candidates,
    ...extractPropertyItemCandidates(propertyItems),
    ...extractBlockCandidates(blocks),
  ];

  return {
    candidates,
    mappingRequests: [],
    propertyRequests: pageResult.propertyRequests,
  };
}

function extractPageCandidates(
  pages: NotionCandidateExtractionInput['pages'],
  mappings: Map<string, NotionFieldMapping>,
  includePageUrls: boolean
) {
  const candidates: ImportCandidate[] = [];
  const propertyRequests: NotionPropertyRequest[] = [];

  for (const { collectionPath, page } of pages) {
    if (!isRecord(page) || typeof page.id !== 'string') {
      continue;
    }

    const properties = isRecord(page.properties) ? page.properties : {};
    const title = readPageTitle(properties);
    const dataSourceId = readDataSourceId(page.parent);
    const mapping = dataSourceId ? mappings.get(dataSourceId) : undefined;
    const normalizedPath = collectionPath.slice(0, 20);

    if (mapping) {
      const property = findPropertyById(properties, mapping.urlPropertyId);
      const memo = readPropertyText(
        findPropertyById(properties, mapping.memoPropertyId)
      );
      const mappedTitle =
        readPropertyText(
          findPropertyById(properties, mapping.titlePropertyId)
        ) ?? title;

      if (
        isRecord(property) &&
        property.type === 'rich_text' &&
        typeof property.id === 'string'
      ) {
        propertyRequests.push({
          collectionPath: normalizedPath,
          explicitMemoCandidate: memo,
          pageId: page.id,
          propertyId: property.id,
          titleCandidate: mappedTitle,
        });
      } else {
        appendPropertyCandidates(
          candidates,
          page.id,
          property,
          normalizedPath,
          mappedTitle,
          memo
        );
      }
    } else {
      for (const property of Object.values(properties)) {
        if (isRecord(property) && property.type === 'url') {
          appendPropertyCandidates(
            candidates,
            page.id,
            property,
            normalizedPath,
            title,
            null
          );
        }
      }
    }

    if (
      includePageUrls &&
      typeof page.url === 'string' &&
      page.url.length > 0
    ) {
      candidates.push(
        createCandidate({
          candidateId: `notion:page:${page.id}:self`,
          collectionPath: normalizedPath,
          originalUrl: page.url,
          sourceLocation: createSourceLocation(normalizedPath, '페이지 주소'),
          titleCandidate: title,
        })
      );
    }
  }

  return { candidates, propertyRequests };
}

function extractPropertyItemCandidates(propertyItems: NotionPropertyItem[]) {
  const candidates: ImportCandidate[] = [];

  for (const propertyItem of propertyItems) {
    if (!isRecord(propertyItem.item)) {
      continue;
    }

    const richText = propertyItem.item.rich_text;
    if (!isRecord(richText)) {
      continue;
    }

    const baseId = `notion:page:${propertyItem.pageId}:property:${propertyItem.propertyId}:${propertyItem.index}`;
    const sourceLocation = createSourceLocation(
      propertyItem.collectionPath,
      '텍스트 URL 속성'
    );
    const href = typeof richText.href === 'string' ? richText.href : null;

    if (href) {
      candidates.push({
        ...createCandidate({
          candidateId: `${baseId}:href`,
          collectionPath: propertyItem.collectionPath,
          originalUrl: href,
          sourceLocation,
          titleCandidate: propertyItem.titleCandidate,
        }),
        explicitMemoCandidate: propertyItem.explicitMemoCandidate,
      });
    }

    if (typeof richText.plain_text !== 'string') {
      continue;
    }

    for (const [urlIndex, url] of extractHttpUrls(
      richText.plain_text
    ).entries()) {
      if (url === href) {
        continue;
      }

      candidates.push({
        ...createCandidate({
          candidateId: `${baseId}:text:${urlIndex}`,
          collectionPath: propertyItem.collectionPath,
          originalUrl: url,
          sourceLocation,
          titleCandidate: propertyItem.titleCandidate,
        }),
        explicitMemoCandidate: propertyItem.explicitMemoCandidate,
      });
    }
  }

  return candidates;
}

function appendPropertyCandidates(
  candidates: ImportCandidate[],
  pageId: string,
  property: unknown,
  collectionPath: string[],
  titleCandidate: string | null,
  explicitMemoCandidate: string | null
) {
  if (!isRecord(property) || typeof property.id !== 'string') {
    return;
  }

  if (property.type === 'url' && typeof property.url === 'string') {
    candidates.push({
      ...createCandidate({
        candidateId: `notion:page:${pageId}:property:${property.id}:url`,
        collectionPath,
        originalUrl: property.url,
        sourceLocation: createSourceLocation(collectionPath, 'URL 속성'),
        titleCandidate,
      }),
      explicitMemoCandidate,
    });
    return;
  }

  if (property.type !== 'rich_text' || !Array.isArray(property.rich_text)) {
    return;
  }

  const fullText = readRichText(property.rich_text);
  if (fullText && isHttpUrl(fullText)) {
    candidates.push({
      ...createCandidate({
        candidateId: `notion:page:${pageId}:property:${property.id}:text`,
        collectionPath,
        originalUrl: fullText,
        sourceLocation: createSourceLocation(collectionPath, '텍스트 URL 속성'),
        titleCandidate,
      }),
      explicitMemoCandidate,
    });
  }

  property.rich_text.forEach((richText, index) => {
    if (isRecord(richText) && typeof richText.href === 'string') {
      candidates.push({
        ...createCandidate({
          candidateId: `notion:page:${pageId}:property:${property.id}:href:${index}`,
          collectionPath,
          originalUrl: richText.href,
          sourceLocation: createSourceLocation(
            collectionPath,
            '텍스트 링크 속성'
          ),
          titleCandidate,
        }),
        explicitMemoCandidate,
      });
    }
  });
}

function extractBlockCandidates(
  blocks: NotionCandidateExtractionInput['blocks']
) {
  const candidates: ImportCandidate[] = [];

  for (const { block, collectionPath } of blocks) {
    if (
      !isRecord(block) ||
      typeof block.id !== 'string' ||
      typeof block.type !== 'string'
    ) {
      continue;
    }

    const content = block[block.type];
    const blockType = block.type;
    const normalizedPath = collectionPath.slice(0, 20);

    if (
      URL_BLOCK_TYPES.has(blockType) &&
      isRecord(content) &&
      typeof content.url === 'string'
    ) {
      candidates.push(
        createCandidate({
          candidateId: `notion:block:${block.id}:${blockType}`,
          collectionPath: normalizedPath,
          originalUrl: content.url,
          sourceLocation: createSourceLocation(
            normalizedPath,
            `${getBlockLabel(blockType)} 블록`
          ),
          titleCandidate:
            blockType === 'bookmark' ? readRichText(content.caption) : null,
        })
      );
      continue;
    }

    const richTextGroups = getBlockRichTextGroups(blockType, content);
    richTextGroups.forEach((richText, groupIndex) => {
      richText.forEach((item, itemIndex) => {
        if (!isRecord(item)) {
          return;
        }

        if (typeof item.href === 'string') {
          candidates.push(
            createCandidate({
              candidateId: `notion:block:${block.id}:${blockType}:${groupIndex}:${itemIndex}:href`,
              collectionPath: normalizedPath,
              originalUrl: item.href,
              sourceLocation: createSourceLocation(
                normalizedPath,
                `${getBlockLabel(blockType)} 링크`
              ),
              titleCandidate: null,
            })
          );
        }

        if (typeof item.plain_text === 'string') {
          for (const [urlIndex, url] of extractHttpUrls(
            item.plain_text
          ).entries()) {
            candidates.push(
              createCandidate({
                candidateId: `notion:block:${block.id}:${blockType}:${groupIndex}:${itemIndex}:text:${urlIndex}`,
                collectionPath: normalizedPath,
                originalUrl: url,
                sourceLocation: createSourceLocation(
                  normalizedPath,
                  `${getBlockLabel(blockType)} 텍스트`
                ),
                titleCandidate: null,
              })
            );
          }
        }
      });
    });
  }

  return candidates;
}

function inferDataSourceFields(
  dataSource: ParsedDataSource,
  pages: Array<{ collectionPath: string[]; page: unknown }>
) {
  const urlFields = dataSource.fields.filter((field) => field.type === 'url');
  const richTextFields = dataSource.fields.filter(
    (field) =>
      field.type === 'rich_text' &&
      getRichTextUrlRatio(field.id, pages.slice(0, 100)) >= 0.8
  );
  const candidates = [...urlFields, ...richTextFields];

  if (candidates.length > 1) {
    return {
      request: {
        dataSourceId: dataSource.id,
        dataSourceName: dataSource.name,
        fields: candidates,
        suggestedUrlPropertyId: candidates[0]?.id ?? '',
      } satisfies NotionFieldMappingRequest,
    };
  }

  if (candidates.length === 1) {
    return {
      mapping: {
        dataSourceId: dataSource.id,
        memoPropertyId: null,
        titlePropertyId: null,
        urlPropertyId: candidates[0]?.id ?? '',
      } satisfies NotionFieldMapping,
    };
  }

  return {};
}

type ParsedDataSource = {
  fields: Array<{
    id: string;
    name: string;
    type: 'rich_text' | 'url';
  }>;
  id: string;
  name: string;
};

function parseDataSource(value: unknown): ParsedDataSource | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isRecord(value.properties)
  ) {
    return null;
  }

  const fields: ParsedDataSource['fields'] = [];

  for (const [propertyName, property] of Object.entries(value.properties)) {
    if (
      !isRecord(property) ||
      typeof property.id !== 'string' ||
      (property.type !== 'url' && property.type !== 'rich_text')
    ) {
      continue;
    }

    fields.push({
      id: property.id,
      name: typeof property.name === 'string' ? property.name : propertyName,
      type: property.type,
    });
  }

  return {
    fields,
    id: value.id,
    name: readRichText(value.title) ?? '제목 없음',
  };
}

function groupPagesByDataSource(
  pages: NotionCandidateExtractionInput['pages']
) {
  const grouped = new Map<
    string,
    Array<{ collectionPath: string[]; page: unknown }>
  >();

  for (const page of pages) {
    const parent = isRecord(page.page) ? page.page.parent : undefined;
    const dataSourceId = readDataSourceId(parent);

    if (!dataSourceId) {
      continue;
    }

    grouped.set(dataSourceId, [...(grouped.get(dataSourceId) ?? []), page]);
  }

  return grouped;
}

function getRichTextUrlRatio(
  propertyId: string,
  pages: Array<{ page: unknown }>
) {
  const values = pages
    .map(({ page }) =>
      isRecord(page) && isRecord(page.properties)
        ? readPropertyText(findPropertyById(page.properties, propertyId))
        : null
    )
    .filter((value): value is string => Boolean(value));

  return values.length === 0
    ? 0
    : values.filter(isHttpUrl).length / values.length;
}

function findPropertyById(
  properties: Record<string, unknown>,
  propertyId: string | null
) {
  if (!propertyId) {
    return undefined;
  }

  return Object.values(properties).find(
    (property) => isRecord(property) && property.id === propertyId
  );
}

function readPageTitle(properties: Record<string, unknown>) {
  const titleProperty = Object.values(properties).find(
    (property) => isRecord(property) && property.type === 'title'
  );
  return readPropertyText(titleProperty);
}

function readPropertyText(property: unknown) {
  if (!isRecord(property) || typeof property.type !== 'string') {
    return null;
  }

  const value = property[property.type];
  return Array.isArray(value) ? readRichText(value) : null;
}

function readRichText(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const text = value
    .map((item) =>
      isRecord(item) && typeof item.plain_text === 'string'
        ? item.plain_text
        : ''
    )
    .join('')
    .trim();

  return text || null;
}

function getBlockRichTextGroups(type: string, content: unknown) {
  if (!isRecord(content)) {
    return [];
  }

  if (type === 'table_row' && Array.isArray(content.cells)) {
    return content.cells.filter(Array.isArray);
  }

  return RICH_TEXT_BLOCK_TYPES.has(type) && Array.isArray(content.rich_text)
    ? [content.rich_text]
    : [];
}

function readDataSourceId(parent: unknown) {
  return isRecord(parent) &&
    parent.type === 'data_source_id' &&
    typeof parent.data_source_id === 'string'
    ? parent.data_source_id
    : null;
}

function createCandidate({
  candidateId,
  collectionPath,
  originalUrl,
  sourceLocation,
  titleCandidate,
}: {
  candidateId: string;
  collectionPath: string[];
  originalUrl: string;
  sourceLocation: string;
  titleCandidate: string | null;
}): ImportCandidate {
  return {
    candidateId,
    capturedAtCandidate: null,
    collectionPath,
    explicitMemoCandidate: null,
    originalUrl,
    sourceLocation,
    titleCandidate,
    warnings: titleCandidate ? [] : ['missing-title'],
  };
}

function createSourceLocation(path: string[], label: string) {
  return `Notion${path.length > 0 ? ` ${path.join(' / ')}` : ''} · ${label}`;
}

function getBlockLabel(type: string) {
  return type === 'link_preview'
    ? '링크 미리보기'
    : type === 'bookmark'
      ? '북마크'
      : type === 'embed'
        ? '임베드'
        : type;
}

function extractHttpUrls(text: string) {
  return [...text.matchAll(/https?:\/\/[^\s<>"']+/giu)].map((match) =>
    removeTrailingUrlDelimiters(match[0])
  );
}

function removeTrailingUrlDelimiters(rawUrl: string) {
  let url = rawUrl;

  while (url.length > 0) {
    const finalCharacter = url[url.length - 1] ?? '';

    if (TRAILING_URL_PUNCTUATION.has(finalCharacter)) {
      url = url.slice(0, -1);
      continue;
    }

    const openingBracket = CLOSING_URL_BRACKETS.get(finalCharacter);
    if (
      openingBracket !== undefined &&
      countCharacter(url, finalCharacter) > countCharacter(url, openingBracket)
    ) {
      url = url.slice(0, -1);
      continue;
    }

    break;
  }

  return url;
}

function countCharacter(value: string, character: string) {
  return [...value].filter((current) => current === character).length;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const TRACKING_PARAMETER_NAMES = new Set<string>([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
]);

export function normalizeInsightUrl(rawUrl: string) {
  const originalUrl = rawUrl.trim();
  const rawProtocol = /^([a-z][a-z\d+.-]*):/i
    .exec(originalUrl)?.[1]
    ?.toLowerCase();

  if (
    rawProtocol === undefined ||
    ((rawProtocol === 'http' || rawProtocol === 'https') &&
      !/^https?:\/\/[^/\\]/i.test(originalUrl))
  ) {
    return { ok: false as const, reason: 'invalid-url' as const };
  }

  let url: URL;

  try {
    url = new URL(originalUrl);
  } catch {
    return { ok: false as const, reason: 'invalid-url' as const };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false as const, reason: 'unsupported-protocol' as const };
  }

  return {
    ok: true as const,
    originalUrl,
    normalizedUrl: createNormalizedUrl(originalUrl, url),
    domain: url.hostname.replace(/^www\./, ''),
  };
}

function createNormalizedUrl(originalUrl: string, url: URL) {
  const schemeEndIndex = originalUrl.indexOf(':');
  const hasAuthorityPrefix = originalUrl.startsWith('//', schemeEndIndex + 1);
  const authorityStartIndex = schemeEndIndex + (hasAuthorityPrefix ? 3 : 1);
  const suffixStartIndex = findSuffixStartIndex(
    originalUrl,
    authorityStartIndex
  );
  const rawAuthority = originalUrl.slice(authorityStartIndex, suffixStartIndex);
  const userInfoEndIndex = rawAuthority.lastIndexOf('@');
  const userInfo =
    userInfoEndIndex >= 0 ? rawAuthority.slice(0, userInfoEndIndex + 1) : '';
  const rawSuffix = originalUrl.slice(suffixStartIndex);
  const fragmentStartIndex = rawSuffix.indexOf('#');
  const suffixWithoutFragment =
    fragmentStartIndex >= 0
      ? rawSuffix.slice(0, fragmentStartIndex)
      : rawSuffix;
  const queryStartIndex = suffixWithoutFragment.indexOf('?');
  const rawPath =
    queryStartIndex >= 0
      ? suffixWithoutFragment.slice(0, queryStartIndex)
      : suffixWithoutFragment;
  const normalizedPath = rawPath === '/' ? '' : rawPath;
  const normalizedQuery =
    queryStartIndex >= 0
      ? normalizeQuery(suffixWithoutFragment.slice(queryStartIndex + 1))
      : '';

  return `${url.protocol}//${userInfo}${url.host}${normalizedPath}${normalizedQuery}`;
}

function findSuffixStartIndex(rawUrl: string, authorityStartIndex: number) {
  for (let index = authorityStartIndex; index < rawUrl.length; index += 1) {
    if ('/\\?#'.includes(rawUrl[index] ?? '')) {
      return index;
    }
  }

  return rawUrl.length;
}

function normalizeQuery(rawQuery: string) {
  const preservedParameters = rawQuery.split('&').filter((parameter) => {
    const name = decodeQueryParameterName(parameter);

    return name === undefined || !TRACKING_PARAMETER_NAMES.has(name);
  });

  return preservedParameters.length > 0
    ? `?${preservedParameters.join('&')}`
    : '';
}

function decodeQueryParameterName(parameter: string) {
  if (parameter.length === 0) {
    return undefined;
  }

  const separatorIndex = parameter.indexOf('=');
  const rawName =
    separatorIndex === -1 ? parameter : parameter.slice(0, separatorIndex);

  try {
    return decodeURIComponent(rawName.replace(/\+/g, ' '));
  } catch {
    return rawName;
  }
}

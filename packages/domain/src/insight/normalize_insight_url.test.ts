import { describe, expect, it } from 'vitest';

import * as insightApi from './index.js';

describe('normalizeInsightUrl', () => {
  it('returns the URL contract for an http URL', () => {
    expect(
      insightApi.normalizeInsightUrl('http://example.com/articles/1')
    ).toEqual({
      ok: true,
      originalUrl: 'http://example.com/articles/1',
      normalizedUrl: 'http://example.com/articles/1',
      domain: 'example.com',
    });
  });

  it('trims surrounding whitespace from an https URL', () => {
    expect(
      insightApi.normalizeInsightUrl('  https://www.Example.com/Path  ')
    ).toEqual({
      ok: true,
      originalUrl: 'https://www.Example.com/Path',
      normalizedUrl: 'https://www.example.com/Path',
      domain: 'example.com',
    });
  });

  it('normalizes the host, default port, fragment, and root path', () => {
    expect(
      insightApi.normalizeInsightUrl('HTTPS://Example.COM:443/#section')
    ).toEqual({
      ok: true,
      originalUrl: 'HTTPS://Example.COM:443/#section',
      normalizedUrl: 'https://example.com',
      domain: 'example.com',
    });
  });

  it('removes only tracking parameters and preserves path and query details', () => {
    const rawUrl =
      'https://example.com/Docs/CaseSensitive?keep=One' +
      '&utm_source=newsletter&tag=~Exact&utm_medium=email' +
      '&utm_campaign=launch&utm_term=reader&utm_content=hero' +
      '&gclid=google&fbclid=facebook&after=Two';

    expect(insightApi.normalizeInsightUrl(rawUrl)).toEqual({
      ok: true,
      originalUrl: rawUrl,
      normalizedUrl:
        'https://example.com/Docs/CaseSensitive?keep=One&tag=~Exact&after=Two',
      domain: 'example.com',
    });
  });

  it('preserves raw dot segments in the path', () => {
    const rawUrl =
      'HTTPS://Example.COM:443/a/../b?keep=1&utm_source=test#fragment';

    expect(insightApi.normalizeInsightUrl(rawUrl)).toEqual({
      ok: true,
      originalUrl: rawUrl,
      normalizedUrl: 'https://example.com/a/../b?keep=1',
      domain: 'example.com',
    });
  });

  it('preserves backslashes in the raw path representation', () => {
    const rawUrl =
      'https://Example.com/Folder\\Draft?before=1&fbclid=x&after=2#top';

    expect(insightApi.normalizeInsightUrl(rawUrl)).toEqual({
      ok: true,
      originalUrl: rawUrl,
      normalizedUrl: 'https://example.com/Folder\\Draft?before=1&after=2',
      domain: 'example.com',
    });
  });

  it('preserves existing percent-encoding in the raw path and query', () => {
    const rawUrl =
      'http://Example.com:80/%2E%2E/%7eUser?gclid=x&encoded=%2f%2F#frag';

    expect(insightApi.normalizeInsightUrl(rawUrl)).toEqual({
      ok: true,
      originalUrl: rawUrl,
      normalizedUrl: 'http://example.com/%2E%2E/%7eUser?encoded=%2f%2F',
      domain: 'example.com',
    });
  });

  it('decodes query names for tracking checks without rejecting malformed encoding', () => {
    const rawUrl =
      'https://example.com/article?utm%5Fsource=encoded' +
      '&bad%=preserved&utm+source=preserved&keep=1';

    expect(insightApi.normalizeInsightUrl(rawUrl)).toEqual({
      ok: true,
      originalUrl: rawUrl,
      normalizedUrl:
        'https://example.com/article?bad%=preserved' +
        '&utm+source=preserved&keep=1',
      domain: 'example.com',
    });
  });

  it('rejects an HTTP authority with a single slash', () => {
    expect(insightApi.normalizeInsightUrl('https:/example.com/path')).toEqual({
      ok: false,
      reason: 'invalid-url',
    });
  });

  it('rejects an HTTP authority with extra slashes', () => {
    expect(insightApi.normalizeInsightUrl('https:///example.com/path')).toEqual(
      {
        ok: false,
        reason: 'invalid-url',
      }
    );
  });

  it('rejects an HTTP scheme and authority written with backslashes', () => {
    expect(
      insightApi.normalizeInsightUrl('https:\\\\example.com\\path')
    ).toEqual({
      ok: false,
      reason: 'invalid-url',
    });
  });

  it('rejects a malformed URL', () => {
    let result: unknown;

    try {
      result = insightApi.normalizeInsightUrl('not a url');
    } catch {
      result = 'threw';
    }

    expect(result).toEqual({
      ok: false,
      reason: 'invalid-url',
    });
  });

  it('rejects an unsupported protocol', () => {
    expect(insightApi.normalizeInsightUrl('ftp://example.com/file')).toEqual({
      ok: false,
      reason: 'unsupported-protocol',
    });
  });
});

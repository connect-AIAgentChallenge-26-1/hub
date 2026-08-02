import { describe, expect, it } from 'vitest';

import { analyzeImportUrl } from './index.js';

describe('가져오기 URL 분석', () => {
  it.each([
    ['javascript:alert(1)', 'unsupported-protocol'],
    ['data:text/plain,secret', 'unsupported-protocol'],
    ['file:///C:/secret.txt', 'unsupported-protocol'],
    ['ftp://example.com/a', 'unsupported-protocol'],
    ['http://localhost:3000/a', 'private-address'],
    ['http://127.0.0.1/a', 'private-address'],
    ['http://10.0.0.1/a', 'private-address'],
    ['http://172.16.0.1/a', 'private-address'],
    ['http://192.168.0.1/a', 'private-address'],
    ['http://[::1]/a', 'private-address'],
    ['http://[fc00::1]/a', 'private-address'],
  ] as const)('%s 주소를 %s 사유로 제외한다', (url, reason) => {
    expect(analyzeImportUrl(url)).toEqual({ ok: false, reason });
  });

  it('안전한 URL은 기존 계약으로 정규화하고 도메인을 반환한다', () => {
    expect(
      analyzeImportUrl(
        '  HTTPS://www.Example.COM:443/a?utm_source=x&keep=1#top  '
      )
    ).toEqual({
      domain: 'example.com',
      normalizedUrl: 'https://www.example.com/a?keep=1',
      ok: true,
      originalUrl: 'HTTPS://www.Example.COM:443/a?utm_source=x&keep=1#top',
    });
  });

  it('형식이 잘못된 URL을 invalid-url로 제외한다', () => {
    expect(analyzeImportUrl('https:/example.com/a')).toEqual({
      ok: false,
      reason: 'invalid-url',
    });
  });

  it.each([
    'http://localhost.localdomain/a',
    'http://service.localhost/a',
    'http://service.internal/a',
    'http://printer.local/a',
  ])('로컬 호스트 이름 %s를 제외한다', (url) => {
    expect(analyzeImportUrl(url)).toEqual({
      ok: false,
      reason: 'private-address',
    });
  });

  it.each([
    '0.0.0.0',
    '0.255.255.255',
    '10.0.0.0',
    '10.255.255.255',
    '100.64.0.0',
    '100.127.255.255',
    '127.0.0.0',
    '127.255.255.255',
    '169.254.0.0',
    '169.254.255.255',
    '172.16.0.0',
    '172.31.255.255',
    '192.0.0.0',
    '192.0.0.255',
    '192.0.2.0',
    '192.0.2.255',
    '192.168.0.0',
    '192.168.255.255',
    '198.18.0.0',
    '198.19.255.255',
    '198.51.100.0',
    '198.51.100.255',
    '203.0.113.0',
    '203.0.113.255',
    '224.0.0.0',
    '239.255.255.255',
    '240.0.0.0',
    '255.255.255.255',
  ])('예약 IPv4 주소 %s를 제외한다', (host) => {
    expect(analyzeImportUrl(`http://${host}/a`)).toEqual({
      ok: false,
      reason: 'private-address',
    });
  });

  it.each([
    '1.0.0.1',
    '100.63.255.255',
    '100.128.0.0',
    '169.253.255.255',
    '169.255.0.0',
    '172.15.255.255',
    '172.32.0.0',
    '192.0.1.1',
    '192.0.3.1',
    '198.17.255.255',
    '198.20.0.0',
    '203.0.112.255',
    '203.0.114.0',
    '223.255.255.255',
  ])('예약 범위 밖 IPv4 주소 %s를 허용한다', (host) => {
    expect(analyzeImportUrl(`https://${host}/a`)).toMatchObject({
      domain: host,
      normalizedUrl: `https://${host}/a`,
      ok: true,
    });
  });

  it.each([
    'http://[::]/a',
    'http://[::1]/a',
    'http://[fc00::]/a',
    'http://[fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/a',
    'http://[fe80::]/a',
    'http://[febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/a',
    'https://[fec0::1]/a',
    'http://[::ffff:10.0.0.1]/a',
    'http://[::ffff:127.0.0.1]/a',
    'http://[::ffff:192.168.0.1]/a',
  ])('사설 또는 IPv4-mapped IPv6 주소 %s를 제외한다', (url) => {
    expect(analyzeImportUrl(url)).toEqual({
      ok: false,
      reason: 'private-address',
    });
  });

  it.each(['https://[2001:4860:4860::8888]/a', 'https://[::ffff:8.8.8.8]/a'])(
    '차단 범위 밖 IPv6 주소 %s를 허용한다',
    (url) => {
      expect(analyzeImportUrl(url)).toMatchObject({ ok: true });
    }
  );
});

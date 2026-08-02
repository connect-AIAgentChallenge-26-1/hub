import { normalizeInsightUrl } from '../insight/index.js';

const PRIVATE_HOST_NAMES = new Set(['localhost', 'localhost.localdomain']);
const PRIVATE_SUFFIXES = ['.internal', '.local', '.localhost'];

export type ImportUrlResult =
  | {
      domain: string;
      normalizedUrl: string;
      ok: true;
      originalUrl: string;
    }
  | {
      ok: false;
      reason: 'invalid-url' | 'private-address' | 'unsupported-protocol';
    };

export function analyzeImportUrl(rawUrl: string): ImportUrlResult {
  const normalizedUrl = normalizeInsightUrl(rawUrl);

  if (!normalizedUrl.ok) {
    return normalizedUrl;
  }

  const hostname = new URL(normalizedUrl.normalizedUrl).hostname;

  if (isPrivateHostname(hostname)) {
    return { ok: false, reason: 'private-address' };
  }

  return normalizedUrl;
}

function isPrivateHostname(rawHostname: string) {
  const hostname = rawHostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');

  if (
    PRIVATE_HOST_NAMES.has(hostname) ||
    PRIVATE_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return true;
  }

  const ipv4 = parseIpv4(hostname);

  if (ipv4 !== null) {
    return isPrivateIpv4(ipv4);
  }

  const ipv6 = parseIpv6(hostname);

  return ipv6 !== null && isPrivateIpv6(ipv6);
}

function parseIpv4(hostname: string) {
  const parts = hostname.split('.');

  if (
    parts.length !== 4 ||
    parts.some((part) => !/^(?:0|[1-9]\d{0,2})$/.test(part))
  ) {
    return null;
  }

  const [
    first = Number.NaN,
    second = Number.NaN,
    third = Number.NaN,
    fourth = Number.NaN,
  ] = parts.map(Number);
  const octets = [first, second, third, fourth] as const;

  return octets.every((octet) => octet <= 255) ? octets : null;
}

function isPrivateIpv4(ipv4: readonly number[]) {
  const [first, second, third] = ipv4;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second !== undefined && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  );
}

function parseIpv6(hostname: string) {
  const doubleColonParts = hostname.split('::');

  if (doubleColonParts.length > 2) {
    return null;
  }

  const left = parseIpv6Side(doubleColonParts[0] ?? '');
  const right = parseIpv6Side(doubleColonParts[1] ?? '');

  if (left === null || right === null) {
    return null;
  }

  if (doubleColonParts.length === 1) {
    return left.length === 8 ? left : null;
  }

  const omittedCount = 8 - left.length - right.length;

  return omittedCount > 0
    ? [...left, ...Array<number>(omittedCount).fill(0), ...right]
    : null;
}

function parseIpv6Side(side: string) {
  if (side.length === 0) {
    return [];
  }

  const parts = side.split(':');
  const parsed: number[] = [];

  for (const [index, part] of parts.entries()) {
    if (part.includes('.')) {
      if (index !== parts.length - 1) {
        return null;
      }

      const ipv4 = parseIpv4(part);

      if (ipv4 === null) {
        return null;
      }

      parsed.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      continue;
    }

    if (!/^[\da-f]{1,4}$/i.test(part)) {
      return null;
    }

    parsed.push(Number.parseInt(part, 16));
  }

  return parsed;
}

function isPrivateIpv6(ipv6: readonly number[]) {
  const first = ipv6[0] ?? 0;
  const isUnspecified = ipv6.every((part) => part === 0);
  const isLoopback =
    ipv6.slice(0, 7).every((part) => part === 0) && ipv6[7] === 1;
  const isUniqueLocal = (first & 0xfe00) === 0xfc00;
  const isLinkLocal = (first & 0xffc0) === 0xfe80;
  const isSiteLocal = (first & 0xffc0) === 0xfec0;

  return (
    isUnspecified ||
    isLoopback ||
    isUniqueLocal ||
    isLinkLocal ||
    isSiteLocal ||
    isPrivateIpv4MappedIpv6(ipv6)
  );
}

function isPrivateIpv4MappedIpv6(ipv6: readonly number[]) {
  if (!ipv6.slice(0, 5).every((part) => part === 0) || ipv6[5] !== 0xffff) {
    return false;
  }

  const firstPair = ipv6[6] ?? 0;
  const secondPair = ipv6[7] ?? 0;

  return isPrivateIpv4([
    firstPair >> 8,
    firstPair & 0xff,
    secondPair >> 8,
    secondPair & 0xff,
  ]);
}

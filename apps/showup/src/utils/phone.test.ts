import { extractPhoneLast4, maskPhone, normalizePhone, parsePhone, toStoredPhone } from './phone';

const cases = [
  { raw: '010-1234-5678', expectedNormalized: '01012345678', expectedLast4: '5678', expectedMasked: '010-****-5678' },
  { raw: '01012345678', expectedNormalized: '01012345678', expectedLast4: '5678', expectedMasked: '010-****-5678' },
  { raw: '010 1234 5678', expectedNormalized: '01012345678', expectedLast4: '5678', expectedMasked: '010-****-5678' },
  { raw: '010-123-4567', expectedNormalized: '0101234567', expectedLast4: '4567', expectedMasked: '010-***-4567' },
];

let failed = 0;
for (const c of cases) {
  const normalized = normalizePhone(c.raw);
  const last4 = extractPhoneLast4(c.raw);
  const masked = maskPhone(c.raw);
  const parsed = parsePhone(c.raw);
  const stored = toStoredPhone(c.raw);

  const ok =
    normalized === c.expectedNormalized &&
    last4 === c.expectedLast4 &&
    masked === c.expectedMasked &&
    parsed.phone === stored &&
    parsed.phoneLast4 === c.expectedLast4 &&
    parsed.phoneMasked === c.expectedMasked;

  if (!ok) {
    failed += 1;
    console.error(`❌ ${c.raw}`);
    console.error(`   normalized: ${normalized} (expected ${c.expectedNormalized})`);
    console.error(`   last4: ${last4} (expected ${c.expectedLast4})`);
    console.error(`   masked: ${masked} (expected ${c.expectedMasked})`);
    console.error(`   parsed: ${JSON.stringify(parsed)}`);
  } else {
    console.log(`✅ ${c.raw}`);
  }
}

// 검증용: 잘못된 번호는 예외 발생
const invalidCases = ['', '1234', '010-1234', 'abcdefghij'];
for (const raw of invalidCases) {
  try {
    toStoredPhone(raw);
    console.error(`❌ ${raw}: 예외가 발생해야 함`);
    failed += 1;
  } catch {
    console.log(`✅ ${raw}: 잘못된 번호 예외 발생`);
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log('모든 phone.ts 검증 통과');

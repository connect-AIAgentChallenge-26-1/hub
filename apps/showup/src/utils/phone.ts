// ShowUp 전화번호 처리 유틸
// 원본 번호는 내부 저장용. 화면 표시는 반드시 maskPhone() 결과만 사용.

const PHONE_REGEX = /^01[0-9]\d{7,8}$/;

/** 하이픈·공백·기타 문자를 제거해 숫자만 남긴다. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** 전화번호 형식이 맞는지 검증한다. 국내 휴대폰 번호 기준. */
export function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(normalizePhone(phone));
}

/** 마지막 4자리를 반환한다. 검색용 식별자로 사용. */
export function extractPhoneLast4(phone: string): string {
  const digits = normalizePhone(phone);
  return digits.slice(-4);
}

/**
 * 화면 표시용 마스킹 번호를 반환한다.
 * 01012345678 → 010-****-5678
 */
export function maskPhone(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-***-${digits.slice(-4)}`;
  }
  // 예상 밖 형식은 뒤 4자리만 노출
  return `****-${digits.slice(-4)}`;
}

/**
 * Firestore 저장용 표준 형태로 변환한다.
 * 입력: "010-1234-5678" → "01012345678"
 * 이미 정규화된 번호는 그대로 반환.
 */
export function toStoredPhone(phone: string): string {
  const digits = normalizePhone(phone);
  if (!isValidPhone(digits)) {
    throw new Error(`Invalid phone number: ${phone}`);
  }
  return digits;
}

/**
 * 고객 등록/수정 시 사용하는 완전한 전화번호 객체.
 * storedPhone + phoneLast4 + maskedPhone 을 한 번에 생성.
 */
export function parsePhone(
  rawPhone: string,
): { phone: string; phoneLast4: string; phoneMasked: string } {
  const phone = toStoredPhone(rawPhone);
  return {
    phone,
    phoneLast4: extractPhoneLast4(phone),
    phoneMasked: maskPhone(phone),
  };
}

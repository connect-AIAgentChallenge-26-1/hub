export function normalizeDisplayName(value) {
  const displayName = String(value || "").trim().replace(/\s+/g, " ");
  if (displayName.length < 2 || displayName.length > 30) {
    throw new Error("닉네임은 2자 이상 30자 이하로 입력해 주세요.");
  }
  return displayName;
}


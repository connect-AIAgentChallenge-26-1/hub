// 자격 매칭 (순수 함수). 조건마다 통과 / 불가 / 확인필요를 판정해 3-state로 나눈다.
// - 불가(fail)가 하나라도 있으면 지원 불가
// - 불가는 없지만 확인필요(잘 모름)가 있으면 확인 필요
// - 전부 통과면 지원 가능
// 빈 배열이나 null 조건은 무관이라 항상 통과.
// 불가 사유에는 요구값(req)과 내값(mine)을 같이 담아 화면에서 비교해 보여준다.

export function matchActivity(activity, profile) {
  const e = activity.eligibility;
  const failed = [];
  const unknown = [];

  if (e.grades.length && !e.grades.includes(profile.grade)) {
    failed.push({ label: "학년", req: e.grades.map((g) => g + "학년").join("·"), mine: profile.grade + "학년" });
  }
  if (e.majors.length && !e.majors.includes(profile.major)) {
    failed.push({ label: "전공", req: e.majors.join("·"), mine: profile.major });
  }
  if (e.regions.length && !e.regions.includes(profile.region)) {
    failed.push({ label: "지역", req: e.regions.join("·"), mine: profile.region });
  }
  if (e.enrollment.length && !e.enrollment.includes(profile.enrollment)) {
    failed.push({ label: "재학상태", req: e.enrollment.join("·"), mine: profile.enrollment });
  }
  // 소득분위: 잘 모름(null)이면 확인필요
  if (e.incomeMax !== null) {
    if (profile.income == null) unknown.push({ label: "소득분위", req: e.incomeMax + "분위 이하" });
    else if (profile.income > e.incomeMax) failed.push({ label: "소득분위", req: e.incomeMax + "분위 이하", mine: profile.income + "분위" });
  }
  // 학점: 잘 모름(null)이면 확인필요
  if (e.gpaMin !== null) {
    if (profile.gpa == null) unknown.push({ label: "학점", req: e.gpaMin.toFixed(1) + " 이상" });
    else if (profile.gpa < e.gpaMin) failed.push({ label: "학점", req: e.gpaMin.toFixed(1) + " 이상", mine: profile.gpa.toFixed(1) });
  }

  let status = "eligible";
  if (failed.length) status = "ineligible";
  else if (unknown.length) status = "unknown";
  return { status, failed, unknown };
}

// 전체 목록을 3-state로 나눠서 반환
export function splitByMatch(activities, profile) {
  const eligible = [];
  const ineligible = [];
  const review = [];
  for (const a of activities) {
    const r = matchActivity(a, profile);
    const item = { ...a, ...r };
    if (r.status === "eligible") eligible.push(item);
    else if (r.status === "ineligible") ineligible.push(item);
    else review.push(item);
  }
  return { eligible, ineligible, review };
}

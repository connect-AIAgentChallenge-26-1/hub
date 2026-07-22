import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUIRED_ROW_TITLES,
  dashboardQueryRules,
  validateAlerts,
  validateDashboard,
  validatePromql,
  validateRequiredOperationalQueries
} from '../validate.mjs';

const known = new Set([
  'placepick_job_outcomes_total',
  'placepick_recommendation_results_total'
]);

function dashboard() {
  const panels = REQUIRED_ROW_TITLES.map((title, index) => ({
    id: index + 1,
    title,
    type: 'row',
    panels: []
  }));
  for (let index = 0; index < 20; index += 1) {
    panels.push({
      id: index + 100,
      title: `query-${index}`,
      type: 'timeseries',
      targets: [{expr: 'sum(rate(placepick_job_outcomes_total[5m]))'}]
    });
  }
  return {uid: 'placepick-runtime', editable: false, panels};
}

test('정확한 7개 운영 row와 실행 코드 metric query를 허용한다', () => {
  assert.doesNotThrow(() => validateDashboard(dashboard(), known));
});

test('row가 빠진 dashboard를 거부한다', () => {
  const invalid = dashboard();
  invalid.panels.shift();
  assert.throws(() => validateDashboard(invalid, known), /정확히 7개/u);
});

test('dashboard query를 promtool recording rule로 모두 변환한다', () => {
  const source = dashboard();
  const rules = dashboardQueryRules(source).groups[0].rules;
  assert.equal(rules.length, 20);
  assert.equal(rules[0].record, 'placepick_dashboard_query_smoke_001');
  assert.match(rules[0].expr, /placepick_job_outcomes_total/u);
});

test('snapshot freshness와 SSE lifecycle 필수 query가 빠진 dashboard를 거부한다', () => {
  assert.throws(
    () => validateRequiredOperationalQueries(dashboard()),
    /필수 freshness 또는 lifecycle metric/u
  );
});

test('실행 코드에 없는 PlacePick metric을 거부한다', () => {
  assert.throws(
    () => validatePromql('sum(rate(placepick_unknown_total[5m]))', known),
    /확인되지 않은 metric/u
  );
});

test('민감하거나 고카디널리티 label을 포함한 query를 거부한다', () => {
  assert.throws(
    () => validatePromql('sum by (session_id) (placepick_job_outcomes_total)', known),
    /민감 label/u
  );
});

test('저트래픽 비율과 평균을 왜곡하는 clamp_min 분모를 거부한다', () => {
  assert.throws(
    () => validatePromql(
      'sum(rate(placepick_recommendation_results_total{partial="true"}[5m])) / clamp_min(sum(rate(placepick_recommendation_results_total[5m])), 1)',
      known
    ),
    /저트래픽 값을 왜곡/u
  );
});

test('비율 경보는 20표본 gate가 없으면 거부한다', () => {
  const requiredNames = [
    'PlacePickTelemetryMissing',
    'PlacePickReadinessDown',
    'PlacePickProviderAuthenticationFailed',
    'PlacePickProviderQuotaPressure',
    'PlacePickDlqDetected',
    'PlacePickOutboxBacklog',
    'PlacePickStreamBacklog',
    'PlacePickRecommendationJobStuck',
    'PlacePickTelemetrySnapshotFailed',
    'PlacePickTelemetrySnapshotStale',
    'PlacePickCandidateZeroRateHigh',
    'PlacePickPartialRecommendationRateHigh',
    'PlacePickReasonFallbackRateHigh',
    'PlacePickProviderErrorRateHigh',
    'PlacePickHttpP95LatencyHigh'
  ];
  const alerts = {
    groups: [{
      rules: requiredNames.map(name => ({
        alert: name,
        expr: 'placepick_job_outcomes_total > 0',
        labels: name.endsWith('RateHigh') || name.includes('P95') ? {sample_gate: '20'} : {},
        annotations: {runbook: 'RUN-0007'}
      }))
    }]
  };
  assert.throws(() => validateAlerts(alerts, known), /최소 20표본/u);
});

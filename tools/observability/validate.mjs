import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import YAML from 'yaml';

export const REQUIRED_ROW_TITLES = Object.freeze([
  '1. 사용자 여정과 품질 SLO',
  '2. 후보 검색 Funnel과 부분 결과',
  '3. Naver·Elice 호출·Token·Fallback',
  '4. Outbox·Redis·Worker',
  '5. DB·Redis·JVM·HTTP',
  '6. SSE·투표·보안',
  '7. 프런트 Web Vitals·Cold Start·Release SHA'
]);

export const REQUIRED_OPERATIONAL_QUERY_METRICS = Object.freeze([
  'placepick_telemetry_snapshot_total',
  'placepick_telemetry_snapshot_last_success_timestamp_seconds',
  'placepick_sse_connections_opened_total',
  'placepick_sse_connections_resumed_total',
  'placepick_sse_events_replayed_total',
  'placepick_sse_send_failures_total',
  'placepick_sse_connections_closed_total',
  'placepick_sse_connection_lifetime_seconds_bucket'
]);

const REQUIRED_ALERTS = new Set([
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
]);

const VOLUME_GATED_ALERTS = new Set([
  'PlacePickCandidateZeroRateHigh',
  'PlacePickPartialRecommendationRateHigh',
  'PlacePickReasonFallbackRateHigh',
  'PlacePickProviderErrorRateHigh',
  'PlacePickHttpP95LatencyHigh'
]);

const FRAMEWORK_METRIC_PREFIXES = Object.freeze([
  'hikaricp_',
  'http_server_requests_seconds_',
  'jvm_',
  'process_',
  'up'
]);

const FORBIDDEN_QUERY_TOKENS =
  /(?:api[_-]?key|authorization|cookie|organizer|share[_-]?token|session[_-]?id|place[_-]?id|job[_-]?id|event[_-]?id|request[_-]?text|address|provider[_-]?url)/iu;

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function allPanels(panels) {
  return panels.flatMap(panel => [panel, ...allPanels(panel.panels ?? [])]);
}

function expressionsFromDashboard(dashboard) {
  return allPanels(dashboard.panels ?? [])
    .flatMap(panel => panel.targets ?? [])
    .map(target => target.expr)
    .filter(Boolean);
}

export function dashboardQueryRules(dashboard) {
  return {
    groups: [{
      name: 'placepick-dashboard-query-smoke',
      rules: expressionsFromDashboard(dashboard).map((expression, index) => ({
        record: `placepick_dashboard_query_smoke_${String(index + 1).padStart(3, '0')}`,
        expr: expression
      }))
    }]
  };
}

function rulesFromAlerts(alerts) {
  return (alerts.groups ?? []).flatMap(group => group.rules ?? []);
}

function assertBalancedPromql(expression) {
  const pairs = new Map([[')', '('], [']', '['], ['}', '{']]);
  const stack = [];
  let quoted = false;
  let escaped = false;
  for (const character of expression) {
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        quoted = false;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if ('([{'.includes(character)) {
      stack.push(character);
    } else if (pairs.has(character)) {
      requireCondition(stack.pop() === pairs.get(character), `PromQL 괄호가 맞지 않습니다: ${expression}`);
    }
  }
  requireCondition(!quoted && stack.length === 0, `PromQL 문자열 또는 괄호가 닫히지 않았습니다: ${expression}`);
}

function metricNames(expression) {
  const withoutStrings = expression.replaceAll(/"(?:\\.|[^"\\])*"/g, '');
  return [...withoutStrings.matchAll(/\b(?:placepick|process|jvm|http_server|hikaricp|up)[a-zA-Z0-9_:]*/g)]
    .map(match => match[0].replace(/:$/, ''));
}

function micrometerVariants(name) {
  const base = name.replaceAll('.', '_');
  return new Set([
    base,
    `${base}_total`,
    `${base}_count`,
    `${base}_sum`,
    `${base}_bucket`,
    `${base}_seconds`,
    `${base}_seconds_count`,
    `${base}_seconds_sum`,
    `${base}_seconds_bucket`
  ]);
}

export function collectApplicationMetricNames(rootDirectory) {
  const sourceRoot = path.join(rootDirectory, 'backend', 'src', 'main', 'java');
  const result = new Set();
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(target);
      } else if (entry.name.endsWith('.java')) {
        const content = fs.readFileSync(target, 'utf8');
        for (const match of content.matchAll(/"(placepick\.[a-z0-9.]+)"/g)) {
          for (const variant of micrometerVariants(match[1])) {
            result.add(variant);
          }
        }
      }
    }
  };
  visit(sourceRoot);
  return result;
}

export function validatePromql(expression, knownApplicationMetrics) {
  requireCondition(typeof expression === 'string' && expression.trim().length > 0, '빈 PromQL은 허용하지 않습니다.');
  requireCondition(!FORBIDDEN_QUERY_TOKENS.test(expression), `고카디널리티 또는 민감 label이 PromQL에 포함됐습니다: ${expression}`);
  requireCondition(
    !/\/\s*clamp_min\s*\(/u.test(expression),
    `비율 또는 평균 분모의 clamp_min은 저트래픽 값을 왜곡합니다: ${expression}`
  );
  assertBalancedPromql(expression);
  for (const metric of metricNames(expression)) {
    const frameworkMetric = FRAMEWORK_METRIC_PREFIXES.some(prefix =>
      prefix === 'up' ? metric === 'up' : metric.startsWith(prefix)
    );
    requireCondition(
      frameworkMetric || knownApplicationMetrics.has(metric),
      `실행 코드에서 확인되지 않은 metric을 참조합니다: ${metric}`
    );
  }
}

export function validateDashboard(dashboard, knownApplicationMetrics = new Set()) {
  requireCondition(dashboard?.uid === 'placepick-runtime', 'Grafana dashboard uid가 placepick-runtime이어야 합니다.');
  requireCondition(dashboard?.editable === false, '운영 dashboard는 editable=false여야 합니다.');
  const panels = allPanels(dashboard.panels ?? []);
  const rows = panels.filter(panel => panel.type === 'row');
  requireCondition(rows.length === 7, `Grafana dashboard row는 정확히 7개여야 합니다. 현재 ${rows.length}개입니다.`);
  requireCondition(
    JSON.stringify(rows.map(row => row.title)) === JSON.stringify(REQUIRED_ROW_TITLES),
    'Grafana dashboard row 제목 또는 순서가 운영 기준과 다릅니다.'
  );
  const ids = panels.map(panel => panel.id);
  requireCondition(ids.every(Number.isInteger), '모든 Grafana panel에는 정수 id가 필요합니다.');
  requireCondition(new Set(ids).size === ids.length, 'Grafana panel id가 중복됐습니다.');
  const expressions = expressionsFromDashboard(dashboard);
  requireCondition(expressions.length >= 20, '7개 운영 영역에는 최소 20개의 query가 필요합니다.');
  expressions.forEach(expression => validatePromql(expression, knownApplicationMetrics));
}

export function validateRequiredOperationalQueries(dashboard) {
  const queriedMetrics = new Set(expressionsFromDashboard(dashboard).flatMap(metricNames));
  for (const metric of REQUIRED_OPERATIONAL_QUERY_METRICS) {
    requireCondition(
      queriedMetrics.has(metric),
      `운영 dashboard에서 필수 freshness 또는 lifecycle metric이 빠졌습니다: ${metric}`
    );
  }
}

export function validateAlerts(alerts, knownApplicationMetrics = new Set()) {
  const rules = rulesFromAlerts(alerts);
  const names = new Set(rules.map(rule => rule.alert));
  for (const name of REQUIRED_ALERTS) {
    requireCondition(names.has(name), `필수 운영 alert가 없습니다: ${name}`);
  }
  requireCondition(names.size === rules.length, 'Prometheus alert 이름이 중복됐습니다.');
  for (const rule of rules) {
    requireCondition(rule.annotations?.runbook === 'RUN-0007', `${rule.alert}에 RUN-0007 연결이 없습니다.`);
    validatePromql(String(rule.expr), knownApplicationMetrics);
    if (VOLUME_GATED_ALERTS.has(rule.alert)) {
      requireCondition(rule.labels?.sample_gate === '20', `${rule.alert}의 최소 표본 label은 20이어야 합니다.`);
      requireCondition(/>=\s*20\b/u.test(String(rule.expr)), `${rule.alert}에 최소 20표본 PromQL gate가 없습니다.`);
    }
  }
}

export function validateRepository(rootDirectory) {
  const metrics = collectApplicationMetricNames(rootDirectory);
  const dashboardPath = path.join(rootDirectory, 'observability', 'grafana', 'dashboards', 'placepick-runtime.json');
  const alertsPath = path.join(rootDirectory, 'observability', 'prometheus', 'placepick-alerts.yml');
  const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
  const alerts = YAML.parse(fs.readFileSync(alertsPath, 'utf8'));
  validateDashboard(dashboard, metrics);
  validateRequiredOperationalQueries(dashboard);
  validateAlerts(alerts, metrics);
  return {
    applicationMetrics: metrics.size,
    dashboardQueries: expressionsFromDashboard(dashboard).length,
    alerts: rulesFromAlerts(alerts).length,
    rows: allPanels(dashboard.panels ?? []).filter(panel => panel.type === 'row').length
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  try {
    const result = validateRepository(root);
    const outputIndex = process.argv.indexOf('--promtool-rules');
    if (outputIndex >= 0) {
      const outputPath = process.argv[outputIndex + 1];
      requireCondition(outputPath, '--promtool-rules에는 출력 경로가 필요합니다.');
      const dashboardPath = path.join(
        root,
        'observability',
        'grafana',
        'dashboards',
        'placepick-runtime.json'
      );
      const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
      fs.writeFileSync(outputPath, YAML.stringify(dashboardQueryRules(dashboard)), {
        encoding: 'utf8',
        mode: 0o600
      });
    }
    process.stdout.write(
      `observability validation passed: rows=${result.rows} queries=${result.dashboardQueries} alerts=${result.alerts} applicationMetricVariants=${result.applicationMetrics}\n`
    );
  } catch (error) {
    process.stderr.write(`observability validation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

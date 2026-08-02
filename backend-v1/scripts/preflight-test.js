#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 *  ZOKASCORE BACKEND — PRE-DEPLOYMENT PREFLIGHT TEST
 *  Run: node scripts/preflight-test.js
 *
 *  - Read-only against Firebase (safe for production data)
 *  - Local vote test is backed up and restored automatically
 *  - Starts server on test port 3098 (does NOT touch live port)
 *  - Exit code 0 = GO, 1 = NO-GO
 * ═══════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = Number(process.env.TEST_PORT || 3098);
const BASE = `http://127.0.0.1:${TEST_PORT}`;

let passed = 0;
let failed = 0;
let warnings = 0;
const failures = [];

const ok = (name, extra = '') => {
  passed++;
  console.log(`  PASS  ${name}${extra ? '  (' + extra + ')' : ''}`);
};

const fail = (name, reason) => {
  failed++;
  failures.push({ name, reason });
  console.log(`  FAIL  ${name}  ->  ${reason}`);
};

const warn = (name, reason) => {
  warnings++;
  console.log(`  WARN  ${name}  ->  ${reason}`);
};

const section = (title) => {
  console.log(`\n=== ${title} ${'='.repeat(Math.max(0, 60 - title.length))}`);
};

const today = () => new Date().toISOString().split('T')[0];

/* ─────────────────────────────────────────────
   SECTION 1 — FILE STRUCTURE
───────────────────────────────────────────── */

const REQUIRED_FILES = [
  'package.json',
  'ecosystem.config.js',
  '.env',
  'src/index.js',
  'src/server.js',
  'src/config/env.js',
  'src/config/constants.js',
  'src/config/firebase.js',
  'src/config/leagues.js',
  'src/middleware/adminAuth.js',
  'src/middleware/auditLogger.js',
  'src/middleware/errorHandler.js',
  'src/middleware/firebaseAuth.js',
  'src/middleware/metricsTracker.js',
  'src/middleware/requestContext.js',
  'src/middleware/securityHeaders.js',
  'src/middleware/simpleRateLimit.js',
  'src/cache/CacheKey.js',
  'src/cache/FirestoreCache.js',
  'src/cache/MemoryCache.js',
  'src/utils/ApiError.js',
  'src/utils/ApiResponse.js',
  'src/utils/atomicWriter.js',
  'src/utils/circuitBreaker.js',
  'src/utils/compare.js',
  'src/utils/eventBus.js',
  'src/utils/logger.js',
  'src/utils/logStore.js',
  'src/utils/retry.js',
  'src/utils/RetryEngine.js',
  'src/utils/teamMatcher.js',
  'src/models/index.js',
  'src/models/League.js',
  'src/models/Match.js',
  'src/models/Odds.js',
  'src/models/Player.js',
  'src/models/Prediction.js',
  'src/models/Standing.js',
  'src/models/Team.js',
  'src/normalisers/index.js',
  'src/normalisers/apiFootballNormaliser.js',
  'src/normalisers/footballDataNormaliser.js',
  'src/normalisers/isportsNormaliser.js',
  'src/normalisers/sportsDbNormaliser.js',
  'src/providers/ApiFootballAdapter.js',
  'src/providers/BaseProvider.js',
  'src/providers/FootballDataAdapter.js',
  'src/providers/IsportsAdapter.js',
  'src/providers/ProviderFactory.js',
  'src/providers/ProviderManager.js',
  'src/providers/SportScoreAdapter.js',
  'src/providers/SportsDbAdapter.js',
  'src/repositories/LocalSnapshotRepository.js',
  'src/repositories/MatchDetailsRepository.js',
  'src/repositories/SnapshotRepository.js',
  'src/repositories/StandingsRepository.js',
  'src/repositories/TeamRepository.js',
  'src/repositories/VideoRepository.js',
  'src/services/ContentMigrationService.js',
  'src/services/FeaturedStore.js',
  'src/services/FixtureService.js',
  'src/services/InternetMonitor.js',
  'src/services/LeaderboardEngine.js',
  'src/services/LiveMatchService.js',
  'src/services/MatchDetailsService.js',
  'src/services/PredictionStore.js',
  'src/services/PriorityEngine.js',
  'src/services/QueueService.js',
  'src/services/QuotaManager.js',
  'src/services/RankingEngine.js',
  'src/services/RecoveryService.js',
  'src/services/SmartMatchEngine.js',
  'src/services/SnapshotService.js',
  'src/services/StandingsService.js',
  'src/services/StaticFilePublisher.js',
  'src/services/UnifiedFixtureService.js',
  'src/services/UserPredictionStore.js',
  'src/services/ZokaPicksStore.js',
  'src/modules/live/LiveSyncEngine.js',
  'src/routes/v1/featured.js',
  'src/routes/v1/health.js',
  'src/routes/v1/leaderboard.js',
  'src/routes/v1/leagues.js',
  'src/routes/v1/match.js',
  'src/routes/v1/matches.js',
  'src/routes/v1/predictions.js',
  'src/routes/v1/queue.js',
  'src/routes/v1/sitemap.js',
  'src/routes/v1/standings.js',
  'src/routes/v1/teams.js',
  'src/routes/v1/zokaPicks.js',
  'src/routes/v1/admin/leaderboards.js',
  'src/routes/v1/admin/schedulers.js',
  'src/routes/v1/monitoring/dashboard.js',
  'src/scheduler/index.js',
  'src/scheduler/SchedulerEngine.js',
  'src/scheduler/metrics/JobMetrics.js',
  'src/scheduler/jobs/finishedFixturesJob.js',
  'src/scheduler/jobs/liveJob.js',
  'src/scheduler/jobs/resolvePredictionsJob.js',
  'src/scheduler/jobs/standingsJob.js',
  'src/scheduler/jobs/todayFixturesJob.js',
  'src/scheduler/jobs/upcomingFixturesJob.js',
  'src/scheduler/jobs/userPredictionSyncJob.js',
  'src/scheduler/jobs/videosJob.js',
];

const FORBIDDEN_FILES = [
  'src/providers/LiveSyncService.js',
  'src/services/LiveSyncService.js',
  'firebase-adminsdk.json',
];

section('1. FILE STRUCTURE');

for (const file of REQUIRED_FILES) {
  const fullPath = path.join(ROOT, file);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    if (stats.size === 0) fail(`exists: ${file}`, 'file is EMPTY (0 bytes)');
    else ok(`exists: ${file}`);
  } else {
    fail(`exists: ${file}`, 'missing');
  }
}

for (const file of FORBIDDEN_FILES) {
  const fullPath = path.join(ROOT, file);
  if (fs.existsSync(fullPath)) {
    fail(`deleted: ${file}`, 'should have been removed');
  } else {
    ok(`deleted: ${file}`);
  }
}

/* ─────────────────────────────────────────────
   SECTION 2 — MODULE LOAD (syntax + requires)
───────────────────────────────────────────── */

section('2. MODULE LOAD (syntax check)');

let loadFailed = false;

for (const file of REQUIRED_FILES) {
  if (!file.endsWith('.js')) continue;

  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) continue;

  try {
    require(fullPath);
    ok(`require: ${file}`);
  } catch (err) {
    fail(`require: ${file}`, err.message.split('\n')[0]);
    loadFailed = true;
  }
}

if (loadFailed) {
  console.log('\nModule load failed. Fix the errors above before continuing.');
  process.exit(1);
}

/* ─────────────────────────────────────────────
   SECTION 3 — ENV + FIREBASE + DATA INTEGRITY
───────────────────────────────────────────── */

section('3. ENV + FIREBASE + DATA INTEGRITY');

const env = require(path.join(ROOT, 'src/config/env'));

const REQUIRED_ENV = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'ADMIN_API_KEY',
];

for (const key of REQUIRED_ENV) {
  if (env[key]) ok(`env: ${key}`);
  else fail(`env: ${key}`, 'missing in .env');
}

if (env.ADMIN_API_KEY === 'dev-admin-key') {
  warn('env: ADMIN_API_KEY', 'still using default dev key');
}

if (!env.ISPORTS_API_KEY) warn('env: ISPORTS_API_KEY', 'missing (live scores degraded)');
if (!env.API_FOOTBALL_KEY) warn('env: API_FOOTBALL_KEY', 'missing (fallback provider only)');

async function testFirebase() {
  try {
    const { initializeFirebase, getDb } = require(path.join(ROOT, 'src/config/firebase'));
    initializeFirebase();
    const snap = await getDb().collection('users').limit(1).get();
    ok('firebase: connect + read', `${snap.size} doc(s)`);
    return true;
  } catch (err) {
    fail('firebase: connect + read', err.message);
    return false;
  }
}

function testJsonFile(relPath, required = true) {
  const fullPath = path.join(ROOT, relPath);

  if (!fs.existsSync(fullPath)) {
    if (required) warn(`json: ${relPath}`, 'missing (will be created at runtime)');
    return;
  }

  try {
    JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    ok(`json: ${relPath}`);
  } catch (err) {
    fail(`json: ${relPath}`, 'corrupted: ' + err.message.slice(0, 60));
  }
}

testJsonFile('public_data/live.json', false);
testJsonFile('public_data/predictions.json', false);
testJsonFile('public_data/standings.json', false);
testJsonFile(`public_data/fixtures/${today()}.json`, false);
testJsonFile('data/queue/pending.json', false);
testJsonFile('data/queue/dead-letter.json', false);
testJsonFile('data/queue/state.json', false);

/* ─────────────────────────────────────────────
   SECTION 4 — HTTP ENDPOINT TESTS
───────────────────────────────────────────── */

async function http(method, urlPath, { body, admin = false } = {}) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(admin ? { 'x-admin-api-key': env.ADMIN_API_KEY } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  return { status: res.status, json, text, headers: res.headers };
}

async function runHttpTests() {
  const d = today();

  section('4. PUBLIC READ ENDPOINTS');

  let r = await http('GET', '/api/v1/health');
  r.status === 200 && r.json?.status
    ? ok('GET /api/v1/health', r.json.status)
    : fail('GET /api/v1/health', `status ${r.status}`);

  const securityHeader = r.headers.get('x-content-type-options');
  securityHeader === 'nosniff'
    ? ok('security headers present')
    : warn('security headers', 'x-content-type-options missing');

  r = await http('GET', '/api/v1/leagues');
  r.status === 200 && Array.isArray(r.json?.data)
    ? ok('GET /api/v1/leagues', `${r.json.data.length} leagues`)
    : fail('GET /api/v1/leagues', `status ${r.status}`);

  r = await http('GET', '/api/v1/standings');
  r.status === 200
    ? ok('GET /api/v1/standings')
    : fail('GET /api/v1/standings', `status ${r.status}`);

  r = await http('GET', '/api/v1/standings?league=39');
  [200, 404].includes(r.status)
    ? ok('GET /api/v1/standings?league=39', `status ${r.status}`)
    : fail('GET /api/v1/standings?league=39', `status ${r.status}`);

  r = await http('GET', `/api/v1/featured?date=${d}`);
  r.status === 200
    ? ok('GET /api/v1/featured', `${(r.json?.matches || r.json?.data || []).length} matches`)
    : fail('GET /api/v1/featured', `status ${r.status}`);

  r = await http('GET', '/api/v1/featured');
  r.status === 400
    ? ok('GET /api/v1/featured (no date) rejected', '400')
    : fail('GET /api/v1/featured (no date)', `expected 400, got ${r.status}`);

  r = await http('GET', `/api/v1/zoka-picks?date=${d}`);
  r.status === 200
    ? ok('GET /api/v1/zoka-picks', r.json?.published ? 'published' : 'empty')
    : fail('GET /api/v1/zoka-picks', `status ${r.status}`);

  r = await http('GET', `/api/v1/leaderboard/daily/${d}`);
  r.status === 200
    ? ok('GET /api/v1/leaderboard/daily')
    : fail('GET /api/v1/leaderboard/daily', `status ${r.status}`);

  r = await http('GET', '/api/v1/leaderboard/summary/goat');
  r.status === 200
    ? ok('GET /api/v1/leaderboard/summary/goat')
    : fail('GET /api/v1/leaderboard/summary/goat', `status ${r.status}`);

  r = await http('GET', '/api/v1/matches?view=home');
  r.status === 200
    ? ok('GET /api/v1/matches?view=home')
    : fail('GET /api/v1/matches?view=home', `status ${r.status}`);

  r = await http('GET', '/api/v1/teams?league=39');
  [200, 404].includes(r.status)
    ? ok('GET /api/v1/teams?league=39', `status ${r.status}`)
    : fail('GET /api/v1/teams?league=39', `status ${r.status} (must not be 500)`);

  r = await http('GET', '/api/v1/match/h2h');
  r.status === 400
    ? ok('GET /api/v1/match/h2h (missing params) rejected', '400')
    : fail('GET /api/v1/match/h2h', `expected 400, got ${r.status}`);

  r = await http('GET', '/api/v1/data/live.json');
  r.status === 200
    ? ok('GET /api/v1/data/live.json')
    : warn('GET /api/v1/data/live.json', `status ${r.status} (no live snapshot yet)`);

  r = await http('GET', '/api/v1/data/predictions.json');
  r.status === 200
    ? ok('GET /api/v1/data/predictions.json')
    : warn('GET /api/v1/data/predictions.json', `status ${r.status}`);

  r = await http('GET', '/zokascore-sitemap.xml');
  r.status === 200 && r.text.includes('<urlset')
    ? ok('GET /zokascore-sitemap.xml')
    : fail('GET /zokascore-sitemap.xml', `status ${r.status}`);

  r = await http('GET', '/api/v1/does-not-exist');
  r.status === 404 && r.json?.success === false
    ? ok('404 handler returns standard JSON')
    : fail('404 handler', `status ${r.status}`);

  section('5. MATCH-OF-THE-DAY VOTES (backup + restore)');

  const predictionsFile = path.join(ROOT, 'public_data', 'predictions.json');
  const receiptFile = path.join(ROOT, 'data', 'predictions', 'receipts', '__preflight_test__.json');
  const predictionsBackup = fs.existsSync(predictionsFile)
    ? fs.readFileSync(predictionsFile, 'utf8')
    : null;
  const receiptExisted = fs.existsSync(receiptFile);

  try {
    r = await http('POST', '/api/v1/predictions/vote', {
      body: { matchId: '__preflight_test__', choice: 'home', voterId: 'preflight_voter_1' },
    });
    r.status === 200 && r.json?.success === true
      ? ok('POST vote (new)', r.json?.status)
      : fail('POST vote (new)', `status ${r.status}`);

    r = await http('POST', '/api/v1/predictions/vote', {
      body: { matchId: '__preflight_test__', choice: 'home', voterId: 'preflight_voter_1' },
    });
    r.status === 200 && r.json?.status === 'duplicate'
      ? ok('POST vote (duplicate blocked)', 'duplicate')
      : fail('POST vote (duplicate)', `got status ${r.json?.status}`);

    r = await http('POST', '/api/v1/predictions/vote', {
      body: { matchId: '__preflight_test__', choice: 'away', voterId: 'preflight_voter_1' },
    });
    r.status === 200 && r.json?.status === 'changed'
      ? ok('POST vote (change handled)', 'changed')
      : fail('POST vote (change)', `got status ${r.json?.status}`);

    r = await http('GET', '/api/v1/predictions/__preflight_test__');
    r.status === 200 && r.json?.totalVotes === 1
      ? ok('vote totals correct after change', 'totalVotes=1')
      : fail('vote totals', `totalVotes=${r.json?.totalVotes}`);

    r = await http('POST', '/api/v1/predictions/vote', {
      body: { matchId: '__preflight_test__', choice: 'invalid' },
    });
    r.status === 400
      ? ok('POST vote (invalid choice) rejected', '400')
      : fail('POST vote (invalid)', `expected 400, got ${r.status}`);
  } finally {
    // Restore original state
    if (predictionsBackup !== null) fs.writeFileSync(predictionsFile, predictionsBackup);
    if (!receiptExisted && fs.existsSync(receiptFile)) fs.unlinkSync(receiptFile);
    ok('vote test data restored');
  }

  section('6. AUTH PROTECTION');

  r = await http('GET', `/api/v1/predictions/user?date=${d}`);
  r.status === 401 ? ok('predictions/user requires auth') : fail('predictions/user auth', `got ${r.status}`);

  r = await http('POST', '/api/v1/predictions/user', { body: { matchId: 'x', homeScore: 1, awayScore: 1, matchDate: d } });
  r.status === 401 ? ok('POST predictions/user requires auth') : fail('POST predictions/user auth', `got ${r.status}`);

  r = await http('POST', '/api/v1/queue/add', { body: { collection: 'users', docId: 'x', data: { a: 1 } } });
  [503, 403].includes(r.status)
    ? ok('queue/add blocked without auth', `status ${r.status}`)
    : fail('queue/add auth', `got ${r.status}`);

  r = await http('GET', '/api/v1/queue/stats');
  r.status === 401 ? ok('queue/stats requires admin') : fail('queue/stats auth', `got ${r.status}`);

  r = await http('GET', '/api/v1/monitoring/metrics');
  r.status === 401 ? ok('monitoring/metrics requires admin') : fail('monitoring/metrics auth', `got ${r.status}`);

  r = await http('GET', '/api/v1/monitoring/logs');
  r.status === 401 ? ok('monitoring/logs requires admin') : fail('monitoring/logs auth', `got ${r.status}`);

  r = await http('GET', '/api/v1/admin/schedulers/metrics');
  r.status === 401 ? ok('admin/schedulers requires admin') : fail('admin/schedulers auth', `got ${r.status}`);

  r = await http('POST', '/api/v1/admin/leaderboards/rebuild/daily', { body: { dateStr: d } });
  r.status === 401 ? ok('admin/leaderboards requires admin') : fail('admin/leaderboards auth', `got ${r.status}`);

  r = await http('POST', '/api/v1/featured/admin/add', { body: { date: d, match: {} } });
  r.status === 401 ? ok('featured/admin requires admin') : fail('featured/admin auth', `got ${r.status}`);

  r = await http('POST', '/api/v1/zoka-picks/admin/publish', { body: { date: d } });
  r.status === 401 ? ok('zoka-picks/admin requires admin') : fail('zoka-picks/admin auth', `got ${r.status}`);

  section('7. ADMIN ACCESS (with key)');

  r = await http('GET', '/api/v1/queue/stats', { admin: true });
  r.status === 200 && r.json?.success === true
    ? ok('queue/stats with admin key', `pending=${r.json?.data?.pending}`)
    : fail('queue/stats admin', `status ${r.status}`);

  r = await http('GET', '/api/v1/queue/pending', { admin: true });
  r.status === 200 ? ok('queue/pending with admin key') : fail('queue/pending admin', `status ${r.status}`);

  r = await http('GET', '/api/v1/monitoring/metrics', { admin: true });
  r.status === 200
    ? ok('monitoring/metrics with admin key')
    : fail('monitoring/metrics admin', `status ${r.status}`);

  r = await http('GET', '/api/v1/monitoring/logs', { admin: true });
  r.status === 200 ? ok('monitoring/logs with admin key') : fail('monitoring/logs admin', `status ${r.status}`);

  r = await http('GET', '/api/v1/admin/schedulers/metrics', { admin: true });
  r.status === 200 ? ok('admin/schedulers with admin key') : fail('admin/schedulers admin', `status ${r.status}`);

  r = await http('GET', '/api/v1/monitoring');
  r.status === 200 && r.json?.memoryCache
    ? ok('public monitoring root (frontend compat)', `cacheHits=${r.json.memoryCache.hits ?? 0}`)
    : fail('public monitoring root', `status ${r.status}`);

  const auditFile = path.join(ROOT, 'logs', 'audit.log');
  fs.existsSync(auditFile)
    ? ok('audit.log created by admin requests')
    : warn('audit.log', 'not found (check logs directory permissions)');
}

/* ─────────────────────────────────────────────
   BOOT + RUN
───────────────────────────────────────────── */

async function main() {
  console.log('ZOKASCORE BACKEND PREFLIGHT');
  console.log(`Test port: ${TEST_PORT} (live port untouched)`);

  const firebaseOk = await testFirebase();

  section('BOOT TEST SERVER');

  let server;

  try {
    const app = require(path.join(ROOT, 'src/server'));

    server = await new Promise((resolve, reject) => {
      const s = app.listen(TEST_PORT, () => resolve(s));
      s.on('error', reject);
      setTimeout(() => reject(new Error('Server boot timeout (10s)')), 10000);
    });

    ok('server boots and listens', `port ${TEST_PORT}`);
  } catch (err) {
    fail('server boot', err.message);
    console.log('\nRESULT: NO-GO (server cannot boot)');
    process.exit(1);
  }

  try {
    await runHttpTests();
  } catch (err) {
    fail('http test suite', err.message);
  } finally {
    server.close();
  }

  if (!firebaseOk) {
    warn('firebase', 'failed earlier — queue sync will retry at runtime');
  }

  section('RESULT');

  console.log(`  Passed:   ${passed}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Warnings: ${warnings}`);

  if (failures.length > 0) {
    console.log('\n  Failed tests:');
    failures.forEach((f) => console.log(`   - ${f.name}: ${f.reason}`));
  }

  if (failed === 0) {
    console.log('\n  >>> GO — Backend is ready for restart and deployment <<<\n');
    process.exit(0);
  } else {
    console.log('\n  >>> NO-GO — Fix the failures above before deploying <<<\n');
    process.exit(1);
  }
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

main();
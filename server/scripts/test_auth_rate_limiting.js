/**
 * Comprehensive Integration Test Suite for Public Authentication Rate Limiting
 *
 * Tests:
 * 1. POST /api/auth/login rate limiting (10 attempts max / 15 min per IP)
 * 2. POST /api/auth/register rate limiting (5 attempts max / 15 min per IP)
 * 3. POST /api/auth/forgot-password rate limiting (5 requests max / 15 min per IP)
 * 4. POST /api/auth/reset-password rate limiting (5 requests max / 15 min per IP)
 * 5. Headers: Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining compliance
 * 6. Error format: standard { error: message } matching API conventions
 * 7. Admin / Authenticated isolation: admin routes and authenticated /me endpoints are untouched
 *
 * Usage: node server/scripts/test_auth_rate_limiting.js
 */

import assert from 'assert';
import http from 'http';
import { app } from '../app.js';
import { _resetRateLimits } from '../middleware/rateLimiter.js';
import { signAccessToken } from '../services/token.service.js';

let passed = 0;
let failed = 0;
let server;
let baseUrl = '';

function logPass(name) {
  console.log(`  ✓ ${name}`);
  passed++;
}

function logFail(name, err) {
  console.error(`  ✗ ${name}`);
  console.error(`    ${err.message}`);
  failed++;
}

async function makeRequest({ method = 'GET', path = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(path, baseUrl);
    const serializedBody = body && typeof body === 'object' ? JSON.stringify(body) : body;
    const reqHeaders = {
      ...headers,
      ...(serializedBody ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(serializedBody) } : {}),
    };

    const req = http.request(
      parsedUrl,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsedData = null;
          try {
            parsedData = data ? JSON.parse(data) : null;
          } catch {
            parsedData = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsedData });
        });
      }
    );
    req.on('error', reject);
    if (serializedBody) req.write(serializedBody);
    req.end();
  });
}

async function runSuite() {
  console.log('\n======================================================');
  console.log('--- PUBLIC AUTHENTICATION RATE LIMITING TEST SUITE ---');
  console.log('======================================================\n');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------
    // SECTION 1: CUSTOMER LOGIN RATE LIMITING (10 requests / 15 min)
    // -------------------------------------------------------------
    console.log('--- 1. POST /api/auth/login RATE LIMITING ---');
    _resetRateLimits();

    // Requests 1 through 10 should pass rate limiter (reach controller -> return 400 or 401 for invalid input/credentials)
    for (let i = 1; i <= 10; i++) {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/auth/login',
        body: { identifier: 'nobody@example.com', password: `badpassword${i}` },
      });
      assert.notStrictEqual(res.status, 429, `Attempt ${i} must not be rate limited`);
      assert.strictEqual(res.headers['x-ratelimit-limit'], '10');
      assert.strictEqual(res.headers['x-ratelimit-remaining'], String(10 - i));
    }
    logPass('Attempts 1-10 pass limiter with correct X-RateLimit headers');

    // 11th request must be blocked with 429
    const blockedLogin = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { identifier: 'nobody@example.com', password: 'badpassword11' },
    });
    assert.strictEqual(blockedLogin.status, 429, '11th attempt must return HTTP 429');
    assert.ok(blockedLogin.headers['retry-after'], 'Retry-After header must be present on 429 response');
    assert.strictEqual(blockedLogin.headers['x-ratelimit-remaining'], '0');
    assert.ok(blockedLogin.data?.error?.includes('Trop de tentatives de connexion'), 'Error message matches French localization');
    logPass('11th attempt is blocked with HTTP 429, Retry-After header, and localized error');

    // -------------------------------------------------------------
    // SECTION 2: CUSTOMER REGISTER RATE LIMITING (5 requests / 15 min)
    // -------------------------------------------------------------
    console.log('\n--- 2. POST /api/auth/register RATE LIMITING ---');
    _resetRateLimits();

    for (let i = 1; i <= 5; i++) {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/auth/register',
        body: { email: `bot${i}@example.com`, password: 'short' }, // will fail validation with 400
      });
      assert.notStrictEqual(res.status, 429, `Register attempt ${i} must not be rate limited`);
      assert.strictEqual(res.headers['x-ratelimit-limit'], '5');
      assert.strictEqual(res.headers['x-ratelimit-remaining'], String(5 - i));
    }
    logPass('Register attempts 1-5 pass limiter with correct headers');

    // 6th request must be blocked with 429
    const blockedRegister = await makeRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: { email: 'bot6@example.com', password: 'short' },
    });
    assert.strictEqual(blockedRegister.status, 429, '6th register attempt must return HTTP 429');
    assert.ok(blockedRegister.headers['retry-after']);
    assert.strictEqual(blockedRegister.headers['x-ratelimit-remaining'], '0');
    assert.ok(blockedRegister.data?.error?.includes('création de compte'));
    logPass('6th register attempt is blocked with HTTP 429 and Retry-After');

    // -------------------------------------------------------------
    // SECTION 3: FORGOT PASSWORD RATE LIMITING (5 requests / 15 min)
    // -------------------------------------------------------------
    console.log('\n--- 3. POST /api/auth/forgot-password RATE LIMITING ---');
    _resetRateLimits();

    for (let i = 1; i <= 5; i++) {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/auth/forgot-password',
        body: { email: `user${i}@example.com` },
      });
      assert.notStrictEqual(res.status, 429, `Forgot-password request ${i} must not be rate limited`);
      assert.strictEqual(res.headers['x-ratelimit-limit'], '5');
      assert.strictEqual(res.headers['x-ratelimit-remaining'], String(5 - i));
    }
    logPass('Forgot-password requests 1-5 pass limiter');

    // 6th request must be blocked with 429
    const blockedForgot = await makeRequest({
      method: 'POST',
      path: '/api/auth/forgot-password',
      body: { email: 'user6@example.com' },
    });
    assert.strictEqual(blockedForgot.status, 429, '6th forgot-password request must return HTTP 429');
    assert.ok(blockedForgot.headers['retry-after']);
    assert.strictEqual(blockedForgot.headers['x-ratelimit-remaining'], '0');
    assert.ok(blockedForgot.data?.error?.includes('réinitialisation de mot de passe'));
    logPass('6th forgot-password request is blocked with HTTP 429');

    // -------------------------------------------------------------
    // SECTION 4: RESET PASSWORD RATE LIMITING (5 requests / 15 min)
    // -------------------------------------------------------------
    console.log('\n--- 4. POST /api/auth/reset-password RATE LIMITING ---');
    _resetRateLimits();

    for (let i = 1; i <= 5; i++) {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/auth/reset-password',
        body: { token: `fake-token-${i}`, newPassword: 'NewPassword123!' },
      });
      assert.notStrictEqual(res.status, 429, `Reset-password request ${i} must not be rate limited`);
      assert.strictEqual(res.headers['x-ratelimit-limit'], '5');
    }
    logPass('Reset-password requests 1-5 pass limiter');

    const blockedReset = await makeRequest({
      method: 'POST',
      path: '/api/auth/reset-password',
      body: { token: 'fake-token-6', newPassword: 'NewPassword123!' },
    });
    assert.strictEqual(blockedReset.status, 429, '6th reset-password request must return HTTP 429');
    assert.ok(blockedReset.headers['retry-after']);
    logPass('6th reset-password request is blocked with HTTP 429');

    // -------------------------------------------------------------
    // SECTION 5: AUTHENTICATED & ADMIN ROUTE ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- 5. AUTHENTICATED & ADMIN ROUTE ISOLATION ---');
    _resetRateLimits();

    // Generate valid JWT for a customer
    const mockUser = {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      email: 'customer@example.com',
      role: 'customer',
    };
    const userToken = signAccessToken(mockUser);

    // Call authenticated endpoint GET /api/auth/me repeatedly (12 times)
    // Public customer login limiter has limit of 10, but /api/auth/me should NEVER be limited by authLoginLimiter!
    let allMePassed = true;
    for (let i = 1; i <= 12; i++) {
      const res = await makeRequest({
        method: 'GET',
        path: '/api/auth/me',
        headers: { Authorization: `Bearer ${userToken}` },
      });
      // It should NOT be 429 (might be 404/200 depending on whether user exists in DB, but never 429)
      if (res.status === 429) {
        allMePassed = false;
        break;
      }
    }
    assert.ok(allMePassed, 'Authenticated GET /api/auth/me is not subject to public auth rate limiter');
    logPass('Authenticated route /api/auth/me operates without public login rate limit interference');

    // Admin login (/api/admin/login) uses independent adminLoginLimiter (limit: 5)
    _resetRateLimits();
    for (let i = 1; i <= 5; i++) {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/admin/login',
        body: { password: 'wrong-admin-password' },
      });
      assert.notStrictEqual(res.status, 429, `Admin login attempt ${i} must not be 429`);
      assert.strictEqual(res.headers['x-ratelimit-limit'], '5');
    }
    const blockedAdminLogin = await makeRequest({
      method: 'POST',
      path: '/api/admin/login',
      body: { password: 'wrong-admin-password' },
    });
    assert.strictEqual(blockedAdminLogin.status, 429, '6th admin login attempt is blocked by adminLoginLimiter');
    assert.ok(blockedAdminLogin.data?.error?.includes('administrateur'));
    logPass('Admin login is governed by independent adminLoginLimiter (limit: 5)');

  } catch (err) {
    logFail('Test suite execution error', err);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('\n======================================================');
    console.log(`AUTH RATE LIMITING TEST SUMMARY: ${passed} passed, ${failed} failed`);
    console.log('======================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runSuite();

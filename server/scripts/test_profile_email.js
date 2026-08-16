/**
 * Verification test suite for Profile Email Management:
 * - Phone-only users adding email
 * - Email modification
 * - Email clearing prevention
 * - Format validation & 409 conflict checks
 * - Persistence & /auth/me integration
 *
 * Usage: node server/scripts/test_profile_email.js
 */
import http from 'http';
import { app } from '../app.js';
import { userRepository } from '../repositories/user.repository.js';

let passed = 0;
let failed = 0;
let server;
let BASE = '';

function assert(condition, message) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${message}`);
    failed++;
  }
}

async function request(endpoint, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: res.status, data, headers: res.headers };
}

async function runTests() {
  console.log('=== Starting Profile Email Management Verification Tests ===\n');

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      BASE = `http://127.0.0.1:${port}/api`;
      console.log(`Test server running on ${BASE}\n`);
      resolve();
    });
  });

  try {
    const ts = Date.now();
    const phone1 = String(20000000 + Math.floor(Math.random() * 70000000)).slice(0, 8);
    const phone2 = String(30000000 + Math.floor(Math.random() * 70000000)).slice(0, 8);
    const existingEmailUser = `existing_${ts}@example.com`;

    // ----------------------------------------------------
    // Step 0: Setup existing email user (User 1)
    // ----------------------------------------------------
    console.log('--- Step 0: Register standard email-based user ---');
    const user1Reg = await request('/auth/register', {
      method: 'POST',
      body: {
        email: existingEmailUser,
        password: 'Password123!',
        fullName: 'User One Existing Email',
      },
    });
    assert(user1Reg.status === 201, `User 1 registered with email (${existingEmailUser})`);
    const user1Token = user1Reg.data.token;
    const user1Id = user1Reg.data.user.id;

    // ----------------------------------------------------
    // Step 1: Register phone-only user (User 2)
    // ----------------------------------------------------
    console.log('\n--- Step 1: Register phone-only user ---');
    const user2Reg = await request('/auth/register', {
      method: 'POST',
      body: {
        identifier: phone1,
        password: 'Password123!',
        fullName: 'User Two Phone Only',
      },
    });
    assert(user2Reg.status === 201, `User 2 registered with phone only (${phone1})`);
    assert(user2Reg.data.user.email === null, 'User 2 has null email on registration');
    const user2Token = user2Reg.data.token;
    const user2Id = user2Reg.data.user.id;

    // ----------------------------------------------------
    // Step 2: Unauthenticated PATCH /auth/me rejected
    // ----------------------------------------------------
    console.log('\n--- Step 2: Unauthenticated Profile Update ---');
    const unauthRes = await request('/auth/me', {
      method: 'PATCH',
      body: { fullName: 'Hacker Name' },
    });
    assert(unauthRes.status === 401, `Unauthenticated PATCH /auth/me rejected with 401 (Got: ${unauthRes.status})`);

    // ----------------------------------------------------
    // Step 3: Phone-only user updates profile without adding email
    // ----------------------------------------------------
    console.log('\n--- Step 3: Phone-only user updates name/phone (email remains null) ---');
    const updateNameRes = await request('/auth/me', {
      method: 'PATCH',
      token: user2Token,
      body: {
        fullName: 'User Two Renamed',
        phoneNumber: phone1,
        email: null,
      },
    });
    assert(updateNameRes.status === 200, `Profile name update succeeds with 200 (Got: ${updateNameRes.status})`);
    assert(updateNameRes.data.user.fullName === 'User Two Renamed', 'Name correctly updated in response');
    assert(updateNameRes.data.user.email === null, 'Email remains null when empty');

    // ----------------------------------------------------
    // Step 4: Phone-only user tries invalid email format
    // ----------------------------------------------------
    console.log('\n--- Step 4: Invalid Email Format Rejection ---');
    const invalidEmailRes = await request('/auth/me', {
      method: 'PATCH',
      token: user2Token,
      body: {
        fullName: 'User Two Renamed',
        email: 'not-an-email-at-all',
      },
    });
    assert(invalidEmailRes.status === 400, `Invalid email rejected with 400 (Got: ${invalidEmailRes.status})`);
    assert(
      invalidEmailRes.data.error === 'Veuillez entrer une adresse e-mail valide.',
      `Error message matches site standard: "${invalidEmailRes.data.error}"`
    );

    // ----------------------------------------------------
    // Step 5: Phone-only user tries duplicate email belonging to User 1
    // ----------------------------------------------------
    console.log('\n--- Step 5: Duplicate Email Conflict (409) ---');
    const duplicateEmailRes = await request('/auth/me', {
      method: 'PATCH',
      token: user2Token,
      body: {
        fullName: 'User Two Renamed',
        email: existingEmailUser.toUpperCase(), // Test case insensitivity
      },
    });
    assert(duplicateEmailRes.status === 409, `Duplicate email rejected with 409 (Got: ${duplicateEmailRes.status})`);
    assert(
      duplicateEmailRes.data.error === 'Un compte avec cette adresse e-mail existe déjà',
      `Conflict error message: "${duplicateEmailRes.data.error}"`
    );

    // ----------------------------------------------------
    // Step 6: Phone-only user successfully adds a valid, unique email
    // ----------------------------------------------------
    console.log('\n--- Step 6: Phone-only user adds a valid unique email ---');
    const newEmailUser2 = `user2_new_${ts}@example.com`;
    const addEmailRes = await request('/auth/me', {
      method: 'PATCH',
      token: user2Token,
      body: {
        fullName: 'User Two With Email',
        phoneNumber: phone1,
        email: `  ${newEmailUser2}  `, // Test trim & lowercase
      },
    });
    assert(addEmailRes.status === 200, `Email added successfully with 200 (Got: ${addEmailRes.status})`);
    assert(addEmailRes.data.user.email === newEmailUser2, `Response contains normalized email: ${addEmailRes.data.user.email}`);

    // Verify in DB directly
    const user2InDb = await userRepository.findById(user2Id);
    assert(user2InDb.email === newEmailUser2, `PostgreSQL database row contains saved email: ${user2InDb.email}`);

    // Verify via GET /auth/me
    const getMeRes = await request('/auth/me', { token: user2Token });
    assert(getMeRes.status === 200, 'GET /auth/me returns 200');
    assert(getMeRes.data.user.email === newEmailUser2, `GET /auth/me reflects newly added email: ${getMeRes.data.user.email}`);

    // ----------------------------------------------------
    // Step 7: Existing-email user tries to remove/clear email (forbidden)
    // ----------------------------------------------------
    console.log('\n--- Step 7: Existing-email user CANNOT clear/remove email ---');
    const clearEmailRes = await request('/auth/me', {
      method: 'PATCH',
      token: user1Token,
      body: {
        fullName: 'User One Modified',
        email: '',
      },
    });
    assert(clearEmailRes.status === 400, `Clearing email rejected with 400 (Got: ${clearEmailRes.status})`);
    assert(
      clearEmailRes.data.error === "L'adresse e-mail est obligatoire.",
      `Error message matches expected: "${clearEmailRes.data.error}"`
    );

    // Verify User 1's email was not deleted in DB
    const user1InDb = await userRepository.findById(user1Id);
    assert(user1InDb.email === existingEmailUser, `User 1 email in DB remains intact: ${user1InDb.email}`);

    // ----------------------------------------------------
    // Step 8: Existing-email user replaces email with another valid unique email
    // ----------------------------------------------------
    console.log('\n--- Step 8: Existing-email user replaces email with new email ---');
    const replacedEmailUser1 = `user1_replaced_${ts}@example.com`;
    const replaceEmailRes = await request('/auth/me', {
      method: 'PATCH',
      token: user1Token,
      body: {
        fullName: 'User One Updated Email',
        email: replacedEmailUser1,
      },
    });
    assert(replaceEmailRes.status === 200, `Email replacement succeeded with 200 (Got: ${replaceEmailRes.status})`);
    assert(replaceEmailRes.data.user.email === replacedEmailUser1, `User 1 email updated to: ${replaceEmailRes.data.user.email}`);

    // ----------------------------------------------------
    // Step 9: Re-login works with newly added / updated email
    // ----------------------------------------------------
    console.log('\n--- Step 9: Login with newly added / updated email ---');
    const loginUser2 = await request('/auth/login', {
      method: 'POST',
      body: {
        identifier: newEmailUser2,
        password: 'Password123!',
      },
    });
    assert(loginUser2.status === 200, `User 2 can log in with newly added email (Got: ${loginUser2.status})`);
    assert(loginUser2.data.user.email === newEmailUser2, 'Logged in user object contains new email');

    const loginUser2Phone = await request('/auth/login', {
      method: 'POST',
      body: {
        identifier: phone1,
        password: 'Password123!',
      },
    });
    assert(loginUser2Phone.status === 200, `User 2 can still log in with original phone number (Got: ${loginUser2Phone.status})`);

    // ----------------------------------------------------
    // Step 10: Phone duplicate conflict on update
    // ----------------------------------------------------
    console.log('\n--- Step 10: Phone Number Duplicate Conflict (409) ---');
    const dupPhoneRes = await request('/auth/me', {
      method: 'PATCH',
      token: user1Token,
      body: {
        fullName: 'User One',
        email: replacedEmailUser1,
        phoneNumber: phone1, // Belongs to User 2
      },
    });
    assert(dupPhoneRes.status === 409, `Duplicate phone rejected with 409 (Got: ${dupPhoneRes.status})`);
    assert(
      dupPhoneRes.data.error === 'Un compte avec ce numéro de téléphone existe déjà',
      `Conflict error message: "${dupPhoneRes.data.error}"`
    );

    console.log(`\n=== Verification Results: ${passed} passed, ${failed} failed ===`);
  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    if (server) server.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();

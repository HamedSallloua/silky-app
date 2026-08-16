/**
 * Verification test suite for Contact Message Reply Status:
 * - New messages start as pending
 * - Successful reply transitions status to resolved in PostgreSQL
 * - Backend response includes { success, contactMessage: { status, repliedAt } }
 * - markAsResolved is conditional: does not overwrite existing repliedAt
 * - GET endpoints return current status and repliedAt
 *
 * Usage: node server/scripts/test_contact_status.js
 */
import http from "http";
import { app } from "../app.js";

let passed = 0;
let failed = 0;
let server;
let BASE = "";

function assert(condition, message) {
  if (condition) {
    console.log("PASS: " + message);
    passed++;
  } else {
    console.error("FAIL: " + message);
    failed++;
  }
}

async function request(endpoint, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;

  const res = await fetch(BASE + endpoint, {
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

  return { status: res.status, data };
}

async function runTests() {
  console.log("=== Starting Contact Message Reply Status Verification Tests ===\n");

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      BASE = "http://127.0.0.1:" + port + "/api";
      console.log("Test server running on " + BASE + "\n");
      resolve();
    });
  });

  try {
    // Admin login
    const adminLoginRes = await request("/admin/login", {
      method: "POST",
      body: { password: process.env.ADMIN_PASSWORD || "admin123" },
    });
    assert(adminLoginRes.status === 200, "Admin login succeeds (Got: " + adminLoginRes.status + ")");
    const adminToken = adminLoginRes.data.token;

    // -----------------------------------------------------------------------
    // Step 1: New contact message starts with status = pending
    // -----------------------------------------------------------------------
    console.log("\n--- Step 1: Submit contact message starts as pending ---");
    const ts = Date.now();
    const submitRes = await request("/contact", {
      method: "POST",
      body: {
        firstName: "Amira",
        lastName: "Karoui",
        email: "amira.test." + ts + "@example.com",
        message: "Test message for status verification.",
      },
    });
    assert(submitRes.status === 201, "Contact message submitted with 201 (Got: " + submitRes.status + ")");
    const msgId = submitRes.data && submitRes.data.id;
    assert(!!msgId, "Contact message has an ID: " + msgId);
    assert(submitRes.data && submitRes.data.status === "pending", "New message has status pending (Got: " + (submitRes.data && submitRes.data.status) + ")");
    assert(
      !submitRes.data || submitRes.data.repliedAt === null || submitRes.data.repliedAt === undefined,
      "New message has null repliedAt (Got: " + (submitRes.data && submitRes.data.repliedAt) + ")"
    );

    // -----------------------------------------------------------------------
    // Step 2: GET /contact/:id returns pending status
    // -----------------------------------------------------------------------
    console.log("\n--- Step 2: GET message returns pending status ---");
    const getRes = await request("/contact/" + msgId, { token: adminToken });
    assert(getRes.status === 200, "GET /contact/:id returns 200 (Got: " + getRes.status + ")");
    assert(getRes.data && getRes.data.status === "pending", "GET message shows status pending (Got: " + (getRes.data && getRes.data.status) + ")");
    assert(
      !getRes.data || getRes.data.repliedAt === null || getRes.data.repliedAt === undefined,
      "GET message shows null repliedAt (Got: " + (getRes.data && getRes.data.repliedAt) + ")"
    );

    // -----------------------------------------------------------------------
    // Step 3: GET /contact list - message appears with pending status
    // -----------------------------------------------------------------------
    console.log("\n--- Step 3: GET all messages - message has pending status in list ---");
    const listRes = await request("/contact", { token: adminToken });
    assert(listRes.status === 200, "GET /contact list returns 200 (Got: " + listRes.status + ")");
    const msgInList = listRes.data && listRes.data.find(function(m) { return m.id === msgId; });
    assert(!!msgInList, "Message found in list");
    assert(msgInList && msgInList.status === "pending", "Message in list shows status pending (Got: " + (msgInList && msgInList.status) + ")");

    // -----------------------------------------------------------------------
    // Step 4: Successful admin reply - status transitions to resolved
    // -----------------------------------------------------------------------
    console.log("\n--- Step 4: Successful admin reply transitions to resolved ---");
    const replyRes = await request("/contact/" + msgId + "/reply", {
      method: "POST",
      token: adminToken,
      body: {
        subject: "Re: Test message",
        message: "Bonjour Amira, merci pour votre message. Nous vous repondrons bientot.",
      },
    });
    assert(replyRes.status === 200, "Admin reply succeeds with 200 (Got: " + replyRes.status + ")");
    assert(replyRes.data && replyRes.data.success === true, "Response payload has success true");
    assert(replyRes.data && !!replyRes.data.contactMessage, "Response payload includes contactMessage object");
    const cm = replyRes.data && replyRes.data.contactMessage;
    assert(cm && cm.status === "resolved", "Returned contactMessage.status is resolved (Got: " + (cm && cm.status) + ")");
    assert(cm && !!cm.repliedAt, "Returned contactMessage.repliedAt is non-null (Got: " + (cm && cm.repliedAt) + ")");
    assert(cm && cm.id === msgId, "Returned contactMessage.id matches (Got: " + (cm && cm.id) + ")");
    const firstRepliedAt = cm && cm.repliedAt;

    // -----------------------------------------------------------------------
    // Step 5: GET after reply - persistence check
    // -----------------------------------------------------------------------
    console.log("\n--- Step 5: GET message after reply - resolved status persisted ---");
    const getResolvedRes = await request("/contact/" + msgId, { token: adminToken });
    assert(getResolvedRes.status === 200, "GET /contact/:id returns 200 (Got: " + getResolvedRes.status + ")");
    assert(
      getResolvedRes.data && getResolvedRes.data.status === "resolved",
      "Persisted status is resolved in PostgreSQL (Got: " + (getResolvedRes.data && getResolvedRes.data.status) + ")"
    );
    assert(
      getResolvedRes.data && !!getResolvedRes.data.repliedAt,
      "Persisted repliedAt is non-null (Got: " + (getResolvedRes.data && getResolvedRes.data.repliedAt) + ")"
    );

    // -----------------------------------------------------------------------
    // Step 6: GET all messages - message appears with resolved status
    // -----------------------------------------------------------------------
    console.log("\n--- Step 6: GET all messages - message has resolved status in list ---");
    const listResolvedRes = await request("/contact", { token: adminToken });
    assert(listResolvedRes.status === 200, "GET /contact list returns 200 (Got: " + listResolvedRes.status + ")");
    const resolvedInList = listResolvedRes.data && listResolvedRes.data.find(function(m) { return m.id === msgId; });
    assert(!!resolvedInList, "Resolved message found in list");
    assert(resolvedInList && resolvedInList.status === "resolved", "Message in list shows status resolved (Got: " + (resolvedInList && resolvedInList.status) + ")");
    assert(resolvedInList && !!resolvedInList.repliedAt, "Message in list shows non-null repliedAt");

    // -----------------------------------------------------------------------
    // Step 7: Subsequent reply on already-resolved message - repliedAt NOT overwritten
    // -----------------------------------------------------------------------
    console.log("\n--- Step 7: Re-reply on resolved message - repliedAt preserved ---");
    const rereplyRes = await request("/contact/" + msgId + "/reply", {
      method: "POST",
      token: adminToken,
      body: {
        subject: "Re: Follow-up",
        message: "Un suivi de notre reponse precedente.",
      },
    });
    assert(rereplyRes.status === 200, "Re-reply on resolved message succeeds with 200 (Got: " + rereplyRes.status + ")");
    const rcm = rereplyRes.data && rereplyRes.data.contactMessage;
    assert(rcm && rcm.status === "resolved", "Status remains resolved after re-reply (Got: " + (rcm && rcm.status) + ")");
    assert(
      rcm && rcm.repliedAt === firstRepliedAt,
      "Original repliedAt preserved (Got: " + (rcm && rcm.repliedAt) + ", Expected: " + firstRepliedAt + ")"
    );

    // -----------------------------------------------------------------------
    // Step 8: Failed validation - status stays pending
    // -----------------------------------------------------------------------
    console.log("\n--- Step 8: Failed validation - status remains pending ---");
    const submitRes2 = await request("/contact", {
      method: "POST",
      body: {
        firstName: "Bilel",
        lastName: "Saidi",
        email: "bilel.test." + ts + "@example.com",
        message: "Another test message for validation check.",
      },
    });
    assert(submitRes2.status === 201, "Second contact message submitted with 201 (Got: " + submitRes2.status + ")");
    const msgId2 = submitRes2.data && submitRes2.data.id;

    const badReply = await request("/contact/" + msgId2 + "/reply", {
      method: "POST",
      token: adminToken,
      body: { subject: "", message: "" },
    });
    assert(badReply.status === 400, "Reply with empty fields rejected with 400 (Got: " + badReply.status + ")");

    const getAfterBad = await request("/contact/" + msgId2, { token: adminToken });
    assert(
      getAfterBad.data && getAfterBad.data.status === "pending",
      "Status remains pending after failed validation (Got: " + (getAfterBad.data && getAfterBad.data.status) + ")"
    );

    console.log("\n=== Verification Results: " + passed + " passed, " + failed + " failed ===");
  } catch (err) {
    console.error("Fatal test error:", err);
    failed++;
  } finally {
    if (server) server.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();

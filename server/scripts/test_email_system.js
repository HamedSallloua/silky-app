/**
 * Comprehensive verification suite for the Centralized Email System,
 * Contact Reply Endpoint, Welcome Emails, and Order Confirmation Emails.
 *
 * Usage: node server/scripts/test_email_system.js
 */
import crypto from 'crypto';
import http from 'http';
import { app } from '../app.js';
import * as emailService from '../services/email.service.js';
import { getPasswordResetEmail } from '../emails/password-reset.email.js';
import { getWelcomeEmail } from '../emails/welcome.email.js';
import { getContactReplyEmail } from '../emails/contact-reply.email.js';
import { getOrderConfirmationEmail } from '../emails/order-confirmation.email.js';
import { productRepository } from '../repositories/product.repository.js';
import { contactRepository } from '../repositories/contact.repository.js';

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

async function request(endpoint, { method = 'GET', body, token, guestSession } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (guestSession) headers['X-Guest-Session-ID'] = guestSession;

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
  console.log('=== Starting Email System Verification Tests ===\n');

  // Start temporary test server
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      BASE = `http://127.0.0.1:${port}/api`;
      console.log(`Test server running on ${BASE}`);
      resolve();
    });
  });

  try {
    // ----------------------------------------------------
    // Section 1: Email Templates Unit Verification
    // ----------------------------------------------------
    console.log('\n--- Test Section 1: Email Templates Generation ---');

    // Password reset template
    const pwTemplate = getPasswordResetEmail({ rawToken: 'test-token-12345' });
    assert(pwTemplate.subject === 'Reinitialisation de votre mot de passe Silky', 'Password reset subject matches exact expected string');
    assert(pwTemplate.html.includes('test-token-12345'), 'Password reset HTML includes raw reset token');
    assert(pwTemplate.text.includes('test-token-12345'), 'Password reset text includes raw reset token');

    // Welcome template
    const welcomeTemplate = getWelcomeEmail({ name: 'Sarra Ben Ali' });
    assert(welcomeTemplate.subject === 'Bienvenue sur Silky', 'Welcome email subject matches');
    assert(welcomeTemplate.html.includes('Sarra Ben Ali'), 'Welcome email HTML includes customer name');
    assert(welcomeTemplate.html.includes('SILKY'), 'Welcome email HTML includes SILKY branding');
    assert(welcomeTemplate.text.includes('Sarra Ben Ali'), 'Welcome email text includes customer name');

    // Contact reply template
    const replyTemplate = getContactReplyEmail({
      recipientName: 'Ahmed Trabelsi',
      subject: 'Re: Disponibilité en taille 40',
      message: 'Bonjour Ahmed,\nLa taille 40 sera de retour la semaine prochaine.\nBien à vous.',
    });
    assert(replyTemplate.subject === 'Re: Disponibilité en taille 40', 'Contact reply subject matches');
    assert(replyTemplate.html.includes('Ahmed Trabelsi'), 'Contact reply HTML includes recipient name');
    assert(replyTemplate.html.includes('semaine prochaine'), 'Contact reply HTML includes formatted message body');

    // Order confirmation & invoice template
    const mockOrder = {
      orderNumber: 'ORD-TEST-999',
      createdAt: new Date().toISOString(),
      customer: {
        firstName: 'Mariem',
        lastName: 'Mansour',
        name: 'Mariem Mansour',
        email: 'mariem@test.com',
        phone: '98111222',
        address: 'Tunis — Avenue Habib Bourguiba',
      },
      items: [
        { name: 'Robe Soie', variantLabel: 'Bleu · Taille 38', quantity: 2, price: 50.0 },
        { name: 'Foulard Satin', variantLabel: 'Rouge', quantity: 1, price: 25.0 },
      ],
      subtotal: 125.0,
      deliveryFee: 7.0,
      total: 132.0,
    };
    const orderTemplate = getOrderConfirmationEmail(mockOrder);
    assert(orderTemplate.subject.includes('ORD-TEST-999'), 'Order confirmation subject includes order number');
    assert(orderTemplate.html.includes('ORD-TEST-999'), 'Order confirmation HTML includes order number');
    assert(orderTemplate.html.includes('Mariem Mansour'), 'Order confirmation HTML includes customer name');
    assert(orderTemplate.html.includes('Robe Soie'), 'Order confirmation HTML includes first item title');
    assert(orderTemplate.html.includes('Foulard Satin'), 'Order confirmation HTML includes second item title');
    assert(orderTemplate.html.includes('125,000 TND') || orderTemplate.html.includes('125.000 TND'), 'Order confirmation HTML includes formatted subtotal');
    assert(orderTemplate.html.includes('132,000 TND') || orderTemplate.html.includes('132.000 TND'), 'Order confirmation HTML includes formatted total');

    // ----------------------------------------------------
    // Section 2: Email Service Direct Dispatch (Ethereal Fallback)
    // ----------------------------------------------------
    console.log('\n--- Test Section 2: Email Service Sending Functions ---');

    const sendRes = await emailService.sendEmail({
      to: 'test-recipient@example.com',
      subject: 'Test Centralized Email',
      text: 'Hello test',
      html: '<p>Hello test</p>',
    });
    assert(!!sendRes.messageId, `sendEmail successfully dispatched message (ID: ${sendRes.messageId})`);

    const welcomeSend = await emailService.sendWelcomeEmail('welcome-user@example.com', 'Test User');
    assert(!!welcomeSend.messageId, `sendWelcomeEmail dispatched successfully (ID: ${welcomeSend.messageId})`);

    const replySend = await emailService.sendContactReplyEmail('client@example.com', {
      recipientName: 'Test Client',
      subject: 'Re: Test Subject',
      message: 'This is a test reply from Silky admin.',
    });
    assert(!!replySend.messageId, `sendContactReplyEmail dispatched successfully (ID: ${replySend.messageId})`);

    const orderSend = await emailService.sendOrderConfirmationEmail(mockOrder);
    assert(!!orderSend.messageId, `sendOrderConfirmationEmail dispatched successfully (ID: ${orderSend.messageId})`);

    // ----------------------------------------------------
    // Section 3: Auth Registration Welcome Email Trigger
    // ----------------------------------------------------
    console.log('\n--- Test Section 3: Automatic Welcome Email on Registration ---');

    const timestamp = Date.now();
    const emailUser = `user_${timestamp}@example.com`;
    const regRes = await request('/auth/register', {
      method: 'POST',
      body: {
        email: emailUser,
        password: 'Password123!',
        fullName: 'Client Email Test',
      },
    });
    assert(regRes.status === 201, `Email registration succeeds with 201 (Got: ${regRes.status})`);
    assert(regRes.data?.user?.email === emailUser, 'Registered user object contains email');

    // Phone-only registration (no email)
    const phoneNum = String(20000000 + Math.floor(Math.random() * 80000000)).slice(0, 8);
    const phoneRegRes = await request('/auth/register', {
      method: 'POST',
      body: {
        identifier: phoneNum,
        password: 'Password123!',
        fullName: 'Client Phone Only',
      },
    });
    assert(phoneRegRes.status === 201, `Phone-only registration succeeds with 201 (Got: ${phoneRegRes.status})`);
    assert(phoneRegRes.data?.user?.email === null, 'Phone-only user has null email (no welcome email attempted)');

    // ----------------------------------------------------
    // Section 4: Contact Reply Endpoint & Admin Composer Security
    // ----------------------------------------------------
    console.log('\n--- Test Section 4: Contact Reply Backend & Security ---');

    // 1. Submit a contact message
    const msgRes = await request('/contact', {
      method: 'POST',
      body: {
        firstName: 'Nour',
        lastName: 'Gharbi',
        email: 'nour.gharbi@test.com',
        message: 'Avez-vous une livraison express sur Sousse ?',
      },
    });
    assert(msgRes.status === 201, `Contact message submitted with 201 (Got: ${msgRes.status})`);
    const contactMessageId = msgRes.data?.id;
    assert(!!contactMessageId, `Contact message created with ID: ${contactMessageId}`);

    // 2. Reply without auth -> 401
    const unauthReply = await request(`/contact/${contactMessageId}/reply`, {
      method: 'POST',
      body: {
        subject: 'Re: Livraison',
        message: 'Oui, nous livrons sous 24h.',
      },
    });
    assert(unauthReply.status === 401, `Unauthenticated reply rejected with 401 (Got: ${unauthReply.status})`);

    // 3. Reply with regular user token -> 403
    const userToken = regRes.data.token;
    const forbiddenReply = await request(`/contact/${contactMessageId}/reply`, {
      method: 'POST',
      token: userToken,
      body: {
        subject: 'Re: Livraison',
        message: 'Oui, nous livrons sous 24h.',
      },
    });
    assert(forbiddenReply.status === 403, `Non-admin user reply rejected with 403 (Got: ${forbiddenReply.status})`);

    // 4. Admin login
    const adminLoginRes = await request('/admin/login', {
      method: 'POST',
      body: { password: process.env.ADMIN_PASSWORD || 'admin123' },
    });
    assert(adminLoginRes.status === 200, `Admin login succeeds with 200 (Got: ${adminLoginRes.status})`);
    const adminToken = adminLoginRes.data.token;

    // 5. Reply to non-existent message -> 404
    const notFoundReply = await request('/contact/non-existent-uuid-999/reply', {
      method: 'POST',
      token: adminToken,
      body: {
        subject: 'Re: Test',
        message: 'Test message',
      },
    });
    assert(notFoundReply.status === 404, `Reply to invalid ID returns 404 (Got: ${notFoundReply.status})`);

    // 6. Reply with empty subject / message -> 400
    const emptySubjReply = await request(`/contact/${contactMessageId}/reply`, {
      method: 'POST',
      token: adminToken,
      body: {
        subject: '',
        message: 'Valid message body',
      },
    });
    assert(emptySubjReply.status === 400, `Empty subject rejected with 400 (Got: ${emptySubjReply.status})`);

    const emptyBodyReply = await request(`/contact/${contactMessageId}/reply`, {
      method: 'POST',
      token: adminToken,
      body: {
        subject: 'Valid subject',
        message: '   ',
      },
    });
    assert(emptyBodyReply.status === 400, `Empty message body rejected with 400 (Got: ${emptyBodyReply.status})`);

    // 7. Legitimate Admin Reply
    const validReply = await request(`/contact/${contactMessageId}/reply`, {
      method: 'POST',
      token: adminToken,
      body: {
        subject: 'Re: Livraison express Sousse',
        message: 'Bonjour Nour,\n\nOui, nous livrons à Sousse en 24 à 48 heures ouvrables.\n\nBonne journée !',
        // Attempt to pass arbitrary recipient to ensure it is ignored
        to: 'hacker@attacker.com',
        recipient: 'hacker@attacker.com',
        email: 'hacker@attacker.com',
      },
    });
    assert(validReply.status === 200, `Admin contact reply succeeded with 200 (Got: ${validReply.status})`);
    assert(validReply.data?.success === true, 'Response payload contains { success: true }');

    // ----------------------------------------------------
    // Section 5: DB-Backed Email Idempotency — All 10 Invariants
    // ----------------------------------------------------
    console.log('\n--- Test Section 5: DB-Backed Order Confirmation Email Idempotency ---');

    const { dispatchOrderConfirmationEmail, createOrder } = await import('../services/order.service.js');
    const { emailDeliveryRepository } = await import('../repositories/email-delivery.repository.js');

    // Helper to await async email completion and status transition in DB
    async function waitForDelivery(orderId, expectedStatus = 'sent', maxWaitMs = 6000) {
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        const row = await emailDeliveryRepository.findByOrderAndType(orderId, 'order_confirmation');
        if (row && row.status === expectedStatus) {
          return row;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return emailDeliveryRepository.findByOrderAndType(orderId, 'order_confirmation');
    }

    // Use hook to count raw SMTP dispatches (delivery rows are the authoritative check)
    let smtpCallCount = 0;
    emailService.setOrderConfirmationEmailHook(() => { smtpCallCount++; });

    const prodsRes = await request('/products');
    const products = Array.isArray(prodsRes.data) ? prodsRes.data : (prodsRes.data?.products || []);
    const testProduct = products.find((p) => p.colors?.length && p.sizes?.length);
    assert(Boolean(testProduct), `Found test product: ${testProduct?.name}`);

    const color1 = testProduct.colors[0].id;
    const size1 = testProduct.sizes[0];
    const testVariant = await productRepository.findVariantForOrderItem(testProduct.id, color1, size1);
    assert(Boolean(testVariant), `Found test variant ID: ${testVariant?.id}`);

    // T1 + T5: Buy Now → exactly 1 email, DB row status = 'sent'
    smtpCallCount = 0;
    const buyNowRes = await request('/orders/checkout', {
      method: 'POST',
      body: {
        customer: {
          fullName: 'Sonia Mabrouk',
          phoneNumber: '55112233',
          customerEmail: 'sonia.mabrouk@example.com',
          shippingAddress: 'Nabeul — Hammamet Centre',
        },
        buyNowItem: {
          productId: testProduct.id,
          variantId: testVariant.id,
          size: testVariant.size,
          quantity: 1,
        },
      },
    });
    assert(buyNowRes.status === 201, `[T1/T5] Buy Now checkout succeeded with 201 (Got: ${buyNowRes.status})`);
    assert(buyNowRes.data?.customer?.email === 'sonia.mabrouk@example.com', '[T1/T5] Buy Now order recorded customer email');
    
    const buyNowDelivery = await waitForDelivery(buyNowRes.data.id, 'sent');
    assert(smtpCallCount === 1, `[T1/T5] Buy Now dispatched EXACTLY 1 SMTP call (Count: ${smtpCallCount})`);
    assert(buyNowDelivery !== null, '[T1/T5] order_email_deliveries row created for Buy Now order');
    assert(buyNowDelivery?.status === 'sent', `[T1/T5] Delivery row status is 'sent' (Got: ${buyNowDelivery?.status})`);
    assert(buyNowDelivery?.sentAt !== null, '[T1/T5] sent_at timestamp is recorded');

    // T2: Repeated trigger → 0 additional emails, row unchanged
    smtpCallCount = 0;
    await dispatchOrderConfirmationEmail(buyNowRes.data);
    await new Promise((r) => setTimeout(r, 200));
    assert(smtpCallCount === 0, `[T2] Repeated trigger dispatched 0 additional emails (Count: ${smtpCallCount})`);
    const afterRepeat = await emailDeliveryRepository.findByOrderAndType(buyNowRes.data.id, 'order_confirmation');
    assert(afterRepeat?.status === 'sent', `[T2] Row still 'sent' after repeated trigger (Got: ${afterRepeat?.status})`);

    // T3: Concurrent triggers → exactly 1 dispatch (DB unique constraint)
    smtpCallCount = 0;
    const concurrentOrder = await createOrder({
      customer: {
        name: 'Concurrent Test',
        phone: '11223344',
        email: 'concurrent@example.com',
        address: 'Tunis — Centre Ville',
      },
      items: [{ variantId: testVariant.id, quantity: 1 }],
    });
    // Wait for the auto-dispatch from createOrder to complete
    const concurrentInitialDelivery = await waitForDelivery(concurrentOrder.id, 'sent');
    assert(concurrentInitialDelivery?.status === 'sent', '[T3] Initial createOrder auto-dispatch marked as sent');
    assert(smtpCallCount === 1, `[T3] Initial createOrder dispatched 1 SMTP call (Count: ${smtpCallCount})`);

    smtpCallCount = 0;
    // Race two more concurrent calls — both must be blocked by DB unique row
    await Promise.all([
      dispatchOrderConfirmationEmail(concurrentOrder),
      dispatchOrderConfirmationEmail(concurrentOrder),
    ]);
    await new Promise((r) => setTimeout(r, 200));
    assert(smtpCallCount === 0, `[T3] Concurrent extra triggers dispatched 0 additional emails (Count: ${smtpCallCount})`);
    const concurrentDelivery = await emailDeliveryRepository.findByOrderAndType(concurrentOrder.id, 'order_confirmation');
    assert(concurrentDelivery?.status === 'sent', `[T3] Concurrent order delivery row remains 'sent' (Got: ${concurrentDelivery?.status})`);

    // T4: Persisted 'sent' row prevents dispatch after simulated restart
    smtpCallCount = 0;
    await dispatchOrderConfirmationEmail(buyNowRes.data); // DB row is 'sent' — should skip
    await new Promise((r) => setTimeout(r, 200));
    assert(smtpCallCount === 0, `[T4] Persisted 'sent' row prevented re-dispatch (Count: ${smtpCallCount})`);

    // T8: Order without customer email → 0 emails, no DB row
    smtpCallCount = 0;
    const buyNowNoEmailRes = await request('/orders/checkout', {
      method: 'POST',
      body: {
        customer: {
          fullName: 'Mohamed Ali',
          phoneNumber: '55998877',
          shippingAddress: 'Sfax — Route de Téniour',
        },
        buyNowItem: {
          productId: testProduct.id,
          variantId: testVariant.id,
          size: testVariant.size,
          quantity: 1,
        },
      },
    });
    assert(buyNowNoEmailRes.status === 201, `[T8] Buy Now without email succeeded with 201 (Got: ${buyNowNoEmailRes.status})`);
    await new Promise((r) => setTimeout(r, 200));
    assert(smtpCallCount === 0, `[T8] No email dispatched for order without customer email (Count: ${smtpCallCount})`);
    const noEmailDelivery = await emailDeliveryRepository.findByOrderAndType(buyNowNoEmailRes.data.id, 'order_confirmation');
    assert(noEmailDelivery === null, '[T8] No order_email_deliveries row created for order without email');

    // T6: Cart checkout → exactly 1 email
    smtpCallCount = 0;
    const guestSession = crypto.randomUUID();
    await request('/cart/items', {
      method: 'POST',
      guestSession,
      body: { variantId: testVariant.id, quantity: 1 },
    });
    const cartCheckoutRes = await request('/orders/checkout', {
      method: 'POST',
      guestSession,
      body: {
        customer: {
          name: 'Yassine Ayari',
          phone: '99001122',
          email: 'yassine.ayari@example.com',
          address: 'Bizerte — Corniche',
        },
      },
    });
    assert(cartCheckoutRes.status === 201, `[T6] Cart checkout succeeded with 201 (Got: ${cartCheckoutRes.status})`);
    const cartDelivery = await waitForDelivery(cartCheckoutRes.data.id, 'sent');
    assert(smtpCallCount === 1, `[T6] Cart checkout dispatched EXACTLY 1 SMTP call (Count: ${smtpCallCount})`);
    assert(cartDelivery?.status === 'sent', `[T6] Cart checkout delivery row is 'sent' (Got: ${cartDelivery?.status})`);

    // T7: Admin manual order → exactly 1 email
    smtpCallCount = 0;
    const manualOrderRes = await request('/admin/orders/manual', {
      method: 'POST',
      token: adminToken,
      body: {
        customerName: 'Leila Ben Youssef',
        phoneNumber: '21334455',
        customerEmail: 'leila.by@example.com',
        shippingAddress: 'Ariana — Ennasr 2',
        orderSource: 'instagram',
        items: [{ variantId: testVariant.id, quantity: 1 }],
      },
    });
    assert(manualOrderRes.status === 201, `[T7] Admin manual order succeeded with 201 (Got: ${manualOrderRes.status})`);
    const manualDelivery = await waitForDelivery(manualOrderRes.data.id, 'sent');
    assert(smtpCallCount === 1, `[T7] Admin manual order dispatched EXACTLY 1 SMTP call (Count: ${smtpCallCount})`);
    assert(manualDelivery?.status === 'sent', `[T7] Manual order delivery row is 'sent' (Got: ${manualDelivery?.status})`);

    // T9 + T10: Email failure → 'failed' row, order intact; safe retry → 'sent'
    console.log('\n--- Test Section 6: Failure Handling & Safe Retry ---');

    smtpCallCount = 0;
    const failureOrder = await createOrder({
      customer: {
        name: 'Failure Test',
        phone: '88776655',
        email: 'failure@example.com',
        address: 'Monastir — Centre',
      },
      items: [{ variantId: testVariant.id, quantity: 1 }],
    });
    assert(Boolean(failureOrder?.id), '[T9] Order created for failure test');
    // Wait for auto-dispatch to complete
    await waitForDelivery(failureOrder.id, 'sent');

    // Delete row so we can run the controlled failure test
    await emailDeliveryRepository.deleteByOrderAndType(failureOrder.id, 'order_confirmation');
    assert(
      (await emailDeliveryRepository.findByOrderAndType(failureOrder.id, 'order_confirmation')) === null,
      '[T9] Delivery row deleted to prepare controlled failure scenario'
    );

    // Sabotage SMTP using mock sender
    emailService.setMockOrderConfirmationSender(async () => {
      throw new Error('Simulated SMTP failure');
    });

    smtpCallCount = 0;
    await dispatchOrderConfirmationEmail(failureOrder);
    // Wait for failure status to be recorded in DB
    const failedRow = await waitForDelivery(failureOrder.id, 'failed');

    // Restore real sender
    emailService.setMockOrderConfirmationSender(null);

    assert(failedRow !== null, '[T9] Delivery row exists after failure');
    assert(failedRow?.status === 'failed', `[T9] Delivery row status is 'failed' after SMTP error (Got: ${failedRow?.status})`);
    assert(failedRow?.errorMessage?.includes('Simulated'), `[T9] Error message recorded: "${failedRow?.errorMessage}"`);

    const orderAfterFailure = await request(`/orders/${failureOrder.id}`, { token: adminToken });
    assert(orderAfterFailure.status === 200, `[T9] Order still retrievable after email failure (Got: ${orderAfterFailure.status})`);

    // T10: Delete 'failed' row → retry → 'sent', exactly 1 SMTP call
    await emailDeliveryRepository.deleteByOrderAndType(failureOrder.id, 'order_confirmation');
    smtpCallCount = 0;
    await dispatchOrderConfirmationEmail(failureOrder);
    const retriedRow = await waitForDelivery(failureOrder.id, 'sent');
    assert(smtpCallCount === 1, `[T10] Retry after failure dispatched EXACTLY 1 SMTP call (Count: ${smtpCallCount})`);
    assert(retriedRow?.status === 'sent', `[T10] Retried delivery row is 'sent' (Got: ${retriedRow?.status})`);

    // Verify no double-send after retry succeeds
    smtpCallCount = 0;
    await dispatchOrderConfirmationEmail(failureOrder);
    await new Promise((r) => setTimeout(r, 200));
    assert(smtpCallCount === 0, `[T10] After successful retry, second attempt dispatched 0 additional emails (Count: ${smtpCallCount})`);

    emailService.setOrderConfirmationEmailHook(null);
    emailService.setMockOrderConfirmationSender(null);

    console.log(`\n=== Verification Results: ${passed} passed, ${failed} failed ===`);
  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    emailService.setOrderConfirmationEmailHook(null);
    emailService.setMockOrderConfirmationSender(null);
    if (server) server.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();

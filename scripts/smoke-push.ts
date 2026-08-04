/**
 * Device-free Web Push transport smoke.
 *
 * The one Phase 9 acceptance item we can't cover from a headless box is the
 * last hop: a real push service (FCM/Mozilla) accepting our request and a
 * browser rendering it. This script proves everything up to that hop is
 * correct — using the app's *actual* VAPID keys and the same `web-push`
 * library the dispatcher uses — with no browser, no device, and no database.
 *
 * It generates a real P-256 subscription (the exact shape a browser's
 * `pushManager.subscribe` produces) and asks `web-push` to build the outgoing
 * request via `generateRequestDetails`. That runs the genuine VAPID JWT signing
 * and aes128gcm payload encryption, then we assert the result is exactly what a
 * real push service validates before it accepts and forwards a push:
 *
 *   - POST, Content-Encoding: aes128gcm, TTL header, a non-empty encrypted body
 *   - a VAPID Authorization header whose `k=` is our public key
 *   - a JWT that verifies (ES256) against our public key, with the right
 *     audience (push origin), subject, and a sane expiry
 *
 * Run: `pnpm push:smoke` (loads .env for VAPID_*). Exits non-zero on any
 * failed assertion.
 */
import * as crypto from 'node:crypto';
import * as webpush from 'web-push';

const subject = process.env.VAPID_SUBJECT;
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
if (!subject || !publicKey || !privateKey) {
  throw new Error(
    'VAPID_SUBJECT, VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY are required (run with --env-file=.env)',
  );
}
webpush.setVapidDetails(subject, publicKey, privateKey);

// Narrowed locals so the values stay `string` inside `main()`.
const vapidSubject: string = subject;
const vapidPublicKey: string = publicKey;

/** Build a verifiable EC public key from a raw base64url uncompressed point. */
function ecPublicKeyFromRawPoint(rawB64url: string): crypto.KeyObject {
  const raw = Buffer.from(rawB64url, 'base64url');
  if (raw.length !== 65 || raw[0] !== 0x04) {
    throw new Error(
      `unexpected VAPID public key format: ${raw.length} bytes, leading 0x${raw[0]?.toString(16)}`,
    );
  }
  return crypto.createPublicKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: raw.subarray(1, 33).toString('base64url'),
      y: raw.subarray(33, 65).toString('base64url'),
    },
  });
}

const failures: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  console.log(
    ok ? `  ✓ ${label}` : `  ✗ ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(label);
}

function main() {
  // A real P-256 subscription, exactly like the browser produces. The endpoint
  // origin is what VAPID's `aud` claim must be signed for.
  const origin = 'https://push.example.com';
  const endpoint = `${origin}/wpush/smoke-subscription`;
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const subscription = {
    endpoint,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: crypto.randomBytes(16).toString('base64url'),
    },
  };

  const payload = JSON.stringify({
    title: 'Rezervim i ri',
    body: 'Web Push transport smoke',
    url: '/calendar?appointmentId=smoke',
    tag: 'smoke-push',
  });

  console.log('Building a real Web Push request with the app VAPID keys…\n');
  const details = webpush.generateRequestDetails(subscription, payload, {
    TTL: 60,
    contentEncoding: 'aes128gcm',
  });

  const headers = Object.fromEntries(
    Object.entries(details.headers as Record<string, string>).map(([k, v]) => [
      k.toLowerCase(),
      v,
    ]),
  );

  check('request method is POST', details.method === 'POST', details.method);
  check(
    'Content-Encoding is aes128gcm (payload encrypted)',
    headers['content-encoding'] === 'aes128gcm',
    String(headers['content-encoding']),
  );
  check(
    'TTL header present and numeric',
    headers.ttl !== undefined && Number.isFinite(Number(headers.ttl)),
    String(headers.ttl),
  );
  check(
    'encrypted body is non-empty',
    Buffer.isBuffer(details.body) && details.body.length > 0,
    `${details.body?.length ?? 0} bytes`,
  );

  // VAPID authorization: "vapid t=<jwt>, k=<publicKey>"
  const authHeader = headers.authorization ?? '';
  const vapidMatch = /vapid\s+t=([^,\s]+),\s*k=([^,\s]+)/i.exec(authHeader);
  check('Authorization is a VAPID header', vapidMatch !== null, authHeader);

  if (vapidMatch) {
    const [, jwt, headerKey] = vapidMatch;
    check(
      'VAPID key (k=) matches our public key',
      headerKey === vapidPublicKey,
      'header k did not equal VAPID_PUBLIC_KEY',
    );

    const parts = jwt.split('.');
    if (parts.length !== 3) {
      check('VAPID JWT has three segments', false, `${parts.length} segments`);
    } else {
      const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
      let claims: Record<string, unknown> = {};
      let jwtHeader: Record<string, unknown> = {};
      let decoded = true;
      try {
        jwtHeader = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
        claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      } catch {
        decoded = false;
      }
      check('VAPID JWT decodes', decoded);
      check(
        'VAPID JWT alg is ES256',
        jwtHeader.alg === 'ES256',
        String(jwtHeader.alg),
      );

      // The crux: verify the ES256 signature against our VAPID public key. This
      // proves the request is signed by *our* keypair — exactly what the push
      // service checks before accepting the push.
      let signatureValid = false;
      try {
        signatureValid = crypto.verify(
          'sha256',
          Buffer.from(`${headerB64}.${payloadB64}`),
          {
            key: ecPublicKeyFromRawPoint(vapidPublicKey),
            dsaEncoding: 'ieee-p1363',
          },
          Buffer.from(sigB64, 'base64url'),
        );
      } catch (err) {
        check('VAPID JWT signature verifies', false, String(err));
      }
      check(
        'VAPID JWT signature verifies against our public key',
        signatureValid,
      );

      check(
        'VAPID JWT audience matches the push origin',
        claims.aud === origin,
        `aud=${String(claims.aud)}`,
      );
      check(
        'VAPID JWT subject matches VAPID_SUBJECT',
        claims.sub === vapidSubject,
        `sub=${String(claims.sub)}`,
      );
      const now = Math.floor(Date.now() / 1000);
      check(
        'VAPID JWT is unexpired (exp in the future, within 24h)',
        typeof claims.exp === 'number' &&
          claims.exp > now &&
          claims.exp <= now + 24 * 60 * 60,
        `exp=${String(claims.exp)}`,
      );
    }
  }

  console.log('');
  if (failures.length > 0) {
    console.error(
      `FAIL — ${failures.length} assertion(s) failed:\n  - ${failures.join('\n  - ')}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    'PASS — our VAPID keys produce a spec-conformant, correctly-signed Web Push request.\n' +
      'The only unverified hop is the real push service + browser render, which needs a device.',
  );
}

main();

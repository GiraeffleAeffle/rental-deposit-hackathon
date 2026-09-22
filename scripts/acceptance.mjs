#!/usr/bin/env node

// HTTP acceptance against an already-running LOCAL Next server. Fresh in-memory
// demonstration cookies only: no browser storage, provider credentials or chain writes.
import { createHash, randomUUID } from 'node:crypto';

if (process.argv.includes('--help')) {
  console.log('Usage: APP_ORIGIN=http://127.0.0.1:4175 node scripts/acceptance.mjs');
  console.log('Exercises fictional HTTP workflows in fresh sessions. The origin must be loopback.');
  process.exit(0);
}

const suppliedOrigin = process.env.APP_ORIGIN || 'http://127.0.0.1:4175';
let origin;
try {
  const url = new URL(suppliedOrigin);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid origin');
  origin = url.origin;
} catch {
  console.error(
    'FAIL: APP_ORIGIN must be an HTTP(S) loopback origin without credentials or a path.',
  );
  process.exit(1);
}

let assertions = 0;
let requests = 0;
function check(condition, message) {
  assertions++;
  if (!condition) throw new Error(message);
}
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const balanceFingerprint = (state) =>
  fingerprint({ security: state.security, personal: state.personal, settlement: state.settlement });

class Browser {
  #cookie = '';

  async request(path, { method = 'GET', body, requestOrigin = origin, statuses = [200] } = {}) {
    const headers = { Accept: 'application/json' };
    if (this.#cookie) headers.Cookie = this.#cookie;
    if (method !== 'GET') {
      headers.Origin = requestOrigin;
      headers['Content-Type'] = 'application/json';
    }
    requests++;
    let response;
    try {
      response = await fetch(new URL(path, origin), {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new Error('The local HTTP server did not respond. Start it before running acceptance.');
    }
    const route = path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, ':id').split('?')[0];
    check(
      statuses.includes(response.status),
      `${method} ${route}: expected HTTP ${statuses.join('/')}, received ${response.status}.`,
    );
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = /^rental_demo=([a-f0-9]{64})(?:;|$)/.exec(setCookie);
      check(!!match, 'The demo session cookie must have the expected opaque format.');
      check(
        /;\s*HttpOnly(?:;|$)/i.test(setCookie) && /;\s*SameSite=Strict(?:;|$)/i.test(setCookie),
        'The demo cookie must remain HttpOnly and SameSite=Strict.',
      );
      this.#cookie = `rental_demo=${match[1]}`;
    }
    const json = response.headers.get('content-type')?.includes('application/json');
    let data = null;
    if (json) {
      try {
        data = await response.json();
      } catch {
        throw new Error(`${route}: the local server returned invalid JSON.`);
      }
    }
    if (response.status === 200)
      check(
        response.headers.get('cache-control')?.includes('no-store'),
        `${route}: successful private state must not be cached.`,
      );
    return { status: response.status, data };
  }
}

function inspectState(state, network, id) {
  check(
    state?.mode === 'demo' && state.network === network,
    `${network}: response must remain an explicitly labeled demonstration on its fixed network.`,
  );
  check(
    typeof state.id === 'string' && (!id || id === state.id),
    `${network}: workspace identity changed unexpectedly.`,
  );
  check(
    Number.isSafeInteger(state.revision) && state.revision >= 0,
    `${network}: invalid persisted revision.`,
  );
  for (const key of ['required', 'principal', 'assets', 'earned', 'released', 'liquid'])
    check(
      typeof state.security[key] === 'string' && /^(0|[1-9][0-9]*)$/.test(state.security[key]),
      `${network}: security.${key} must use atomic integer strings.`,
    );
  for (const key of ['cash', 'units', 'multiplier', 'contributed', 'withdrawn', 'spent'])
    check(
      typeof state.personal[key] === 'string' && /^(0|[1-9][0-9]*)$/.test(state.personal[key]),
      `${network}: personal.${key} must use atomic integer strings.`,
    );
  for (const operation of state.operations)
    if (operation.state === 'completed')
      check(
        operation.proof?.kind === 'fixture' &&
          operation.proof.network === network &&
          operation.proof.reference.startsWith('fixture:'),
        `${network}: demo completion must never claim a native-chain receipt.`,
      );
  return state;
}

async function workspace(network) {
  const browser = new Browser();
  const opened = await browser.request('/api/demo', { method: 'POST', body: { network } });
  let state = inspectState(opened.data?.state, network);
  const id = state.id;
  const path = `/api/workspaces/${id}`;

  async function refresh(role = 'tenant') {
    const response = await browser.request(`${path}?role=${role}`);
    state = inspectState(response.data?.state, network, id);
    return state;
  }
  async function send(payload, options = {}) {
    const response = await browser.request(path, { method: 'POST', body: payload, ...options });
    if (response.status === 200) state = inspectState(response.data?.state, network, id);
    return response;
  }
  async function command(role, value, { duplicate = false } = {}) {
    const payload = { role, command: value, commandId: randomUUID(), revision: state.revision };
    await send(payload);
    if (duplicate) {
      const persisted = fingerprint(state);
      await send(payload);
      check(
        fingerprint(state) === persisted,
        `${network}: retrying an identical command changed persisted state.`,
      );
      await refresh(role);
      check(
        fingerprint(state) === persisted,
        `${network}: refetch after duplicate command differed from persisted state.`,
      );
    }
    return payload.commandId;
  }
  async function deny(role, value, statuses = [400, 403], options = {}) {
    const before = fingerprint(state);
    await send(
      { role, command: value, commandId: randomUUID(), revision: state.revision, ...options },
      { statuses },
    );
    await refresh();
    check(fingerprint(state) === before, `${network}: a rejected command changed persisted state.`);
  }
  async function reconcile(operationId, simulateFailure = false, duplicate = true) {
    const body = { role: 'tenant', operationId, simulateFailure };
    const response = await browser.request(`${path}/reconcile`, { method: 'POST', body });
    state = inspectState(response.data?.state, network, id);
    if (duplicate) {
      const completed = fingerprint(state);
      const retry = await browser.request(`${path}/reconcile`, { method: 'POST', body });
      state = inspectState(retry.data?.state, network, id);
      check(
        fingerprint(state) === completed,
        `${network}: duplicate reconciliation booked an effect twice.`,
      );
    }
  }
  async function execute(
    kind,
    amount,
    { role = 'tenant', fail = false, exerciseAuthorization = false } = {},
  ) {
    const before = balanceFingerprint(state);
    const operationId = await command(
      role,
      { type: 'plan', kind, ...(amount === undefined ? {} : { amount }) },
      { duplicate: exerciseAuthorization },
    );
    const operation = state.operations.find((item) => item.id === operationId);
    check(
      operation?.state === 'awaiting_authorization',
      `${network}: ${kind} was not prepared for explicit authorization.`,
    );
    check(
      balanceFingerprint(state) === before,
      `${network}: preparing ${kind} moved balances before confirmation.`,
    );
    if (exerciseAuthorization) {
      await deny('arbitrator', { type: 'authorize', operationId });
      await deny(
        role,
        { type: 'document', name: 'Stale request', body: 'This must fail the revision check.' },
        [409],
        { revision: state.revision - 1 },
      );
    }
    await command(role, { type: 'authorize', operationId }, { duplicate: exerciseAuthorization });
    check(
      state.operations.find((item) => item.id === operationId)?.state === 'submitted',
      `${network}: ${kind} was not submitted.`,
    );
    check(
      balanceFingerprint(state) === before,
      `${network}: ${kind} was booked before reconciliation.`,
    );
    if (exerciseAuthorization) await deny(role, { type: 'plan', kind: 'fund' });
    await reconcile(operationId, fail);
    const finished = state.operations.find((item) => item.id === operationId);
    check(
      finished?.state === (fail ? 'failed' : 'completed'),
      `${network}: ${kind} reconciliation has the wrong result.`,
    );
    if (fail)
      check(
        balanceFingerprint(state) === before && !finished.proof,
        `${network}: a failed fixture operation changed money or fabricated a receipt.`,
      );
    return operationId;
  }
  async function agreements() {
    await command('tenant', { type: 'accept' }, { duplicate: true });
    check(
      state.stage === 'draft' && state.accepted.tenant && !state.accepted.landlord,
      `${network}: one acceptance must not fund the tenancy.`,
    );
    await deny('tenant', { type: 'plan', kind: 'fund' });
    await command('landlord', { type: 'accept' });
    check(
      state.stage === 'accepted' && state.accepted.tenant && state.accepted.landlord,
      `${network}: both parties must accept the policy.`,
    );
  }
  async function persistence() {
    const saved = fingerprint(state);
    await refresh('landlord');
    check(
      fingerprint(state) === saved,
      `${network}: role-aware reload did not preserve the workspace.`,
    );
    const reopened = await browser.request('/api/demo', { method: 'POST', body: { network } });
    state = inspectState(reopened.data?.state, network, id);
    check(
      fingerprint(state) === saved,
      `${network}: reopening the same session created or reset its workspace.`,
    );
  }
  return {
    browser,
    path,
    id,
    get state() {
      return state;
    },
    refresh,
    command,
    deny,
    execute,
    agreements,
    persistence,
  };
}

async function protections(w) {
  const anonymous = new Browser();
  await anonymous.request(`${w.path}?role=tenant`, { statuses: [403] });
  const second = await workspace(w.state.network);
  check(second.id !== w.id, 'Fresh browser sessions must create different demo workspaces.');
  await second.browser.request(`${w.path}?role=tenant`, { statuses: [403] });
  await second.browser.request(w.path, {
    method: 'POST',
    body: {
      role: 'tenant',
      command: { type: 'accept' },
      commandId: randomUUID(),
      revision: w.state.revision,
    },
    statuses: [403],
  });
  await second.browser.request(`${w.path}/reconcile`, {
    method: 'POST',
    body: { role: 'tenant' },
    statuses: [403],
  });
  const before = fingerprint(w.state);
  await w.browser.request(w.path, {
    method: 'POST',
    requestOrigin: 'https://cross-origin.invalid',
    body: {
      role: 'tenant',
      command: { type: 'accept' },
      commandId: randomUUID(),
      revision: w.state.revision,
    },
    statuses: [403],
  });
  await anonymous.request('/api/demo', {
    method: 'POST',
    requestOrigin: 'https://cross-origin.invalid',
    body: { network: w.state.network },
    statuses: [403],
  });
  await w.browser.request(`${w.path}?role=admin`, { statuses: [400, 403] });
  await w.refresh();
  check(
    fingerprint(w.state) === before,
    'Cross-session, cross-origin or invalid-role attempts changed the workspace.',
  );
  await w.deny('landlord', { type: 'plan', kind: 'fund' });
}

async function ordinary(network) {
  const w = await workspace(network);
  await protections(w);
  await w.agreements();
  await w.command('tenant', {
    type: 'document',
    name: 'Acceptance fixture inventory',
    body: 'A fictional move-in inventory recorded through the HTTP API.',
  });
  await w.execute('fund', undefined, { exerciseAuthorization: true });
  check(
    w.state.security.principal === '3000000000' && w.state.security.assets === '3000000000',
    `${network}: 3,000-unit funding is incorrect.`,
  );
  await w.execute('supply');
  check(w.state.security.supplied, `${network}: the funded deposit was not supplied.`);
  await w.command('tenant', { type: 'fixture_return', amount: '10000000' });
  check(
    w.state.security.assets === '3010000000' &&
      w.state.security.earned === '10000000' &&
      w.state.personal.cash === '0',
    `${network}: controlled earnings must remain in security until released.`,
  );
  await w.deny('landlord', { type: 'plan', kind: 'release', amount: '10000000' });
  await w.execute('release', '10000000');
  check(
    w.state.security.assets === '3000000000' && w.state.personal.cash === '10000000',
    `${network}: eligible earnings must move to the separate personal portfolio.`,
  );
  await w.execute('buy', '10000000', { fail: true });
  await w.execute('buy', '10000000');
  const units = (10n ** BigInt(network === 'robinhood' ? 18 : 8) / 50n).toString();
  check(
    w.state.personal.units === units && w.state.personal.cash === '0',
    `${network}: sample investment quantity or stablecoin spend is incorrect.`,
  );
  await w.command('tenant', { type: 'fixture_distribution' });
  check(
    w.state.personal.units === units &&
      w.state.personal.multiplier === '1050000000000000000' &&
      w.state.personal.cash === '0',
    `${network}: accumulating fixture must change represented exposure without minting raw units or cash.`,
  );
  const half = (BigInt(units) / 2n).toString();
  await w.execute('sell', half);
  check(
    w.state.personal.cash === '5250000' && w.state.personal.units === half,
    `${network}: half-sale proceeds must reflect the accumulating fixture.`,
  );
  await w.execute('withdraw', '5250000');
  check(
    w.state.personal.cash === '0' && w.state.personal.withdrawn === '5250000',
    `${network}: personal withdrawal amount is incorrect.`,
  );
  const personal = fingerprint(w.state.personal);
  await w.deny('tenant', {
    type: 'claim',
    amount: '120000000',
    reason: 'Only the assigned landlord can propose a claim.',
  });
  await w.command('landlord', {
    type: 'claim',
    amount: '120000000',
    reason: 'Fictional agreed repair recorded in the condition inventory.',
  });
  check(
    w.state.settlement === null && w.state.security.assets === '3000000000',
    `${network}: a proposed claim must not pay the landlord.`,
  );
  await w.command('tenant', { type: 'accept_claim' });
  check(
    w.state.settlement === null,
    `${network}: agreement records an allocation before reconciliation pays it.`,
  );
  await w.execute('settle');
  check(
    w.state.stage === 'closed' &&
      w.state.settlement?.landlord === '120000000' &&
      w.state.settlement?.tenant === '2880000000' &&
      w.state.security.assets === '0',
    `${network}: ordinary settlement must pay 120 and return 2,880.`,
  );
  check(
    fingerprint(w.state.personal) === personal && w.state.personal.units === half,
    `${network}: tenant investments must survive settlement untouched.`,
  );
  await w.persistence();
  console.log(
    `PASS ${network}: 3,000 security → 10 released → failed/retried buy → accumulating exposure → partial sale/withdrawal → 120 claim + 2,880 refund; portfolio persists.`,
  );
  return w;
}

async function contested(network) {
  const w = await workspace(network);
  await w.agreements();
  await w.execute('fund');
  await w.execute('supply');
  await w.command('landlord', {
    type: 'claim',
    amount: '120000000',
    reason: 'Fictional disputed repair supported by the landlord inventory.',
  });
  await w.command('tenant', {
    type: 'dispute',
    reason: 'The move-in inventory already records the same condition.',
  });
  await w.deny('landlord', {
    type: 'award',
    amount: '120000000',
    reason: 'The landlord cannot act as the assigned arbitrator.',
  });
  await w.deny('arbitrator', {
    type: 'award',
    amount: '120000001',
    reason: 'This intentionally exceeds the requested claim by one atomic unit.',
  });
  await w.deny('tenant', { type: 'plan', kind: 'settle' });
  await w.command('arbitrator', {
    type: 'award',
    amount: '120000000',
    reason: 'Fictional human decision reviewed both condition records.',
  });
  check(
    w.state.claim.state === 'awarded' &&
      w.state.settlement === null &&
      w.state.security.assets === '3000000000',
    `${network}: the arbitration decision must not book payment before confirmation.`,
  );
  await w.command('tenant', { type: 'fixture_liquidity', available: false });
  await w.deny('arbitrator', { type: 'plan', kind: 'settle' });
  await w.command('tenant', { type: 'fixture_liquidity', available: true });
  await w.execute('settle', undefined, { role: 'arbitrator' });
  check(
    w.state.stage === 'closed' &&
      w.state.settlement?.landlord === '120000000' &&
      w.state.settlement?.tenant === '2880000000',
    `${network}: contested settlement must honor the bounded human allocation.`,
  );
  await w.persistence();
  console.log(
    `PASS ${network}: disputed 120 claim → assigned human decision → liquidity gate → 120/2,880 settlement and persisted reload.`,
  );
}

async function nativeAuthorizationBoundary(browser) {
  await browser.request('/api/finance/robinhood', { statuses: [401, 403] });
  await browser.request('/api/finance/robinhood/operations', {
    method: 'POST',
    body: { operationId: randomUUID(), walletId: 'fixture_browser', intent: { kind: 'fund' } },
    statuses: [401, 403],
  });
  const solana = await browser.request('/api/finance/solana', { statuses: [401, 403, 404] });
  console.log(
    `PASS native boundary: demo cookies grant no Robinhood native access; Solana native route ${solana.status === 404 ? 'is absent' : 'requires verified authorization'}. No native signing or sending attempted.`,
  );
}

try {
  console.log(`Running local HTTP acceptance at ${origin} with fresh fictional sessions.`);
  const robinhood = await ordinary('robinhood');
  await contested('robinhood');
  await ordinary('solana');
  await contested('solana');
  await nativeAuthorizationBoundary(robinhood.browser);
  console.log(
    `PASS: ${assertions} assertions across ${requests} local HTTP requests. All financial effects are labeled fixtures; no credentials or session cookies were printed.`,
  );
} catch (error) {
  console.error(
    `FAIL acceptance: ${error instanceof Error ? error.message : 'Unexpected local test failure.'}`,
  );
  process.exitCode = 1;
}

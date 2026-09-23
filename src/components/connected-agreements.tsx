'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Copy, RefreshCw } from 'lucide-react';
import { parseAmount, type Network } from '@/domain/assets';
import type { getAgreement } from '@/server/agreements';
import { Badge, money } from './workspace-panels';

type AgreementView = Awaited<ReturnType<typeof getAgreement>>;
export function ConnectedAgreements({
  request,
}: {
  request: (path: string, body?: unknown) => Promise<unknown>;
}) {
  const [agreement, setAgreement] = useState<AgreementView | null>(null);
  const [property, setProperty] = useState('');
  const [network, setNetwork] = useState<Network>('solana');
  const [amount, setAmount] = useState('3000');
  const [permitted, setPermitted] = useState(false);
  const [link, setLink] = useState('');
  const [invitation, setInvitation] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [recordName, setRecordName] = useState('');
  const [recordBody, setRecordBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const initialRequest = useRef(request);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('agreement');
    if (!id || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return;
    let active = true;
    void initialRequest
      .current(`/api/agreements/${encodeURIComponent(id)}`)
      .then((result) => {
        if (!active) return;
        setAgreement((result as { agreement: AgreementView }).agreement);
        setIdentifier(id);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : 'Tenancy unavailable.');
      });
    return () => {
      active = false;
    };
  }, []);
  function remember(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('agreement', id);
    window.history.replaceState(null, '', url.pathname + url.search);
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Please retry.');
    } finally {
      setBusy(false);
    }
  }
  async function load(id: string) {
    const result = (await request(`/api/agreements/${encodeURIComponent(id)}`)) as {
      agreement: AgreementView;
    };
    setAgreement(result.agreement);
    setIdentifier(id);
    remember(id);
  }
  async function invite(role: 'tenant' | 'arbitrator') {
    if (!agreement) return;
    const result = (await request(`/api/agreements/${agreement.id}`, {
      action: 'invite',
      role,
    })) as { invitation: { id: string; role: string; token: string } };
    setLink(
      `${window.location.origin}/#invitation=${encodeURIComponent(JSON.stringify(result.invitation))}`,
    );
  }
  async function join() {
    const raw = invitation || window.location.href;
    const fragment = new URL(raw).hash;
    const encoded = new URLSearchParams(fragment.slice(1)).get('invitation');
    if (!encoded) throw new Error('Paste the complete invitation link.');
    const value = JSON.parse(encoded);
    if (!value || typeof value.id !== 'string') throw new Error('The invitation is invalid.');
    const result = (await request(`/api/agreements/${encodeURIComponent(value.id)}`, {
      action: 'join',
      role: value.role,
      token: value.token,
    })) as { agreement: AgreementView };
    setAgreement(result.agreement);
    setInvitation('');
    setIdentifier(result.agreement.id);
    remember(result.agreement.id);
    setMessage('You joined with your verified account. Review the full terms before acceptance.');
  }
  const allAccepted = agreement?.accepted.landlord && agreement.accepted.tenant;
  return (
    <section className="card operation-section">
      <div className="section-heading">
        <h2>A tenancy with verified participants</h2>
        <Badge tone="neutral">Connected accounts</Badge>
      </div>
      <p className="section-copy">
        Create or join using your signed-in account. These records use actual account membership;
        the demonstration role selector has no authority here.
      </p>
      {message && (
        <p role="status" className="note">
          {message}
        </p>
      )}
      {!agreement ? (
        <div className="two-panels">
          <form
            className="connection-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const result = (await request('/api/agreements', {
                  network,
                  property,
                  requiredSecurity: parseAmount(amount),
                  releaseAllowed: permitted,
                })) as { agreement: AgreementView };
                setAgreement(result.agreement);
                setIdentifier(result.agreement.id);
                remember(result.agreement.id);
              });
            }}
          >
            <h3>Create as landlord</h3>
            <label>
              Property label
              <input
                required
                maxLength={120}
                value={property}
                onChange={(e) => setProperty(e.target.value)}
                placeholder="A label all participants recognize"
              />
            </label>
            <label>
              Network
              <select value={network} onChange={(e) => setNetwork(e.target.value as Network)}>
                <option value="solana">Solana · test USDC</option>
                <option value="robinhood">Robinhood · USDG</option>
              </select>
            </label>
            <label>
              Required security
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="policy-check">
              <input
                type="checkbox"
                checked={permitted}
                onChange={(e) => setPermitted(e.target.checked)}
              />
              This test agreement permits eligible earnings release above the security requirement.
            </label>
            <button className="button primary" disabled={busy}>
              Create recorded agreement <ArrowRight size={16} />
            </button>
          </form>
          <div>
            <form
              className="connection-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(join);
              }}
            >
              <h3>Join an invitation</h3>
              <p className="section-copy">
                An invitation assigns one role. Only the current provider-verified wallet can accept
                it.
              </p>
              <label>
                Invitation link
                <input
                  value={invitation}
                  onChange={(e) => setInvitation(e.target.value)}
                  placeholder="Paste the complete private link"
                />
              </label>
              <button className="button secondary" disabled={busy}>
                Join with this account
              </button>
            </form>
            <form
              className="connection-form operation-section"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => load(identifier));
              }}
            >
              <h3>Return to your tenancy</h3>
              <label>
                Tenancy identifier
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </label>
              <button className="button secondary" disabled={busy}>
                Open verified tenancy
              </button>
            </form>
          </div>
        </div>
      ) : (
        <>
          <div className="two-panels">
            <div>
              <h3>{agreement.property}</h3>
              <dl className="detail-list">
                <div>
                  <dt>Your recorded role</dt>
                  <dd>{agreement.role}</dd>
                </div>
                <div>
                  <dt>Required security</dt>
                  <dd>
                    {money(agreement.requiredSecurity)}{' '}
                    {agreement.network === 'solana' ? 'USDC' : 'USDG'}
                  </dd>
                </div>
                <div>
                  <dt>Eligible earnings release</dt>
                  <dd>
                    {agreement.releaseAllowed
                      ? 'Allowed by this test agreement'
                      : 'Retained until settlement'}
                  </dd>
                </div>
                <div>
                  <dt>Custody deployment</dt>
                  <dd>Must match the accepted agreement digest</dd>
                </div>
              </dl>
              <div className="button-row">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => run(() => load(agreement.id))}
                >
                  <RefreshCw size={15} />
                  Refresh participants
                </button>
                {agreement.digest &&
                  agreement.role !== 'arbitrator' &&
                  !agreement.accepted[agreement.role] && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const result = (await request(`/api/agreements/${agreement.id}`, {
                            action: 'accept',
                            digest: agreement.digest,
                          })) as { agreement: AgreementView };
                          setAgreement(result.agreement);
                        })
                      }
                    >
                      Accept these recorded terms
                    </button>
                  )}
              </div>
              {allAccepted && (
                <p className="note">
                  Both parties accepted the same terms. This records consent; the deposit becomes
                  funded only after a verified custody transaction.
                </p>
              )}
            </div>
            <div>
              <h3>People and acceptance</h3>
              <ul className="connection-list">
                {(['landlord', 'tenant', 'arbitrator'] as const).map((role) => (
                  <li key={role}>
                    <div>
                      <strong>{role[0].toUpperCase() + role.slice(1)}</strong>
                      <p>
                        {agreement.parties[role]
                          ? role === 'arbitrator'
                            ? 'Assigned verified account'
                            : agreement.accepted[role]
                              ? 'Accepted these terms'
                              : 'Joined · acceptance pending'
                          : 'Invitation needed'}
                      </p>
                      {agreement.parties[role] && (
                        <code className="mono">{agreement.parties[role]?.wallet.address}</code>
                      )}
                    </div>
                    {agreement.role === 'landlord' &&
                      role !== 'landlord' &&
                      !agreement.parties[role] && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => run(() => invite(role))}
                        >
                          Create private invite
                        </button>
                      )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <section className="operation-section">
            <h3>Private shared evidence</h3>
            {agreement.records.map((record) => (
              <article className="record-item" key={record.id}>
                <h3>{record.name}</h3>
                <p className="record-body">{record.body}</p>
                <span className="small-copy">{new Date(record.at).toLocaleString()}</span>
              </article>
            ))}
            <form
              className="record-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const result = (await request(`/api/agreements/${agreement.id}`, {
                    action: 'record',
                    name: recordName,
                    body: recordBody,
                  })) as { agreement: AgreementView };
                  setAgreement(result.agreement);
                  setRecordBody('');
                  setRecordName('');
                });
              }}
            >
              <label>
                Record title
                <input
                  value={recordName}
                  onChange={(e) => setRecordName(e.target.value)}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                Evidence or explanation
                <textarea
                  value={recordBody}
                  onChange={(e) => setRecordBody(e.target.value)}
                  maxLength={12000}
                  required
                />
              </label>
              <button
                className="button secondary"
                disabled={busy || recordName.trim().length < 3 || recordBody.trim().length < 12}
              >
                Save private shared record
              </button>
            </form>
          </section>
          <details>
            <summary>Tenancy and consent identifiers</summary>
            <p className="small-copy">
              Keep the tenancy identifier to reopen it. The digest fixes the network, amount, policy
              and participant wallets.
            </p>
            <pre className="proof-code">
              {JSON.stringify(
                { id: agreement.id, digest: agreement.digest, accepted: agreement.accepted },
                null,
                2,
              )}
            </pre>
          </details>
          <button
            className="text-button"
            onClick={() => {
              setAgreement(null);
              setLink('');
              const url = new URL(window.location.href);
              url.searchParams.delete('agreement');
              window.history.replaceState(null, '', url.pathname + url.search);
            }}
          >
            Open another tenancy
          </button>
        </>
      )}
      {link && (
        <div className="operation-section">
          <h3>Private invitation · expires in 24 hours</h3>
          <p className="section-copy">
            Share this link directly with the intended person. It can be redeemed once. Creating
            another invitation for the same role replaces this one.
          </p>
          <pre className="proof-code">{link}</pre>
          <button
            className="button secondary"
            onClick={() =>
              run(async () => {
                await navigator.clipboard.writeText(link);
                setMessage('Invitation copied.');
              })
            }
          >
            <Copy size={16} />
            Copy invitation
          </button>
        </div>
      )}
    </section>
  );
}

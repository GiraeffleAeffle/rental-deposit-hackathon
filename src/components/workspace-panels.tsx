'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  CircleHelp,
  FileText,
  LockKeyhole,
  Plus,
  Scale,
  ShieldCheck,
  Sprout,
  Wallet,
  X,
} from 'lucide-react';
import { displayAmount, networks, parseAmount, type Role } from '@/domain/assets';
import {
  summary,
  type Command,
  type FinancialOperation,
  type OperationKind,
  type WorkspaceState,
} from '@/domain/workflow';
import { savingsProjection } from '@/domain/rental';
import type { View } from './workspace';

export const money = (amount: string) => `$${displayAmount(amount)}`;
export const kindLabels: Record<OperationKind, string> = {
  contribute: 'Add personal savings',
  fund: 'Fund deposit',
  supply: 'Start lending',
  release: 'Release earnings',
  buy: 'Buy investment',
  sell: 'Sell investment',
  withdraw: 'Withdraw personal cash',
  settle: 'Pay settlement',
};
export function Badge({
  children,
  tone = 'green',
}: {
  children: ReactNode;
  tone?: 'green' | 'amber' | 'neutral';
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <section className="metric card">
      <div className="section-heading">
        <span className="card-label">{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}

export function DepositSnapshot({ state, open }: { state: WorkspaceState; open?: () => void }) {
  const totals = summary(state);
  return (
    <section className="card deposit-snapshot">
      <div className="section-heading">
        <span className="card-label">
          <LockKeyhole size={17} />
          RENTAL SECURITY
        </span>
        <Badge tone={state.stage === 'closed' ? 'green' : 'neutral'}>
          {state.stage === 'closed'
            ? 'Settled'
            : state.security.principal === '0'
              ? 'Awaiting funding'
              : 'Held for the tenancy'}
        </Badge>
      </div>
      <div className="deposit-value">
        {money(state.security.assets)}
        <span>{networks[state.network].currency}</span>
      </div>
      <dl className="detail-list">
        <div>
          <dt>Required security</dt>
          <dd>{money(state.security.required)}</dd>
        </div>
        <div>
          <dt>Earnings retained</dt>
          <dd>{money(totals.retainedEarnings)}</dd>
        </div>
        <div>
          <dt>Eligible to release</dt>
          <dd>{money(totals.releasable)}</dd>
        </div>
        <div>
          <dt>Lending status</dt>
          <dd>{state.security.supplied ? 'Supplied in example' : 'Not supplied'}</dd>
        </div>
      </dl>
      {open && (
        <button className="text-button" onClick={open}>
          Understand your deposit <ArrowRight size={16} />
        </button>
      )}
    </section>
  );
}

type Actions = {
  state: WorkspaceState;
  role: Role;
  busy: boolean;
  command: (command: Command) => Promise<void>;
  plan: (kind: OperationKind, amount?: string) => Promise<void>;
  navigate: (view: View) => void;
};
export function NextStep({ state, role, busy, command, plan, navigate }: Actions) {
  let title = 'Your next chapter is taking shape.';
  let text = 'Review the activity or explore another part of the tenancy.';
  let label = 'View activity';
  let action = () => navigate('activity');
  let disabled = busy || summary(state).pending;
  if (state.stage === 'draft') {
    const ownAccepted = role === 'arbitrator' || state.accepted[role];
    title = ownAccepted
      ? 'Waiting for both parties to agree.'
      : 'Start with an agreement you understand.';
    text = `Tenant: ${state.accepted.tenant ? 'accepted' : 'awaiting acceptance'}. Landlord: ${state.accepted.landlord ? 'accepted' : 'awaiting acceptance'}. The 3,000-unit security and earnings release policy are recorded together.`;
    label = ownAccepted ? 'Review shared agreement' : 'Accept example agreement';
    action = ownAccepted
      ? () => navigate('records')
      : () => {
          void command({ type: 'accept' });
        };
  } else if (state.stage === 'accepted') {
    title = 'The agreement is ready to fund.';
    text = 'The tenant confirms a 3,000-unit deposit. It becomes funded only after reconciliation.';
    label = 'Fund deposit';
    action = () => {
      void plan('fund');
    };
    disabled ||= role !== 'tenant';
  } else if (state.stage === 'active' && !state.security.supplied) {
    title = 'Let the eligible earnings journey begin.';
    text =
      'Supply the funded security to the example lending position. The deposit remains subject to the tenancy rules.';
    label = 'Supply deposit';
    action = () => {
      void plan('supply');
    };
    disabled ||= role !== 'tenant';
  } else if (state.stage === 'active' && summary(state).releasable !== '0' && role === 'tenant') {
    title = `${money(summary(state).releasable)} can start something of your own.`;
    text =
      'Release eligible earnings into personal cash. The required security stays in the deposit.';
    label = 'Release earnings';
    action = () => {
      void plan('release', summary(state).releasable);
    };
  } else if (state.stage === 'active' && role === 'tenant' && state.personal.cash !== '0') {
    title = 'Your personal cash is ready for its next step.';
    text = 'Review an investment or withdraw the settled cash. Your deposit stays separate.';
    label = 'Review investment';
    action = () => {
      void plan('buy', state.personal.cash);
    };
  } else if (state.stage === 'active' && role === 'tenant' && state.personal.units !== '0') {
    title = 'Your first holding has a life beyond this home.';
    text =
      'Keep following your personal assets while the rental security stays reserved for the tenancy.';
    label = 'Review your activity';
    action = () => navigate('activity');
  } else if (state.stage === 'active') {
    title =
      role === 'landlord'
        ? 'A shared record makes settlement clearer.'
        : 'Explore the first contribution.';
    text =
      role === 'landlord'
        ? 'When the tenancy ends, propose a deduction with evidence. The tenant can agree or request review.'
        : 'Use a controlled earnings event to explore release, investing and withdrawal.';
    label = role === 'landlord' ? 'Prepare settlement' : 'Explore earnings';
    action = () => navigate(role === 'landlord' ? 'settlement' : 'deposit');
  } else if (state.stage === 'closing') {
    title =
      state.claim.state === 'disputed'
        ? 'The claim is with the assigned arbitrator.'
        : 'A clear settlement needs the next confirmation.';
    text =
      'A recorded decision and a completed payout are separate steps. Personal investments remain independent.';
    label = 'Open settlement';
    action = () => navigate('settlement');
  } else if (state.stage === 'closed') {
    title = 'A tenancy ends. Your portfolio continues.';
    text =
      'The recorded security allocation is complete. The tenant can still manage personal cash and holdings.';
    label = 'View completed settlement';
    action = () => navigate('settlement');
  }
  return (
    <section className="action-card next-step">
      <div className="action-icon">
        <Sprout size={23} />
      </div>
      <div>
        <span className="eyebrow">YOUR NEXT STEP</span>
        <h2>{title}</h2>
        <p>{text}</p>
        <button className="button primary" disabled={disabled} onClick={action}>
          {label}
          <ArrowRight size={17} />
        </button>
      </div>
    </section>
  );
}

export function PortfolioActions({
  state,
  busy,
  plan,
  command,
}: {
  state: WorkspaceState;
  busy: boolean;
  plan: Actions['plan'];
  command: Actions['command'];
}) {
  const [contribution, setContribution] = useState('25');
  const [contributionError, setContributionError] = useState('');
  return (
    <section className="card">
      <div className="section-heading">
        <span className="card-label">
          <Wallet size={17} />
          PERSONAL CASH & HOLDINGS
        </span>
        <Badge tone="neutral">Sample instrument</Badge>
      </div>
      <dl className="detail-list">
        <div>
          <dt>Cash available</dt>
          <dd>{money(state.personal.cash)}</dd>
        </div>
        <div>
          <dt>Sample equity exposure</dt>
          <dd>{money(summary(state).investmentValue)}</dd>
        </div>
        <div>
          <dt>Cash withdrawn</dt>
          <dd>{money(state.personal.withdrawn)}</dd>
        </div>
      </dl>
      <div className="button-row">
        <button
          className="button secondary"
          disabled={busy || state.personal.units === '0'}
          onClick={() => plan('sell')}
        >
          Sell holding <ArrowDownLeft size={16} />
        </button>
        <button
          className="button secondary"
          disabled={busy || state.personal.cash === '0'}
          onClick={() => plan('withdraw', state.personal.cash)}
        >
          Withdraw cash <ArrowUpRight size={16} />
        </button>
      </div>
      <form
        className="contribution-form"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            setContributionError('');
            void plan('contribute', parseAmount(contribution));
          } catch (e) {
            setContributionError(e instanceof Error ? e.message : 'Enter a savings amount.');
          }
        }}
      >
        <label>
          Optional personal savings
          <input
            aria-label="Personal savings amount"
            value={contribution}
            onChange={(e) => setContribution(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <button className="button secondary" disabled={busy}>
          Add example savings <Plus size={16} />
        </button>
        <p className="small-copy">
          Separate contributions: {money(state.personal.contributed)}. Savings do not increase the
          landlord’s security claim.
        </p>
        {contributionError && <p role="alert">{contributionError}</p>}
      </form>
      <details className="small-details">
        <summary>Explore an accumulating return</summary>
        <p>
          A controlled 5% exposure change increases the sample holding’s value. It does not pay a
          separate cash dividend.
        </p>
        <button
          className="text-button"
          disabled={busy || state.personal.units === '0'}
          onClick={() => command({ type: 'fixture_distribution' })}
        >
          Apply example event <Plus size={16} />
        </button>
      </details>
    </section>
  );
}

export function Settlement({
  state,
  role,
  busy,
  command,
  plan,
}: {
  state: WorkspaceState;
  role: Role;
  busy: boolean;
  command: Actions['command'];
  plan: Actions['plan'];
}) {
  const [amount, setAmount] = useState('120');
  const [reason, setReason] = useState(
    role === 'tenant'
      ? 'The move-in record already shows the disputed wall damage.'
      : role === 'arbitrator'
        ? 'Both condition records support this allocation of the repair cost.'
        : 'The move-out condition record includes a wall repair estimate.',
  );
  const [error, setError] = useState('');
  function submit(type: 'claim' | 'award') {
    try {
      setError('');
      void command({ type, amount: parseAmount(amount), reason });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enter an amount.');
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="A FAIR AND UNDERSTANDABLE CLOSE"
        title="Bring the tenancy to a clear finish."
        text="Review the claim, consider both accounts and keep the final payment distinct from the decision."
      />
      <div className="case-grid">
        <section className="card">
          <div className="section-heading">
            <span className="eyebrow">CLAIM & EVIDENCE</span>
            <Badge tone={state.claim.state === 'disputed' ? 'amber' : 'neutral'}>
              {state.claim.state === 'none' ? 'No claim' : state.claim.state}
            </Badge>
          </div>
          <h2 className="section-title">
            {state.claim.state === 'none'
              ? 'Prepare a settlement proposal'
              : `${money(state.claim.amount)} requested`}
          </h2>
          {state.claim.reason && <p className="section-copy">{state.claim.reason}</p>}
          {state.claim.response && (
            <div className="account-story">
              <span className="avatar small">M</span>
              <div>
                <strong>Tenant’s response</strong>
                <p>{state.claim.response}</p>
              </div>
            </div>
          )}
          {state.claim.decision && (
            <div className="account-story">
              <span className="avatar small">J</span>
              <div>
                <strong>Arbitrator’s decision</strong>
                <p>{state.claim.decision}</p>
              </div>
            </div>
          )}
          {role === 'landlord' && state.claim.state === 'none' && (
            <form
              className="case-actions"
              onSubmit={(event) => {
                event.preventDefault();
                submit('claim');
              }}
            >
              <label htmlFor="claim-amount">
                Requested deduction ({networks[state.network].currency})
              </label>
              <input
                id="claim-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <label htmlFor="claim-reason">Reason and evidence</label>
              <textarea
                id="claim-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button className="button primary" disabled={busy || state.stage !== 'active'}>
                Propose settlement <ArrowRight size={16} />
              </button>
            </form>
          )}
          {role === 'tenant' && state.claim.state === 'proposed' && (
            <div className="case-actions">
              <button
                className="button primary"
                disabled={busy}
                onClick={() => command({ type: 'accept_claim' })}
              >
                Agree to this deduction <Check size={17} />
              </button>
              <label htmlFor="response">Or explain why you request human review</label>
              <textarea id="response" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button
                className="button secondary"
                disabled={busy || reason.trim().length < 12}
                onClick={() => command({ type: 'dispute', reason })}
              >
                Request assigned review <Scale size={17} />
              </button>
            </div>
          )}
          {role === 'arbitrator' && state.claim.state === 'disputed' && (
            <form
              className="case-actions"
              onSubmit={(event) => {
                event.preventDefault();
                submit('award');
              }}
            >
              <label htmlFor="award">
                Landlord allocation ({networks[state.network].currency})
              </label>
              <input
                id="award"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <label htmlFor="decision">Reasoned decision</label>
              <textarea id="decision" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="button primary" disabled={busy}>
                Record decision <Scale size={17} />
              </button>
            </form>
          )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {state.claim.state === 'none' && role !== 'landlord' && (
            <p className="section-copy">
              The landlord can propose a settlement after funding. Use the demonstration role switch
              to explore that step.
            </p>
          )}
        </section>
        <section className="card settlement-card">
          <span className="eyebrow">THE RECORDED ALLOCATION</span>
          <h2>
            {state.stage === 'closed' ? 'Settlement completed.' : 'Nothing is paid on assumption.'}
          </h2>
          <dl className="detail-list">
            <div>
              <dt>To landlord</dt>
              <dd>
                {state.settlement
                  ? money(state.settlement.landlord)
                  : state.claim.allocation !== null
                    ? money(state.claim.allocation)
                    : 'Undecided'}
              </dd>
            </div>
            <div>
              <dt>Security returned to tenant</dt>
              <dd>
                {state.settlement
                  ? money(state.settlement.tenant)
                  : state.claim.allocation !== null
                    ? money(
                        (BigInt(state.security.assets) - BigInt(state.claim.allocation)).toString(),
                      )
                    : 'Undecided'}
              </dd>
            </div>
            <div>
              <dt>Payment status</dt>
              <dd>{state.stage === 'closed' ? 'Reconciled fixture' : 'Not completed'}</dd>
            </div>
          </dl>
          <div className="note">
            <ShieldCheck size={18} />
            <span>Personal cash and investments remain outside this settlement.</span>
          </div>
          {['accepted', 'awarded'].includes(state.claim.state) && (
            <button
              className="button primary"
              disabled={busy || (role === 'arbitrator' && state.claim.state !== 'awarded')}
              onClick={() => plan('settle')}
            >
              Review settlement payment <ArrowRight size={17} />
            </button>
          )}
          {state.stage === 'closed' && <Badge>Example payments reconciled</Badge>}
        </section>
      </div>
    </>
  );
}

export function Records({
  state,
  busy,
  command,
}: {
  state: WorkspaceState;
  busy: boolean;
  command: Actions['command'];
}) {
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  return (
    <>
      <PageHeading
        eyebrow="SHARED BY THE PEOPLE INVOLVED"
        title="The details belong in one place."
        text="A condition record, a clear agreement and both accounts help everyone understand what happened."
      />
      <div className="record-grid">
        {state.documents.map((document) => (
          <article className="record-card" key={document.id}>
            <FileText size={25} />
            <h2>{document.name}</h2>
            <p>{document.body}</p>
            <span className="small-copy">
              Recorded {new Date(document.createdAt).toLocaleDateString()}
            </span>
          </article>
        ))}
      </div>
      <form
        className="card record-form"
        onSubmit={(event) => {
          event.preventDefault();
          void command({ type: 'document', name, body });
        }}
      >
        <h2>Add an example record</h2>
        <p>Use fictional information only in the demonstration.</p>
        <label htmlFor="record-name">Record title</label>
        <input
          id="record-name"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <label htmlFor="record-body">Condition, evidence or explanation</label>
        <textarea
          id="record-body"
          value={body}
          maxLength={12000}
          onChange={(event) => setBody(event.target.value)}
          required
        />
        <button
          className="button primary"
          disabled={busy || name.trim().length < 3 || body.trim().length < 12}
        >
          Save shared record <Plus size={16} />
        </button>
      </form>
    </>
  );
}

export function Journey({ state }: { state: WorkspaceState }) {
  const stages = [
    { label: 'Agree', done: state.accepted.tenant && state.accepted.landlord },
    { label: 'Fund', done: state.security.principal !== '0' },
    { label: 'Earn', done: state.security.earned !== '0' },
    { label: 'Build assets', done: state.personal.spent !== '0' },
    { label: 'Move forward', done: state.stage === 'closed' },
  ];
  return (
    <section className="card journey">
      <h2>One tenancy. A longer horizon.</h2>
      <div className="journey-steps">
        {stages.map((stage, index) => (
          <div key={stage.label} className={`journey-step ${stage.done ? 'complete' : ''}`}>
            <span>{stage.done ? <Check size={12} /> : index + 1}</span>
            <strong>{stage.label}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Projection() {
  const [monthly, setMonthly] = useState(25);
  const [rate, setRate] = useState(5);
  const points = savingsProjection(monthly * 100, 9000, rate, 8);
  const last = points[7];
  return (
    <section className="card projection">
      <div>
        <span className="eyebrow">AN EIGHT-YEAR ILLUSTRATION</span>
        <h2>Small additions change the picture.</h2>
        <p>
          Assumes $90 of eligible released earnings each year plus your chosen savings.
          Contributions enter at year-end. Values are hypothetical, before costs and tax;
          investments can lose value.
        </p>
        <label>
          Monthly personal savings <strong>${monthly}</strong>
          <input
            type="range"
            min="0"
            max="200"
            step="5"
            value={monthly}
            onChange={(event) => setMonthly(Number(event.target.value))}
          />
        </label>
        <label>
          Assumed annual investment return <strong>{rate}%</strong>
          <input
            type="range"
            min="0"
            max="10"
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
          />
        </label>
      </div>
      <div>
        <div className="projection-value">
          <span>Illustrated value after eight years</span>
          <strong>
            ${(last.balanceCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </strong>
          <p>${(last.contributionCents / 100).toLocaleString('en-US')} contributed</p>
        </div>
        <div className="wealth-bars" aria-label="Illustrated portfolio value by year">
          {points.map((point) => (
            <div key={point.year}>
              <span
                style={{
                  height: `${Math.max(4, (point.balanceCents / Math.max(1, last.balanceCents)) * 110)}px`,
                }}
                title={`Year ${point.year}: $${(point.balanceCents / 100).toFixed(2)}`}
              />
              <small>{point.year}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ConfirmOperation({
  operation,
  currency,
  busy,
  close,
  confirm,
}: {
  operation: FinancialOperation | null;
  currency: string;
  busy: boolean;
  close: () => void;
  confirm: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (operation && !ref.current?.open) ref.current?.showModal();
    else if (!operation && ref.current?.open) ref.current.close();
  }, [operation]);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClose={close}
      className="record-dialog confirmation-dialog"
    >
      {operation && (
        <>
          <div className="section-heading">
            <span className="eyebrow">REVIEW BEFORE CONFIRMING</span>
            <button
              className="icon-button"
              aria-label="Close confirmation"
              disabled={busy}
              onClick={close}
            >
              <X size={19} />
            </button>
          </div>
          <ShieldCheck size={29} />
          <h2>{kindLabels[operation.kind]}</h2>
          <p>
            This confirms a controlled demonstration instruction. The result is recorded separately
            when you check reconciliation.
          </p>
          <dl className="detail-list">
            <div>
              <dt>{operation.kind === 'sell' ? 'Holding units (atomic)' : 'Amount'}</dt>
              <dd>
                {operation.kind === 'sell'
                  ? operation.amount
                  : `${money(operation.amount)} ${currency}`}
              </dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>
                {operation.recipient === 'recorded-settlement-parties'
                  ? 'Recorded landlord and tenant'
                  : operation.recipient.startsWith('escrow:')
                    ? 'This tenancy’s escrow'
                    : operation.recipient.startsWith('lending:')
                      ? 'Selected example lending position'
                      : 'Tenant’s personal account'}
              </dd>
            </div>
            <div>
              <dt>Trading and network fees</dt>
              <dd>Zero in this fixture</dd>
            </div>
            <div>
              <dt>Authorization expires</dt>
              <dd>{new Date(operation.expiresAt).toLocaleTimeString()}</dd>
            </div>
          </dl>
          <div className="note">
            <CircleHelp size={18} />
            No wallet will sign and no real funds will move in demonstration mode.
          </div>
          <div className="button-row">
            <button className="button primary" disabled={busy} onClick={confirm}>
              Confirm example instruction <CheckCheck size={17} />
            </button>
            <button className="button secondary" disabled={busy} onClick={close}>
              Back
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

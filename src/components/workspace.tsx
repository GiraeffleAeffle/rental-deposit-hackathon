'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  House,
  LayoutDashboard,
  Leaf,
  LockKeyhole,
  MapPin,
  MessageSquareText,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Sprout,
  Wallet,
  X,
} from 'lucide-react';
import {
  balances,
  initialRental,
  money,
  parseCents,
  savingsProjection,
  transition,
  type Action,
  type Rental,
  type Role,
} from '@/domain/rental';

type View = 'overview' | 'case' | 'records' | 'activity' | 'future' | 'compare' | 'about';
const roles: Role[] = ['tenant', 'landlord', 'arbitrator'];
const roleNames = { tenant: 'Tenant', landlord: 'Landlord', arbitrator: 'Arbitrator' };
const stageNames = {
  review: 'Response needed',
  disputed: 'In review',
  agreed: 'Ready for payout',
  awarded: 'Decision recorded',
  paid: 'Settled',
};
const people = { tenant: 'Maya', landlord: 'Alex', arbitrator: 'Jordan' };
const recordContent = {
  agreement: {
    title: 'Tenancy agreement',
    icon: FileText,
    text: 'Fictional record · Cedar Court, apartment 04. Deposit: $800, paid in four $200 installments. Tenancy: September 2025 to September 2026. This example is not a legal agreement or a statement of applicable state law.',
  },
  movein: {
    title: 'Move-in inspection',
    icon: FileCheck2,
    text: 'Fictional condition record · September 2025. Living room: a faint scuff is noted on the wall beside the window. Tenant and landlord acknowledged the written record. No real inspection photographs or signatures are stored in this prototype.',
  },
  moveout: {
    title: 'Move-out inspection',
    icon: FileCheck2,
    text: 'Fictional condition record · September 2026. The landlord reports a larger mark beside the window. The tenant says the original inspection already noted the affected area. These are competing accounts for the demo; neither is an established finding.',
  },
  invoice: {
    title: 'Repair estimate',
    icon: FileText,
    text: 'Fictional estimate · $120 for local preparation, paint, and labor. An estimate by itself does not establish tenant liability. Compare the original condition and the reason for the proposed work.',
  },
};
type RecordKey = keyof typeof recordContent;

function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function Badge({
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

function HouseArt() {
  return (
    <svg
      className="house-art"
      viewBox="0 0 380 166"
      role="img"
      aria-label="Illustration of a neighborhood with trees"
    >
      <path d="M0 155H380" stroke="currentColor" opacity=".25" />
      <path d="M82 154V64L131 22L180 64V154" fill="#d1dfbd" stroke="#527448" strokeWidth="1.5" />
      <path d="M180 154V85L224 48L268 85V154" fill="#a9c193" stroke="#527448" strokeWidth="1.5" />
      <path
        d="M124 154V112H141V154M105 72H122V90H105ZM141 72H158V90H141ZM203 95H219V112H203ZM239 95H255V112H239ZM221 154V128H239V154"
        fill="#faf8ee"
        stroke="#527448"
        strokeWidth="1.5"
      />
      <path
        d="M69 67L131 14L193 67M172 90L224 42L278 90"
        fill="none"
        stroke="#3e653b"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M310 154V103M52 154V112" stroke="#527448" strokeWidth="2" />
      <path
        d="M310 49C267 81 284 116 310 110C337 117 355 80 310 49Z"
        fill="#baceaa"
        stroke="#527448"
        strokeWidth="1.5"
      />
      <path
        d="M52 78C23 99 33 124 52 119C74 123 81 100 52 78Z"
        fill="#d1dfbd"
        stroke="#527448"
        strokeWidth="1.5"
      />
      <circle cx="244" cy="21" r="11" fill="#e9d59d" />
      <path
        d="M110 155C100 146 91 148 92 155M283 154C274 138 261 141 263 154M342 154C353 141 360 145 360 154"
        fill="#a9c193"
      />
    </svg>
  );
}

function RecordModal({ selected, close }: { selected: RecordKey | null; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected && !ref.current?.open) ref.current?.showModal();
    if (!selected && ref.current?.open) ref.current?.close();
  }, [selected]);
  const record = selected ? recordContent[selected] : null;
  return (
    <dialog ref={ref} onCancel={close} onClose={close} className="record-dialog">
      {record && (
        <>
          <div className="section-heading">
            <span className="eyebrow">SAMPLE RECORD</span>
            <button className="icon-button" onClick={close} aria-label="Close record">
              <X size={20} />
            </button>
          </div>
          <record.icon size={28} />
          <h2>{record.title}</h2>
          <p>{record.text}</p>
          <div className="note">
            <ShieldCheck size={18} />
            Private records would be shared only with the people assigned to this tenancy.
          </div>
          <button className="button primary" onClick={close}>
            Done <Check size={16} />
          </button>
        </>
      )}
    </dialog>
  );
}

export function Workspace() {
  const [role, setRole] = useState<Role>('tenant');
  const [view, setView] = useState<View>('overview');
  const [rental, setRental] = useState(initialRental);
  const [record, setRecord] = useState<RecordKey | null>(null);
  const [notice, setNotice] = useState('');
  const mainRef = useRef<HTMLElement>(null);
  const ledger = balances(rental);

  function navigate(next: View) {
    setView(next);
    setNotice('');
    mainRef.current?.scrollIntoView({ block: 'start' });
  }
  function act(action: Action) {
    try {
      const next = transition(rental, action);
      setRental(next);
      setNotice(next.activity[0].detail);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'This action could not be completed.');
    }
  }
  function downloadLedger() {
    const data = {
      mode: 'fictional-demo',
      currency: 'USD',
      property: 'Cedar Court · Apartment 04',
      balances: ledger,
      ...rental,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sample-settlement-record.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('The sample settlement record was downloaded. It contains fictional demo data.');
  }
  const nav = [
    { view: 'overview' as View, label: 'Overview', icon: LayoutDashboard },
    { view: 'case' as View, label: 'Claim & settlement', icon: Scale },
    { view: 'records' as View, label: 'Tenancy records', icon: FileText },
    { view: 'activity' as View, label: 'Activity', icon: Clock3 },
    ...(role === 'tenant'
      ? [{ view: 'future' as View, label: 'Your next chapter', icon: Sprout }]
      : []),
  ];
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate('overview')}
          aria-label="Deposit workspace home"
        >
          <Mark />
          <span>
            Deposit
            <br />
            <strong>workspace</strong>
          </span>
        </button>
        <div className="workspace-picker">
          <span className="avatar small">{people[role][0]}</span>
          <div>
            <strong>{people[role]}’s workspace</strong>
            <span>{roleNames[role]} view</span>
          </div>
          <span className="tiny-dot" />
        </div>
        <span className="nav-caption">YOUR WORKSPACE</span>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.view}
              className={`nav-item ${view === item.view ? 'selected' : ''}`}
              aria-current={view === item.view ? 'page' : undefined}
              onClick={() => navigate(item.view)}
            >
              <item.icon size={18} />
              {item.label}
              {item.view === 'case' && ['review', 'disputed'].includes(rental.stage) && (
                <span className="nav-count">1</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Leaf size={20} />
            <strong>A clearer way home.</strong>
            <p>Know where your deposit stands, from move-in to move-out.</p>
          </div>
          <button
            className={`nav-item ${view === 'compare' ? 'selected' : ''}`}
            onClick={() => navigate('compare')}
          >
            <Wallet size={18} />
            Compare deposit options
          </button>
          <button
            className={`nav-item ${view === 'about' ? 'selected' : ''}`}
            onClick={() => navigate('about')}
          >
            <CircleHelp size={18} />
            About this prototype
          </button>
          <div className="sidebar-foot">
            A new project, taking shape.<span>Brand name to come.</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <House size={16} />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{roleNames[role]}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-label">
              <span />
              Interactive demo
            </span>
            <button
              className="reset-button"
              onClick={() => {
                setRental(initialRental());
                setView('overview');
                setNotice('Demo restarted. All balances and actions are fictional.');
              }}
            >
              <RotateCcw size={15} />
              <span>Restart</span>
            </button>
            <span className="avatar">{people[role][0]}</span>
          </div>
        </header>
        <main id="main" ref={mainRef} className="main-content">
          <div className="demo-toolbar">
            <span>
              <Sparkles size={15} />
              See the same tenancy from every side.
            </span>
            <div className="role-switch" role="group" aria-label="Choose demo role">
              {roles.map((item) => (
                <button
                  key={item}
                  aria-pressed={role === item}
                  onClick={() => {
                    setRole(item);
                    setView('overview');
                    setNotice('');
                  }}
                >
                  {roleNames[item]}
                </button>
              ))}
            </div>
          </div>
          {notice && (
            <div className="notice" role="status">
              <CheckCheck size={18} />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setNotice('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === 'overview' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">MONDAY, SEPTEMBER 21 · SAMPLE WORKSPACE</span>
                  <h1>
                    {role === 'tenant'
                      ? 'Your deposit. In plain sight.'
                      : role === 'landlord'
                        ? 'A little less back-and-forth.'
                        : 'A fair outcome starts here.'}
                  </h1>
                  <p>
                    {role === 'tenant'
                      ? 'Good morning, Maya. Here’s where things stand with your home.'
                      : role === 'landlord'
                        ? 'Good morning, Alex. Here’s what needs your attention.'
                        : 'Good morning, Jordan. Review both accounts before recording a decision.'}
                  </p>
                </div>
                {role === 'tenant' ? (
                  <button
                    className="button primary heading-action"
                    onClick={() => navigate('case')}
                  >
                    {rental.stage === 'review' ? 'Review claim' : 'View settlement'}
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <span className="date-pill">
                    <Clock3 size={15} />
                    {role === 'arbitrator' ? 'Case 004' : 'September 2026'}
                  </span>
                )}
              </div>
              {role === 'tenant' && (
                <>
                  <div className="overview-grid">
                    <div className="stack">
                      <section className="balance-card">
                        <div className="section-heading">
                          <span className="card-label">
                            <LockKeyhole size={17} />
                            YOUR RENTAL DEPOSIT
                          </span>
                          <Badge tone={rental.stage === 'paid' ? 'green' : 'neutral'}>
                            {rental.stage === 'paid' ? 'Payout simulated' : 'Held for your tenancy'}
                          </Badge>
                        </div>
                        <div className="balance-amount">
                          {money(ledger.held)}
                          <span>USD</span>
                        </div>
                        <p className="balance-description">
                          {rental.stage === 'paid'
                            ? 'Your sample settlement is complete.'
                            : 'The full balance remains held while the claim is reviewed.'}
                        </p>
                        <div className="balance-breakdown">
                          <div>
                            <span>Original deposit</span>
                            <strong>{money(rental.principalCents)}</strong>
                          </div>
                          <div>
                            <span>Interest recorded</span>
                            <strong>$0.00</strong>
                          </div>
                          <div>
                            <span>Available to invest</span>
                            <strong>$0.00</strong>
                          </div>
                        </div>
                        <div className="balance-foot">
                          <ShieldCheck size={16} />
                          <span>Fictional ledger · no bank account or wallet connected</span>
                          <button
                            onClick={() => navigate('about')}
                            aria-label="Understand the demo balance"
                          >
                            <ArrowUpRight size={18} />
                          </button>
                        </div>
                      </section>
                      <section className={`action-card ${rental.stage === 'paid' ? 'done' : ''}`}>
                        <div className="action-icon">
                          {rental.stage === 'paid' ? (
                            <CheckCheck size={22} />
                          ) : (
                            <MessageSquareText size={22} />
                          )}
                        </div>
                        <div>
                          <span className="eyebrow">YOUR NEXT STEP</span>
                          <h2>
                            {rental.stage === 'review'
                              ? 'A $120 deduction needs your response.'
                              : rental.stage === 'disputed'
                                ? 'Your case is with the arbitrator.'
                                : rental.stage === 'paid'
                                  ? 'Everything adds up.'
                                  : 'Your settlement is ready.'}
                          </h2>
                          <p>
                            {rental.stage === 'review'
                              ? 'Alex added a wall repair claim. Compare the records, then agree or request a review.'
                              : rental.stage === 'disputed'
                                ? 'The balance stays held. Switch to the arbitrator view to continue this demo.'
                                : rental.stage === 'paid'
                                  ? 'Review the final split and download a copy of your sample record.'
                                  : 'Review the recorded split before simulating the payout.'}
                          </p>
                          <button className="button primary" onClick={() => navigate('case')}>
                            {rental.stage === 'review' ? 'Review the claim' : 'View settlement'}
                            <ArrowRight size={17} />
                          </button>
                        </div>
                      </section>
                    </div>
                    <div className="stack">
                      <section className="future-card">
                        <div className="section-heading">
                          <span className="eyebrow">YOUR NEXT CHAPTER</span>
                          <Sprout size={20} />
                        </div>
                        <h2>
                          Today, a place to live.
                          <br />
                          Tomorrow, room to grow.
                        </h2>
                        <p>
                          Explore a savings plan for your next home, separate from your deposit.
                        </p>
                        <HouseArt />
                        <button className="text-button" onClick={() => navigate('future')}>
                          Explore your plan <ArrowRight size={17} />
                        </button>
                      </section>
                      <HomeCard />
                    </div>
                  </div>
                  <Journey stage={rental.stage} navigate={navigate} />
                </>
              )}
              {role === 'landlord' && (
                <>
                  <div className="metric-grid">
                    <Metric
                      label="Deposits held"
                      value={money(ledger.portfolioHeld)}
                      detail="Across funded sample tenancies"
                      icon={<LockKeyhole size={18} />}
                    />
                    <Metric
                      label="Funding outstanding"
                      value="$800.00"
                      detail="One request · excluded from held total"
                      icon={<ArrowDownLeft size={18} />}
                    />
                    <Metric
                      label="Payouts completed"
                      value={money(ledger.paid)}
                      detail="Simulated · no real funds moved"
                      icon={<CheckCheck size={18} />}
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="card">
                      <div className="section-heading">
                        <h2>Your tenancy overview</h2>
                        <span className="count-label">3 homes</span>
                      </div>
                      <div className="property-row">
                        <span className="property-icon">
                          <Building2 size={23} />
                        </span>
                        <div>
                          <h3>Cedar Court · 04</h3>
                          <p>Maya Chen · $120 repair claim</p>
                          <Badge tone={rental.stage === 'paid' ? 'green' : 'amber'}>
                            {stageNames[rental.stage]}
                          </Badge>
                        </div>
                        <div className="property-money">
                          <strong>{money(ledger.held)}</strong>
                          <span>held</span>
                          <button className="text-button" onClick={() => navigate('case')}>
                            Open <ArrowRight size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="property-row">
                        <span className="property-icon warm">
                          <House size={23} />
                        </span>
                        <div>
                          <h3>Cedar Court · 07</h3>
                          <p>Funding request is outstanding</p>
                          <Badge tone="amber">Awaiting $800</Badge>
                        </div>
                        <div className="property-money">
                          <strong>$0.00</strong>
                          <span>received</span>
                          <button
                            className="text-button"
                            onClick={() =>
                              setNotice(
                                'Sample funding request: $800 requested, $0 received. No payment reminder has been sent.',
                              )
                            }
                          >
                            Details <ArrowRight size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="property-row">
                        <span className="property-icon">
                          <Building2 size={23} />
                        </span>
                        <div>
                          <h3>Juniper House · 02</h3>
                          <p>Active tenancy · no action needed</p>
                          <Badge>Up to date</Badge>
                        </div>
                        <div className="property-money">
                          <strong>$1,200.00</strong>
                          <span>held</span>
                        </div>
                      </div>
                    </section>
                    <section className="card pale">
                      <span className="eyebrow">A SHARED RECORD</span>
                      <h2>
                        Keep everyone
                        <br />
                        on the same page.
                      </h2>
                      <p>
                        Proposed deductions stay separate from approved amounts. Each decision has a
                        reason and a clear next step.
                      </p>
                      <div className="mini-rule">
                        <Scale size={20} />
                        <span>Agreement or a recorded decision comes before payout.</span>
                      </div>
                      <button className="button secondary" onClick={() => navigate('activity')}>
                        See the activity <ArrowRight size={16} />
                      </button>
                    </section>
                  </div>
                </>
              )}
              {role === 'arbitrator' && (
                <CaseView
                  role={role}
                  rental={rental}
                  act={act}
                  openRecord={setRecord}
                  download={downloadLedger}
                />
              )}
            </>
          )}
          {view === 'case' && (
            <>
              <PageHeading
                eyebrow="CEDAR COURT · APARTMENT 04"
                title="One claim. Both sides."
                subtitle="Review the record, understand the proposed split, and choose the next step."
              />
              <CaseView
                role={role}
                rental={rental}
                act={act}
                openRecord={setRecord}
                download={downloadLedger}
              />
            </>
          )}
          {view === 'records' && (
            <>
              <PageHeading
                eyebrow="YOUR SHARED RECORD"
                title="The details, all together."
                subtitle="Fictional tenancy documents, kept close to the decisions they support."
              />
              <div className="record-grid">
                {(
                  Object.entries(recordContent) as [RecordKey, (typeof recordContent)[RecordKey]][]
                ).map(([key, item]) => (
                  <button className="record-card" key={key} onClick={() => setRecord(key)}>
                    <span className="record-icon">
                      <item.icon size={25} />
                    </span>
                    <span className="eyebrow">SAMPLE RECORD</span>
                    <strong>{item.title}</strong>
                    <span>
                      Read the fictional record <ArrowUpRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {view === 'activity' && (
            <>
              <PageHeading
                eyebrow="CEDAR COURT · APARTMENT 04"
                title="A shared story of your deposit."
                subtitle="See what happened, who acted, and what still needs to be done."
              />
              <section className="card timeline-card">
                <div className="section-heading">
                  <h2>Tenancy activity</h2>
                  <button className="button secondary small-button" onClick={downloadLedger}>
                    <Download size={16} />
                    Export sample
                  </button>
                </div>
                {rental.activity.map((item, i) => (
                  <div key={`${item.title}-${i}`} className="timeline-item">
                    <span className={`timeline-dot ${i === 0 ? 'current' : ''}`}>
                      {i === 0 ? <Clock3 size={15} /> : <Check size={14} />}
                    </span>
                    <div>
                      <span className="eyebrow">{item.by}</span>
                      <h3>{item.title}</h3>
                      <p>{item.detail}</p>
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}
          {view === 'future' && <Savings />}
          {view === 'compare' && <Compare />}
          {view === 'about' && (
            <>
              <PageHeading
                eyebrow="PROJECT OVERVIEW"
                title="A clearer deposit journey."
                subtitle="A working product exploration for tenants, landlords, and human arbitrators."
              />
              <div className="overview-grid">
                <section className="card">
                  <h2>What you can try today</h2>
                  <ul className="feature-list">
                    <li>
                      <Check size={18} />
                      Follow one case across all three roles.
                    </li>
                    <li>
                      <Check size={18} />
                      Agree to a deduction or explain a dispute.
                    </li>
                    <li>
                      <Check size={18} />
                      Record a human decision and simulate a payout.
                    </li>
                    <li>
                      <Check size={18} />
                      Compare deposit options and model personal savings.
                    </li>
                    <li>
                      <Check size={18} />
                      Download a sample settlement record.
                    </li>
                  </ul>
                  <div className="note">
                    <CircleHelp size={19} />
                    All people, homes, balances, and records here are fictional. Demo actions reset
                    on reload. Switching roles is for the demo and does not authenticate anyone.
                  </div>
                </section>
                <section className="card pale">
                  <h2>What comes next</h2>
                  <p>
                    Solana is the current recommendation for the hackathon. The chain decision and
                    product name are still open.
                  </p>
                  <div className="roadmap-row">
                    <span>01</span>
                    <div>
                      <strong>Verifiable testnet settlement</strong>
                      <p>Real signing, recipient controls, and transaction receipts.</p>
                    </div>
                  </div>
                  <div className="roadmap-row">
                    <span>02</span>
                    <div>
                      <strong>One reviewed market</strong>
                      <p>A state-specific legal structure, banking partner, and pilot operator.</p>
                    </div>
                  </div>
                  <div className="roadmap-row">
                    <span>03</span>
                    <div>
                      <strong>An optional ownership path</strong>
                      <p>
                        A verified investment provider and separate tenant consent. No property
                        product is connected.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
          <footer className="content-footer">
            <span>
              <ShieldCheck size={14} />
              Fictional data. No real money moves.
            </span>
            <button onClick={() => navigate('about')}>
              What’s in this prototype <ArrowUpRight size={14} />
            </button>
            <button onClick={() => navigate('compare')}>
              Compare options <ArrowUpRight size={14} />
            </button>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.slice(0, 4).map((item) => (
          <button
            key={item.view}
            aria-current={view === item.view ? 'page' : undefined}
            onClick={() => navigate(item.view)}
          >
            <item.icon size={19} />
            <span>
              {item.view === 'case'
                ? 'Settlement'
                : item.view === 'records'
                  ? 'Records'
                  : item.label}
            </span>
          </button>
        ))}
      </nav>
      <RecordModal selected={record} close={() => setRecord(null)} />
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function HomeCard() {
  return (
    <section className="card home-card">
      <div className="section-heading">
        <span className="card-label">YOUR HOME</span>
        <House size={18} />
      </div>
      <h3>Cedar Court · Apartment 04</h3>
      <p className="location">
        <MapPin size={14} />
        Austin, Texas · fictional property
      </p>
      <div className="home-person">
        <span className="avatar small soft">A</span>
        <div>
          <strong>Alex Morgan</strong>
          <span>Your landlord in this demo</span>
        </div>
        <CheckCheck size={16} />
      </div>
    </section>
  );
}

function Metric({
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

function Journey({ stage, navigate }: { stage: Rental['stage']; navigate: (view: View) => void }) {
  return (
    <section className="journey card">
      <div className="section-heading">
        <h2>Your deposit journey</h2>
        <button className="text-button" onClick={() => navigate('activity')}>
          View activity <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="journey-steps">
        {['Agreement', 'Deposit funded', 'Living here', 'Move-out review', 'Settlement'].map(
          (label, i) => (
            <div
              key={label}
              className={`journey-step ${i < 3 || stage === 'paid' ? 'complete' : i === 3 ? 'active' : ''}`}
            >
              <span>{i < 3 || stage === 'paid' ? <Check size={14} /> : i + 1}</span>
              <strong>{label}</strong>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function CaseView({
  role,
  rental,
  act,
  openRecord,
  download,
}: {
  role: Role;
  rental: Rental;
  act: (action: Action) => void;
  openRecord: (key: RecordKey) => void;
  download: () => void;
}) {
  const [response, setResponse] = useState(
    'The marks were already noted in our move-in inspection. Please review both records.',
  );
  const [award, setAward] = useState('60.00');
  const [reason, setReason] = useState('');
  const ledger = balances(rental);
  const cents = parseCents(award);
  const draftValid = cents !== null && cents >= 0 && cents <= rental.claimCents;
  const canPay = rental.stage === 'agreed' || rental.stage === 'awarded';
  const preview =
    rental.awardCents ??
    (role === 'arbitrator' && rental.stage === 'disputed' && draftValid
      ? cents
      : rental.claimCents);
  return (
    <div className="case-grid">
      <section className="card case-card">
        <div className="section-heading">
          <span className="eyebrow">CASE 004 · WALL REPAIR</span>
          <Badge tone={rental.stage === 'paid' ? 'green' : 'amber'}>
            {stageNames[rental.stage]}
          </Badge>
        </div>
        <div className="claim-heading">
          <h2>A wall repair at move-out.</h2>
          <strong>
            {money(rental.claimCents)}
            <span>requested</span>
          </strong>
        </div>
        <div className="accounts">
          <div className="account-story">
            <span className="avatar small soft">A</span>
            <div>
              <span className="eyebrow">LANDLORD’S ACCOUNT</span>
              <p>
                “The wall beside the window needs repainting. I’ve added the move-out record and a
                repair estimate.”
              </p>
              <button className="text-button" onClick={() => openRecord('invoice')}>
                View $120 estimate <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
          <div className="account-story">
            <span className="avatar small sand">M</span>
            <div>
              <span className="eyebrow">TENANT’S ACCOUNT</span>
              <p>“{rental.tenantResponse}”</p>
              <button className="text-button" onClick={() => openRecord('movein')}>
                View move-in record <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        </div>
        <div className="section-heading evidence-heading">
          <h3>Compare the evidence</h3>
          <span className="muted">Fictional records</span>
        </div>
        <div className="evidence-grid">
          <button onClick={() => openRecord('movein')}>
            <FileCheck2 size={23} />
            <strong>Move-in inspection</strong>
            <span>
              September 2025 <ArrowUpRight size={15} />
            </span>
          </button>
          <button onClick={() => openRecord('moveout')}>
            <FileCheck2 size={23} />
            <strong>Move-out inspection</strong>
            <span>
              September 2026 <ArrowUpRight size={15} />
            </span>
          </button>
        </div>
        {['agreed', 'awarded', 'paid'].includes(rental.stage) && (
          <div className="decision-reason">
            <span className="eyebrow">RECORDED REASON</span>
            <p>{rental.reason}</p>
          </div>
        )}
      </section>
      <section className="card settlement-card">
        <span className="eyebrow">
          {rental.stage === 'paid' ? 'COMPLETED SAMPLE SETTLEMENT' : 'SETTLEMENT PREVIEW'}
        </span>
        <h2>Every dollar accounted for.</h2>
        <div className="settlement-total">
          <span>{rental.stage === 'paid' ? 'Original deposit' : 'Balance held'}</span>
          <strong>{money(rental.principalCents)}</strong>
        </div>
        <div className="split-bar" aria-hidden="true">
          <span style={{ width: `${100 - ((preview ?? 0) / rental.principalCents) * 100}%` }} />
          <span />
        </div>
        <div className="split-line">
          <span>
            <i className="legend-dot" />
            Tenant {rental.stage === 'paid' ? 'received (demo)' : 'refund'}
          </span>
          <strong>{money(rental.principalCents - (preview ?? 0))}</strong>
        </div>
        <div className="split-line">
          <span>
            <i className="legend-dot warm" />
            Landlord allocation
          </span>
          <strong>{money(preview ?? 0)}</strong>
        </div>
        <p className="small-copy">
          {rental.stage === 'review' || rental.stage === 'disputed'
            ? 'Proposed amounts only. Nothing is approved or paid yet.'
            : rental.stage === 'paid'
              ? 'Simulated payout complete. No real funds moved.'
              : 'Allocation recorded. The money is still held until payout.'}
        </p>
        {role === 'tenant' && rental.stage === 'review' && (
          <div className="case-actions">
            <button className="button primary full" onClick={() => act({ type: 'agree', role })}>
              Agree to the $120 deduction <Check size={16} />
            </button>
            <div className="or-line">or ask for a human review</div>
            <label htmlFor="tenant-response">Your explanation</label>
            <textarea
              id="tenant-response"
              rows={3}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
            />
            <button
              className="button secondary full"
              disabled={response.trim().length < 12}
              onClick={() => act({ type: 'dispute', role, reason: response })}
            >
              Request a review <Scale size={16} />
            </button>
          </div>
        )}
        {role === 'arbitrator' && rental.stage === 'disputed' && (
          <div className="case-actions">
            <label htmlFor="allocation">Landlord allocation (up to $120)</label>
            <div className="currency-field">
              <span>$</span>
              <input
                id="allocation"
                value={award}
                inputMode="decimal"
                onChange={(e) => setAward(e.target.value)}
                aria-invalid={!draftValid}
              />
            </div>
            {!draftValid && (
              <span className="field-error">
                Enter an amount between $0 and $120, to two decimal places.
              </span>
            )}
            <label htmlFor="decision-reason">Reason for your decision</label>
            <textarea
              id="decision-reason"
              rows={3}
              placeholder="Explain how the evidence supports this allocation…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              className="button primary full"
              disabled={!draftValid || reason.trim().length < 12}
              onClick={() => {
                if (cents !== null) act({ type: 'award', role, cents, reason });
              }}
            >
              Record demo decision <CheckCheck size={16} />
            </button>
            <p className="small-copy">
              The $60 starting value is a placeholder, not a recommendation. Your decision requires
              a reason.
            </p>
          </div>
        )}
        {role === 'arbitrator' && rental.stage === 'review' && (
          <div className="note">
            <Clock3 size={18} />
            The tenant has not requested arbitration. Switch to Tenant and request a review to
            continue the disputed path.
          </div>
        )}
        {role === 'landlord' && ['review', 'disputed'].includes(rental.stage) && (
          <div className="note">
            <Clock3 size={18} />
            {rental.stage === 'review'
              ? 'Waiting for the tenant’s response. You cannot approve your own claim.'
              : 'The tenant requested a review. The assigned arbitrator must record a decision.'}
          </div>
        )}
        {role === 'tenant' && rental.stage === 'disputed' && (
          <div className="note">
            <Scale size={18} />
            Awaiting human review. Switch to Arbitrator to continue the demo.
          </div>
        )}
        {canPay && (
          <div className="case-actions">
            <button className="button primary full" onClick={() => act({ type: 'pay', role })}>
              Simulate agreed payout <ArrowRight size={16} />
            </button>
            <p className="small-copy">Uses the recorded recipients and amounts shown above.</p>
          </div>
        )}
        {rental.stage === 'paid' && (
          <div className="case-actions">
            <div className="paid-check">
              <CheckCheck size={23} />
              <span>{money(ledger.paid)} reconciled in the demo.</span>
            </div>
            <button className="button secondary full" onClick={download}>
              <Download size={16} />
              Download sample record
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Savings() {
  const [monthly, setMonthly] = useState(25);
  const [releasedInterest, setReleasedInterest] = useState(0);
  const [rate, setRate] = useState(0);
  const projection = savingsProjection(monthly * 100, releasedInterest * 100, rate, 10);
  const last = projection.at(-1)!;
  return (
    <>
      <PageHeading
        eyebrow="YOUR NEXT CHAPTER"
        title="Small steps. Something of your own."
        subtitle="Start with a personal savings plan. Your rental deposit stays separate."
      />
      <div className="savings-grid">
        <section className="card savings-intro">
          <span className="round-icon">
            <Sprout size={27} />
          </span>
          <h2>
            From tenant
            <br />
            toward ownership.
          </h2>
          <p>
            Build savings for a future home or, eventually, an eligible property investment. You
            choose what happens to your money.
          </p>
          <HouseArt />
          <div className="note">
            <LockKeyhole size={18} />
            This plan starts at $0 and never uses the held deposit. There is no savings account or
            investment provider connected.
          </div>
        </section>
        <section className="card calculator">
          <div className="section-heading">
            <h2>Try a savings plan</h2>
            <Badge tone="neutral">Illustration</Badge>
          </div>
          <label className="range-label" htmlFor="monthly">
            Your monthly contribution<strong>${monthly}</strong>
          </label>
          <input
            id="monthly"
            type="range"
            min="0"
            max="200"
            step="5"
            value={monthly}
            onChange={(e) => setMonthly(Number(e.target.value))}
          />
          <label className="range-label" htmlFor="released-interest">
            Interest legally paid to you each year<strong>${releasedInterest}</strong>
          </label>
          <input
            id="released-interest"
            type="range"
            min="0"
            max="120"
            step="6"
            value={releasedInterest}
            onChange={(e) => setReleasedInterest(Number(e.target.value))}
          />
          <p className="small-copy">
            Optional assumption. Your jurisdiction and account determine whether interest is earned
            and can be released.
          </p>
          <label className="range-label" htmlFor="growth">
            Assumed investment return<strong>{rate}%</strong>
          </label>
          <input
            id="growth"
            type="range"
            min="0"
            max="8"
            step="1"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
          <div className="projection-value">
            <span>Illustrative balance after 10 years</span>
            <strong>{money(last.balanceCents)}</strong>
            <p>
              {money(last.contributionCents)} contributed ·{' '}
              {money(last.balanceCents - last.contributionCents)} assumed growth
            </p>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={`Ten-year savings illustration ending at ${money(last.balanceCents)}`}
          >
            {projection.map((point) => (
              <div key={point.year}>
                <span
                  style={{
                    height: `${last.balanceCents ? Math.max(3, (point.balanceCents / last.balanceCents) * 100) : 3}%`,
                  }}
                />
                <small>{point.year}</small>
              </div>
            ))}
          </div>
          <p className="small-copy">
            Year-end contributions; no fees, tax, inflation, or losses included. Returns are
            hypothetical and can be negative in reality. Property purchases remain unavailable.
          </p>
        </section>
      </div>
    </>
  );
}

function Compare() {
  const [months, setMonths] = useState(24);
  const [fee, setFee] = useState(15);
  const [rate, setRate] = useState(3);
  return (
    <>
      <PageHeading
        eyebrow="KNOW YOUR OPTIONS"
        title="A deposit and a fee are different."
        subtitle="An $800 example to compare upfront cash, ongoing cost, and what may come back."
      />
      <section className="card comparison-controls">
        <div>
          <label htmlFor="months">
            Time in the home <strong>{months} months</strong>
          </label>
          <input
            id="months"
            type="range"
            min="12"
            max="60"
            step="12"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="fee">
            Assumed alternative fee <strong>${fee}/month</strong>
          </label>
          <input
            id="fee"
            type="range"
            min="5"
            max="40"
            step="1"
            value={fee}
            onChange={(e) => setFee(Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="rate">
            Assumed deposit interest <strong>{rate}%/year</strong>
          </label>
          <input
            id="rate"
            type="range"
            min="0"
            max="5"
            step="1"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </div>
      </section>
      <div className="comparison-grid">
        <section className="card">
          <span className="eyebrow">REFUNDABLE DEPOSIT</span>
          <h2>Pay once.</h2>
          <div className="option-price">
            $800<span>upfront</span>
          </div>
          <dl>
            <div>
              <dt>Illustrative ongoing fees</dt>
              <dd>$0</dd>
            </div>
            <div>
              <dt>Deposit after {months} months</dt>
              <dd>$800</dd>
            </div>
            <div>
              <dt>Illustrative simple interest</dt>
              <dd>{money(Math.round((((80000 * rate) / 100) * months) / 12))}</dd>
            </div>
          </dl>
          <p>
            Principal can be refunded, less valid deductions. Interest depends on the law and
            account terms.
          </p>
        </section>
        <section className="card pale">
          <span className="eyebrow">DEPOSIT IN INSTALLMENTS</span>
          <h2>Build it gradually.</h2>
          <div className="option-price">
            $200<span>× 4 payments</span>
          </div>
          <dl>
            <div>
              <dt>Illustrative financing fees</dt>
              <dd>$0</dd>
            </div>
            <div>
              <dt>Fully funded deposit</dt>
              <dd>$800</dd>
            </div>
            <div>
              <dt>Interest</dt>
              <dd>On funded amounts</dd>
            </div>
          </dl>
          <p>
            The same refundable deposit, paid over time if available. The landlord must accept the
            schedule; this example assumes no lender or interest charges.
          </p>
        </section>
        <section className="card">
          <span className="eyebrow">FEE INSTEAD OF A DEPOSIT</span>
          <h2>Keep cash upfront.</h2>
          <div className="option-price">
            ${fee}
            <span>per month</span>
          </div>
          <dl>
            <div>
              <dt>Total fees over {months} months</dt>
              <dd>{money(fee * months * 100)}</dd>
            </div>
            <div>
              <dt>Refundable fee balance</dt>
              <dd>$0</dd>
            </div>
            <div>
              <dt>Possible damage liability</dt>
              <dd>Still applies</dd>
            </div>
          </dl>
          <p>
            You retain your $800 to spend or save. That flexibility can be valuable, but fees do not
            build a deposit or necessarily pay damage claims for you.
          </p>
        </section>
      </div>
      <div className="note comparison-note">
        <CircleHelp size={20} />
        <span>
          These are illustrative assumptions, not provider quotes. They exclude claims, tax,
          inflation, and any return on cash retained under the fee option. A deposit does not solve
          an upfront affordability problem unless the renter can fund it.
        </span>
      </div>
    </>
  );
}

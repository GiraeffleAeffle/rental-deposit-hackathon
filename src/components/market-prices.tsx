'use client';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { displayAmount } from '@/domain/assets';
import type { JupiterQuote } from '@/finance/solana';
import { Badge } from './workspace-panels';
import evidence from '../../docs/evidence/JUPITER_PRICE_QUOTES_2026-09-22.json';

export function MarketPrices() {
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [amount, setAmount] = useState('10000000');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/markets/solana/quote?amount=${amount}`);
      const result = await response.json();
      if (!result.available) throw new Error(result.reason || 'No verified price is available.');
      setQuote(result.quote);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Quote unavailable.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card operation-section">
      <div className="section-heading">
        <h2>Small contributions, actual market quotes</h2>
        <Badge tone="neutral">Pricing evidence</Badge>
      </div>
      <p className="section-copy">
        Jupiter returned these USDC → SPYx prices on 22 September 2026. They demonstrate a quoted
        route; eligibility, actual fills and full execution costs remain to be verified.
      </p>
      <div className="table-scroll">
        <table className="price-table">
          <thead>
            <tr>
              <th scope="col">Contribution</th>
              <th scope="col">Quoted SPYx units</th>
              <th scope="col">Listed route fee</th>
            </tr>
          </thead>
          <tbody>
            {evidence.records.map((record) => (
              <tr key={record.inputAtomic}>
                <td>{displayAmount(record.inputAtomic)} USDC</td>
                <td>{displayAmount(record.response.outAmount, 8, 8)}</td>
                <td>{record.response.feeBps / 100}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small-copy">
        Quotes had no taker or signed transaction. Their zero gas/rent placeholders do not measure
        the cost of an actual purchase.
      </p>
      <div className="price-controls">
        <label>
          Compare a contribution
          <select value={amount} onChange={(e) => setAmount(e.target.value)}>
            <option value="5000000">5 USDC</option>
            <option value="10000000">10 USDC</option>
            <option value="25000000">25 USDC</option>
          </select>
        </label>
        <button className="button secondary" disabled={busy} onClick={refresh}>
          <RefreshCw size={16} />
          Refresh price only
        </button>
      </div>
      {message && (
        <p role="status" className="note">
          {message}
        </p>
      )}
      {quote && (
        <dl className="detail-list">
          <div>
            <dt>Requested amount</dt>
            <dd>{displayAmount(quote.inputAtomic)} USDC</dd>
          </div>
          <div>
            <dt>Quoted output</dt>
            <dd>{displayAmount(quote.quotedOutputAtomic, 8, 8)} SPYx</dd>
          </div>
          <div>
            <dt>Observed</dt>
            <dd>{new Date(quote.observedAtMs).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Route / listed fee</dt>
            <dd>
              {quote.router} / {quote.feeBps / 100}%
            </dd>
          </div>
          <div>
            <dt>Execution</dt>
            <dd>No transaction built or submitted</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

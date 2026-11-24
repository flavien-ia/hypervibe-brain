// money.mjs - The guard on amounts written by a judge (2026-11-09).
//
// The rule: an amount that already exists as data in a tool (an invoice
// or a quote in the accounting, a balance or a payment at the bank, a sale)
// stays in its tool, and the brain keeps only its reference; an amount that is
// knowledge (a price decided, a scale, a threshold, the terms of a
// partnership) may enter. The instructions say so, and the judges did not
// always follow them (2026-11-09: a client's debt with its invoice numbers, a
// bank balance, a paid fee). So the code checks it for every write of a judge.
//
// A sentence is refused when it carries an amount AND a word of a recorded
// transaction (invoice, quote, balance, payment, transfer, debt, purchase...);
// a price or a cost said as knowledge (« vendu 1 790 € HT », « coûte 150 euros
// de moins ») passes. Not perfect, on purpose simple: it stops the clear
// cases, and says why, so the judge can write the reference instead.

const AMOUNT = /\d[\d\s  .,]*\s?(€|eur\b|euros?\b|k€|\$|usd\b|dollars?\b)/i;
// Words read whole, accents included (\b does not see past an accented letter).
const RECORDED = /(?<!\p{L})(factur\p{L}*|devis|avoir|solde|virement|paiements?|pay[ée]e?s?|r[ée]gl[ée]e?s?|encaiss\p{L}*|pr[ée]l[èe]vements?|[ée]ch[ée]anciers?|cr[ée]ances?|doit|d[ûu]e?s?|remboursements?|d[ée]bit[ée]e?s?|cr[ée]dit[ée]e?s?|achet[ée]e?s?|invoices?|balance|paid|owed?)(?!\p{L})|\b[FDA]-?\d{4}-\d{2}-\d{2,4}\b/iu;

/** The sentence that breaks the rule, or null. */
export function recordedAmount(text) {
  for (const s of String(text ?? "").split(/(?<=[.;!?])\s+|\n+/)) {
    if (AMOUNT.test(s) && RECORDED.test(s)) return s.trim().slice(0, 160);
  }
  return null;
}

export const AMOUNT_REFUSAL = (s) => `an amount that already exists as data in a tool (an invoice, a quote, a balance, a payment) stays in its tool: write its reference without the figure ("invoice F-2026-09-107, in the accounting tool"). Refused: « ${s} »`;

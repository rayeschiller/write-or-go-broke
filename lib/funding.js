// Historical earnings stay intact; money already returned cannot fund another round.
export function payoutApplies(payout, createdAt) {
  return Boolean(payout?.sent && (!payout.signupCreatedAt || payout.signupCreatedAt === createdAt));
}
export function fundingQuote(balanceCents, payout, createdAt, stakeCents = 15000) {
  const paidBack = payoutApplies(payout, createdAt);
  const availableCents = paidBack ? 0 : balanceCents;
  const rolloverCents = Math.min(availableCents, stakeCents);
  return {stakeCents, balanceCents, paidBack, availableCents, rolloverCents,
    owedCents: stakeCents - rolloverCents, payoutCents: availableCents - rolloverCents};
}
export class FundingConflict extends Error {}
export function assertRolloverAvailable(payout, createdAt) {
  if (payoutApplies(payout, createdAt)) throw new FundingConflict('This founding balance was paid back. Confirm a fresh $150 payment instead.');
}
export function assertPayoutAvailable(createdAt, signup, payment) {
  if (signup?.foundingSignupCreatedAt === createdAt && payment?.signupCreatedAt === signup?.createdAt && payment?.paid && payment.method === 'rollover') {
    throw new FundingConflict('This balance is already funding the next cohort. Undo that rollover before marking the full balance paid back.');
  }
}

// All payout and next-cohort payment mutations share this CAS lease. The lease
// outlives the API's 60-second limit, including a crashed or timed-out invocation.
export function createFundingLock({read, write, now = Date.now, ttl = 120000}) {
  return async function withLock(id, operation) {
    const path = 'funding-locks/' + id + '.json';
    const previous = await read(path);
    if (previous?.data.expiresAt > now()) throw new FundingConflict('Another balance update is in progress. Please try again shortly.');
    let lease;
    try { lease = await write(path, {expiresAt: now() + ttl}, previous?.etag ?? null); }
    catch { throw new FundingConflict('Balance changed in another tab. Refresh and try again.'); }
    try { return await operation(); }
    finally {
      // A failed release leaves a bounded lease, never an unlocked overlapping write.
      try { await write(path, {expiresAt: 0}, lease.etag); } catch {}
    }
  };
}

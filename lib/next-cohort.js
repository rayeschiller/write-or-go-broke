import {FOUNDING, NEXT, NEXT_SCHEDULE, signupPath, paymentPath} from './cohorts.js';
import {addDays, challengeState, DURATION} from './challenge.js';
import {settings, AccountError} from './participant-store.js';
import {getStore, read} from './store.js';
import {community} from './community-store.js';
import {STAKE} from './ledger.js';

export async function nextRegistrationOpen(now = new Date()) {
  const founding = await settings();
  if (!founding.startDate || !founding.timezone) return false;
  const firstFreeDay = addDays(founding.startDate, DURATION);
  if (firstFreeDay > NEXT_SCHEDULE.startDate) return false;
  if (firstFreeDay === NEXT_SCHEDULE.startDate && founding.timezone !== NEXT_SCHEDULE.timezone) return false;
  return challengeState(NEXT_SCHEDULE, now).phase === 'upcoming';
}

export async function nextMembership(person) {
  const [signup, payment] = await Promise.all([
    read(signupPath(person.id, NEXT)),
    read(paymentPath(person.id, NEXT))
  ]);
  const sourceMatches = signup?.data.source === 'returning'
    ? signup.data.foundingSignupCreatedAt === person.createdAt
    : signup?.data.createdAt === person.createdAt;
  const paid = sourceMatches && payment?.data.signupCreatedAt === signup.data.createdAt && payment.data.paid === true;
  return {
    requested: Boolean(sourceMatches),
    paid: Boolean(paid),
    enrolled: Boolean(paid && payment.data.enrolled),
    signup: sourceMatches ? signup.data : null
  };
}

export async function personInCohort(person, cohort) {
  if (cohort === FOUNDING) {
    if (person.accountCohort === FOUNDING) return person;
  } else {
    const membership = await nextMembership(person);
    if (membership.enrolled) return {...membership.signup, id: person.id};
  }
  throw new AccountError('Challenge enrollment required.', 403);
}

function publicMembership({requested, paid, enrolled, signup}) {
  return {requested, paid, enrolled, rollover: signup?.rollover === true};
}

export async function nextStatus(person) {
  const [membership, open, foundingPayment] = await Promise.all([
    nextMembership(person),
    nextRegistrationOpen(),
    person.accountCohort === FOUNDING ? read(paymentPath(person.id, FOUNDING)) : null
  ]);
  const foundingEnrolled = Boolean(foundingPayment?.data.paid && foundingPayment.data.enrolled);
  return {...publicMembership(membership), foundingEnrolled, canJoin: open && foundingEnrolled};
}

export async function rolloverQuote(person) {
  const founding = await community(person, FOUNDING);
  const balanceCents = founding.records.find(writer => writer.id === founding.me).projectedCents;
  const rolloverCents = Math.min(balanceCents, STAKE);
  return {
    stakeCents: STAKE,
    balanceCents,
    rolloverCents,
    owedCents: STAKE - rolloverCents,
    payoutCents: balanceCents - rolloverCents,
    estimated: founding.phase !== 'ended' || founding.unallocatedCents > 0
  };
}

export async function joinNext(person, rollover = false) {
  if (typeof rollover !== 'boolean') throw new AccountError('Choose whether to roll over your balance.');
  const existing = await nextMembership(person);
  if (existing.requested) return publicMembership(existing);
  if (!await nextRegistrationOpen()) throw new AccountError('Registration for the November cohort is closed.', 409);
  const previous = await read(paymentPath(person.id, FOUNDING));
  if (person.accountCohort !== FOUNDING || !previous?.data.paid || !previous.data.enrolled) {
    throw new AccountError('A founding cohort enrollment is required to continue from this account.', 403);
  }
  const {name, email, phone, sms, createdAt} = person;
  await getStore().add({name, email, phone, sms, source: 'returning', rollover, foundingSignupCreatedAt: createdAt}, NEXT);
  const membership = await nextMembership(person);
  if (!membership.requested) throw new AccountError('This signup needs an update from Raye before you can join.', 409);
  return publicMembership(membership);
}

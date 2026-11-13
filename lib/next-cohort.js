import {FOUNDING, NEXT, NEXT_SCHEDULE, signupPath, paymentPath} from './cohorts.js';
import {addDays, challengeState, DURATION} from './challenge.js';
import {settings, AccountError} from './participant-store.js';
import {getStore, read} from './store.js';

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

function publicMembership({requested, paid, enrolled}) {
  return {requested, paid, enrolled};
}

export async function nextStatus(person) {
  const [membership, open, foundingPayment] = await Promise.all([
    nextMembership(person),
    nextRegistrationOpen(),
    person.accountCohort === FOUNDING ? read(paymentPath(person.id, FOUNDING)) : null
  ]);
  return {
    ...publicMembership(membership),
    foundingEnrolled: Boolean(foundingPayment?.data.paid && foundingPayment.data.enrolled),
    canJoin: open && Boolean(foundingPayment?.data.paid && foundingPayment.data.enrolled)
  };
}

export async function joinNext(person) {
  const existing = await nextMembership(person);
  if (existing.requested) return publicMembership(existing);
  if (!await nextRegistrationOpen()) throw new AccountError('Registration for the November cohort is closed.', 409);
  const previous = await read(paymentPath(person.id, FOUNDING));
  if (person.accountCohort !== FOUNDING || !previous?.data.paid || !previous.data.enrolled) {
    throw new AccountError('A founding cohort enrollment is required to continue from this account.', 403);
  }
  const {name, email, phone, sms, createdAt} = person;
  await getStore().add({name, email, phone, sms, source: 'returning', foundingSignupCreatedAt: createdAt}, NEXT);
  const membership = await nextMembership(person);
  if (!membership.requested) throw new AccountError('This signup needs an update from Raye before you can join.', 409);
  return publicMembership(membership);
}

export const FOUNDING = 'founding-cohort';
export const NEXT = 'november-2026';
export const NEXT_SCHEDULE = Object.freeze({startDate: '2026-11-22', timezone: 'America/Los_Angeles'});
export const nextQuery = '?cohort=' + NEXT;

export function signupPath(id, cohort = FOUNDING) {
  return signupPrefix(cohort) + id + '.json';
}

export function paymentPath(id, cohort = FOUNDING) {
  return paymentPrefix(cohort) + id + '.json';
}

export function signupPrefix(cohort) {
  return cohort === FOUNDING ? 'signups/' : 'cohorts/' + cohort + '/signups/';
}

export function paymentPrefix(cohort) {
  return cohort === FOUNDING ? 'payments/' : 'cohorts/' + cohort + '/payments/';
}

export const FIXED_COLUMNS = [
  { name: 'Backlog',              sort_order: 0, is_default: true  },
  { name: 'Want to Apply',        sort_order: 1, is_default: false },
  { name: 'Applied / Waiting',    sort_order: 2, is_default: false },
  { name: 'Interview',            sort_order: 3, is_default: false },
  { name: 'Offer',                sort_order: 4, is_default: false },
  { name: 'Rejected',             sort_order: 5, is_default: false },
]

// Semantic stage for each fixed column
export const STAGE_MAP = {
  'Backlog':           'pre_apply',
  'Want to Apply':     'pre_apply',
  'Applied / Waiting': 'applied',
  'Interview':         'interview',
  'Offer':             'terminal',
  'Rejected':          'terminal',
}

export function getStage(status) {
  return STAGE_MAP[status] || 'pre_apply'
}

export function isPreApply(status)  { return getStage(status) === 'pre_apply'  }
export function isApplied(status)   { return getStage(status) === 'applied'    }
export function isInterview(status) { return getStage(status) === 'interview'  }
export function isTerminal(status)  { return getStage(status) === 'terminal'   }

// Maps an arbitrary old column name to the nearest fixed column name
export function guessFixedColumn(oldName) {
  const n = (oldName || '').toLowerCase()
  if (/interview/i.test(n))                                        return 'Interview'
  if (/applied|waiting|sent|submit|response/i.test(n))            return 'Applied / Waiting'
  if (/offer/i.test(n))                                           return 'Offer'
  if (/reject|close|declin|withdraw|pass|archive/i.test(n))       return 'Rejected'
  if (/want|send|resume|consider/i.test(n))                       return 'Want to Apply'
  return 'Backlog'
}

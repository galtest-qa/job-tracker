import type { GmailEmail } from "./gmail-api.ts"

// ── ATS / Recruiting allowlist ─────────────────────────────────────────────
// Emails from these domains always pass to AI, regardless of any other signal.
// Many ATS systems use noreply addresses and land in Promotions/Updates — that
// is NOT a reason to exclude them.
const ATS_DOMAINS = [
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "hire.lever.co",
  "ashbyhq.com",
  "workday.com",
  "myworkdayjobs.com",
  "comeet.com",
  "smartrecruiters.com",
  "teamtailor.com",
  "bamboohr.com",
  "recruitee.com",
  "icims.com",
  "workable.com",
  "jobvite.com",
  "successfactors.com",
  "taleo.net",
  "jobscore.com",
  "breezy.hr",
  "pinpoint.com",
  "rippling.com",
  "dover.com",
  "gem.com",
  "linkedin.com",  // recruiter messages and job alerts
  "recruitment.wix.com",
]

// ── Hard-exclude domains ───────────────────────────────────────────────────
// Unambiguously non-job-search platforms. Only excluded when the domain
// is an exact match or subdomain — never by partial string.
const HARD_EXCLUDE_DOMAINS = new Set([
  "github.com",
  "gitlab.com",
  "atlassian.net",
  "atlassian.com",
  "jira.com",
  "trello.com",
  "confluence.com",
  "bitbucket.org",
  "circleci.com",
  "travis-ci.com",
  "sentry.io",
  "datadog.com",
  "pagerduty.com",
])

// ── Helpers ────────────────────────────────────────────────────────────────

function extractDomain(from: string): string {
  // Handles both "Name <user@domain.com>" and "user@domain.com"
  const match = from.match(/@([\w.-]+)/)
  return match ? match[1].toLowerCase() : ""
}

function domainIsAts(domain: string): boolean {
  return ATS_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))
}

function domainIsHardExcluded(domain: string): boolean {
  for (const d of HARD_EXCLUDE_DOMAINS) {
    if (domain === d || domain.endsWith("." + d)) return true
  }
  return false
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Returns true if the email is obviously non-job-related noise and should
 * NOT be sent to AI. Returns false (pass to AI) when uncertain.
 *
 * Rules applied in order:
 *  1. ATS allowlist → never filtered
 *  2. Outbound emails → never filtered (application_sent, follow_up_sent, etc.)
 *  3. Hard-exclude dev/ops domains → filtered
 *  4. AWS billing/security alerts → filtered
 *  5. Unambiguous receipt/invoice subjects → filtered
 *  6. Newsletter + Promotions label combo → filtered
 *  7. Default → pass to AI
 *
 * noreply/no-reply addresses are NOT excluded — many ATS systems use them.
 * CATEGORY_UPDATES and CATEGORY_PROMOTIONS alone are NOT excluded.
 */
export function shouldPreFilter(email: GmailEmail): boolean {
  const domain = extractDomain(email.from)
  const subject = (email.subject ?? "").toLowerCase()
  const labels = email.gmailLabels ?? []

  // Rule 1: ATS allowlist — highest priority, overrides everything
  if (domainIsAts(domain)) return false

  // Rule 2: Outbound emails are never filtered
  // They may be application_sent, follow_up_sent, networking_outreach
  if (email.direction === "outbound") return false

  // Rule 3: Hard-exclude dev/CI/ops platforms
  if (domainIsHardExcluded(domain)) return true

  // Rule 4: AWS billing and security alerts (not general AWS notifications)
  if (
    (domain.includes("amazonaws.com") || domain === "aws.amazon.com") &&
    /bill|invoice|usage report|security alert|budget alert|spending/.test(subject)
  ) return true

  // Rule 5: Unambiguous e-commerce receipts / invoices
  // Match only clear patterns at the start of subject to avoid false positives
  if (
    /^(your receipt|your order|order confirmation|order #|payment confirmation|invoice from|invoice #|payment received|subscription renewal)/.test(
      subject,
    )
  ) return true

  // Rule 6: Newsletter — only when subject strongly signals it AND Gmail labeled Promotions
  // Do NOT exclude based on Promotions label alone (ATS emails often land there)
  if (
    labels.includes("CATEGORY_PROMOTIONS") &&
    /\bnewsletter\b|\bweekly digest\b|\bmonthly digest\b|\bweekly roundup\b/.test(subject)
  ) return true

  // Default: uncertain → send to AI
  return false
}

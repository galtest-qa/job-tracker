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
 * Returns the reason the email was pre-filtered, or null if it should pass to AI.
 * Rules applied in order (same as shouldPreFilter).
 */
export function getPreFilterReason(email: GmailEmail): string | null {
  const domain = extractDomain(email.from)
  const subject = (email.subject ?? "").toLowerCase()
  const labels = email.gmailLabels ?? []

  if (domainIsAts(domain)) return null // ATS allowlist — pass through
  if (email.direction === "outbound") return null // outbound — pass through

  if (domainIsHardExcluded(domain)) return `hard_excluded_domain:${domain}`

  if (
    (domain.includes("amazonaws.com") || domain === "aws.amazon.com") &&
    /bill|invoice|usage report|security alert|budget alert|spending/.test(subject)
  ) return "aws_billing_alert"

  if (
    /^(your receipt|your order|order confirmation|order #|payment confirmation|invoice from|invoice #|payment received|subscription renewal)/.test(
      subject,
    )
  ) return "ecommerce_receipt"

  if (
    labels.includes("CATEGORY_PROMOTIONS") &&
    /\bnewsletter\b|\bweekly digest\b|\bmonthly digest\b|\bweekly roundup\b/.test(subject)
  ) return "newsletter_promotion"

  return null
}

export function shouldPreFilter(email: GmailEmail): boolean {
  return getPreFilterReason(email) !== null
}

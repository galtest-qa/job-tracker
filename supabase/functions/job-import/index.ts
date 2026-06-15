// Universal job import — URL → structured job data
// Supports: Greenhouse, Lever, Ashby, Workday, LinkedIn, generic career pages
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

export interface JobImportResult {
  company: string | null
  role: string | null
  description: string | null
  location: string | null
  salary_range: string | null
  source_type: string
  url: string
  partial: boolean
  confidence: "high" | "medium" | "low"
  error?: string
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 })

  let body: { url?: string } = {}
  try { body = await req.json() } catch { /* ignore */ }

  const rawUrl = body.url?.trim()
  if (!rawUrl) return json({ error: "url is required" }, 400)

  let parsed: URL
  try { parsed = new URL(rawUrl) } catch {
    return json({ error: "Invalid URL" }, 400)
  }

  const host = parsed.hostname.toLowerCase()

  try {
    let result: JobImportResult

    if (host.includes("greenhouse.io")) {
      result = await extractGreenhouse(parsed)
    } else if (host.includes("lever.co")) {
      result = await extractLever(parsed)
    } else if (host.includes("ashbyhq.com") || host.includes("ashby.co")) {
      result = await extractAshby(parsed)
    } else if (host.includes("myworkdayjobs.com")) {
      result = await extractWorkday(parsed)
    } else if (host === "www.linkedin.com" || host === "linkedin.com") {
      result = await extractLinkedIn(parsed)
    } else {
      result = await extractGeneric(parsed)
    }

    return json(result, 200)
  } catch (err) {
    console.error("job-import error:", (err as Error).message)
    return json({
      company: null, role: null, description: null,
      location: null, salary_range: null,
      source_type: "generic", url: rawUrl, partial: true,
      confidence: "low", error: "Extraction failed",
    }, 500)
  }
})

// ── Greenhouse ───────────────────────────────────────────────────────────────
// Two tiers:
//   boards.greenhouse.io (old)    → boards-api JSON API
//   job-boards.greenhouse.io (new) → HTML + JSON-LD
//
// Company name:
//   Try boards-api.greenhouse.io/v1/boards/{slug} → data.name
//   Fall back to slug → title case

async function extractGreenhouse(url: URL): Promise<JobImportResult> {
  const path = url.pathname
  const parts = path.split("/").filter(Boolean)

  // Detect new vs old board URL
  const isNewBoard = url.hostname.startsWith("job-boards.")

  let slug = ""
  let jobId = ""

  if (url.hostname === "boards.greenhouse.io" || isNewBoard) {
    // /companyslug/jobs/123456
    slug = parts[0] ?? ""
    jobId = parts[2] ?? parts[1] ?? ""
  } else {
    // {slug}.greenhouse.io/jobs/123456 or ?gh_jid=123456
    slug = url.hostname.split(".")[0]
    jobId = parts[1] ?? url.searchParams.get("gh_jid") ?? ""
  }

  if (!slug) return partialResult(url, "greenhouse", null, "Could not parse company slug from URL")

  // Fetch company name + job details in parallel — both best-effort
  const [companyName, jobData] = await Promise.all([
    fetchGreenhouseCompanyName(slug),
    slug && jobId ? fetchGreenhouseJob(slug, jobId) : Promise.resolve(null),
  ])

  // If API worked cleanly
  if (jobData && !jobData.error) {
    return {
      company: companyName,
      role: jobData.title ?? null,
      description: jobData.content ? stripHtml(jobData.content).slice(0, 5000) : null,
      location: jobData.location?.name ?? null,
      salary_range: null,
      source_type: "greenhouse",
      url: url.toString(),
      partial: !jobData.title,
      confidence: jobData.title ? "high" : "medium",
    }
  }

  // API failed — fetch HTML and look for JSON-LD (new Greenhouse product is SSR)
  const html = await fetchHtml(url.toString())
  if (html) {
    const fromHtml = extractFromHtml(html, "greenhouse")
    if (fromHtml.role) {
      return { ...fromHtml, company: companyName ?? fromHtml.company, url: url.toString() }
    }
  }

  return partialResult(url, "greenhouse", companyName ?? toTitleCase(slug),
    "Job details unavailable — fill in manually")
}

async function fetchGreenhouseCompanyName(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}`, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const d = await res.json()
      if (d.name && typeof d.name === "string") return d.name
    }
  } catch { /* timeout or error */ }
  return toTitleCase(slug)
}

// deno-lint-ignore no-explicit-any
async function fetchGreenhouseJob(slug: string, jobId: string): Promise<any | null> {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── Lever ────────────────────────────────────────────────────────────────────
// Public API: api.lever.co/v0/postings/{company}/{posting-id}
//
// Fix: data.team is the JOB TEAM/DEPT (e.g. "Engineering"), NOT the company name.
// Company must come from the URL slug, not data.team.

async function extractLever(url: URL): Promise<JobImportResult> {
  const parts = url.pathname.split("/").filter(Boolean)
  const companySlug = parts[0] ?? ""
  const postingId = parts[1] ?? ""

  if (!companySlug || !postingId) return partialResult(url, "lever", null, "Could not parse job URL")

  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${companySlug}/${postingId}`, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) throw new Error(`Lever API ${res.status}`)
    const data = await res.json()

    // Build description from structured Lever response
    const descParts: string[] = []
    if (data.description) descParts.push(stripHtml(data.description))
    if (Array.isArray(data.lists)) {
      for (const list of data.lists) {
        if (list.text) descParts.push(`\n${list.text}:`)
        if (list.content) descParts.push(stripHtml(list.content))
      }
    }
    if (data.additional) descParts.push(stripHtml(data.additional))

    return {
      // data.team is the DEPARTMENT (e.g. "Engineering") — use URL slug for company
      company: toTitleCase(companySlug),
      role: data.text ?? null,
      description: descParts.join("\n").slice(0, 5000) || null,
      location: data.categories?.location ?? null,
      salary_range: null,
      source_type: "lever",
      url: url.toString(),
      partial: !data.text,
      confidence: data.text ? "high" : "medium",
    }
  } catch {
    // API failed — fall back to generic HTML extraction
    return await extractGenericWithSource(url, "lever", toTitleCase(companySlug))
  }
}

// ── Ashby ────────────────────────────────────────────────────────────────────
// Ashby is a React SPA — JSON-LD is NOT in server-rendered HTML.
// og:site_name is "Ashby" (the ATS vendor, NOT the hiring company).
//
// Fix: Extract company from og:title "Role at Company" pattern.
// Fall back to URL slug (jobs.ashbyhq.com/{company-slug}/...).

async function extractAshby(url: URL): Promise<JobImportResult> {
  const urlSlug = url.pathname.split("/").filter(Boolean)[0] ?? ""
  const slugCompany = urlSlug ? toTitleCase(urlSlug) : null

  const html = await fetchHtml(url.toString())
  if (!html) return partialResult(url, "ashby", slugCompany, "Could not load page")

  // og:title is typically "Senior PM at Grammarly | Grammarly" or "Senior PM at Grammarly"
  const ogTitle = extractOgMeta(html, "og:title") ?? ""
  const titleParts = parseRoleAtCompany(ogTitle)

  const role = titleParts?.role ?? null
  // og:site_name for Ashby is the platform name "Ashby" — explicitly ignore it
  const company = titleParts?.company ?? slugCompany

  // Try JSON-LD anyway (some Ashby configs include it)
  const jsonLd = extractJsonLd(html)
  if (jsonLd?.["@type"] === "JobPosting") {
    return {
      company: jsonLd.hiringOrganization?.name ?? company,
      role: jsonLd.title ?? role,
      description: jsonLd.description ? stripHtml(String(jsonLd.description)).slice(0, 5000) : null,
      location: extractJobLocation(jsonLd) ?? null,
      salary_range: extractSalaryRange(jsonLd),
      source_type: "ashby",
      url: url.toString(),
      partial: false,
      confidence: "high",
    }
  }

  return {
    company,
    role,
    description: extractOgMeta(html, "og:description") ?? null,
    location: null,
    salary_range: null,
    source_type: "ashby",
    url: url.toString(),
    partial: !company || !role,
    confidence: company && role ? "medium" : "low",
    error: (!role && company) ? "Ashby loads job data via JavaScript — company detected from URL. Please fill in the Role field." : undefined,
  }
}

// ── Workday ──────────────────────────────────────────────────────────────────
// Workday is a React SPA. Initial HTML has limited data.
// Company: reliably from subdomain ({company}.wd5.myworkdayjobs.com).
// Role: try og:title, <title>, then JSON-LD if injected SSR.

async function extractWorkday(url: URL): Promise<JobImportResult> {
  // e.g. wiz.wd5.myworkdayjobs.com → "Wiz"
  const subdomain = url.hostname.split(".")[0]
  const companyName = toTitleCase(subdomain)

  const html = await fetchHtml(url.toString())
  if (!html) return partialResult(url, "workday", companyName, "Could not load page")

  // JSON-LD (present in some Workday SSR pages)
  const jsonLd = extractJsonLd(html)
  if (jsonLd?.["@type"] === "JobPosting") {
    return {
      company: jsonLd.hiringOrganization?.name ?? companyName,
      role: jsonLd.title ?? null,
      description: jsonLd.description ? stripHtml(String(jsonLd.description)).slice(0, 5000) : null,
      location: extractJobLocation(jsonLd) ?? null,
      salary_range: extractSalaryRange(jsonLd),
      source_type: "workday",
      url: url.toString(),
      partial: false,
      confidence: "high",
    }
  }

  // og:title patterns:
  //   "Job Title | Company Name"
  //   "Company Name | Job Title"
  //   "Apply for Job Title | Company" (Workday's own format)
  const ogTitle = extractOgMeta(html, "og:title") ?? ""
  const pageTitle = extractTitle(html) ?? ""
  const bestTitle = ogTitle || pageTitle

  let role: string | null = null
  if (bestTitle && !bestTitle.toLowerCase().includes("workday")) {
    const parts = bestTitle.split("|").map(s => s.trim())
    if (parts.length >= 2) {
      // "Apply for Job Title | Company" → take the part after "Apply for"
      const part0 = parts[0].replace(/^apply\s+for\s+/i, "").trim()
      // Prefer the part that doesn't look like a company/generic term
      role = part0.length > 3 ? part0 : parts[1]
    } else {
      role = bestTitle.replace(/workday/i, "").replace(/apply\s+for\s+/i, "").trim() || null
    }
  }

  return {
    company: companyName,
    role,
    description: null,
    location: null,
    salary_range: null,
    source_type: "workday",
    url: url.toString(),
    partial: true,
    confidence: role ? "medium" : "low",
    error: role ? undefined : "Workday loads jobs via JavaScript — company detected from URL. Please fill in the Role field.",
  }
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────
// LinkedIn /jobs/view/{id} serves SSR with JSON-LD for logged-out users.
// Frequent issues:
//   - Search results page returned instead of job detail (wrong URL format)
//   - Login wall served instead of job page
//   - og:title sometimes "N+ Company jobs in Location" (search result)

async function extractLinkedIn(url: URL): Promise<JobImportResult> {
  // Validate this is a job detail URL, not a search
  const path = url.pathname
  const isJobDetail = /\/jobs\/view\/\d+/.test(path) || /\/jobs\/collections\//.test(path)

  const html = await fetchHtml(url.toString(), {
    "User-Agent": LINKEDIN_UA,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  })

  if (!html) return partialResult(url, "linkedin", null, "Could not load page")

  // Detect login wall / auth redirect
  const isLoginWall = html.includes("authwall") || html.includes("session_redirect") ||
    html.includes("join?trk=") || (html.includes("Sign in") && !html.includes("hiringOrganization"))

  // Detect search results page served instead of job detail
  const ogTitle = extractOgMeta(html, "og:title") ?? ""
  const isSearchPage = /\d+\+?\s+(jobs?|positions?)\s+in\b/i.test(ogTitle) ||
    ogTitle.toLowerCase().includes("job board")

  if (isLoginWall || (isSearchPage && !isJobDetail)) {
    return {
      company: null, role: null, description: null,
      location: null, salary_range: null,
      source_type: "linkedin", url: url.toString(),
      partial: true, confidence: "low",
      error: isLoginWall
        ? "LinkedIn requires login to view this job. Copy the job title and company manually."
        : "LinkedIn returned a search page. Navigate to the specific job post and copy that URL.",
    }
  }

  // JSON-LD (LinkedIn does include this for job detail pages)
  const jsonLd = extractJsonLd(html)
  if (jsonLd?.["@type"] === "JobPosting") {
    return {
      company: jsonLd.hiringOrganization?.name ?? null,
      role: jsonLd.title ?? null,
      description: jsonLd.description ? stripHtml(String(jsonLd.description)).slice(0, 5000) : null,
      location: extractJobLocation(jsonLd) ?? null,
      salary_range: extractSalaryRange(jsonLd),
      source_type: "linkedin",
      url: url.toString(),
      partial: false,
      confidence: "high",
    }
  }

  // Parse og:title: "Role at Company | LinkedIn" or "Role - Company | LinkedIn"
  const atMatch = parseRoleAtCompany(ogTitle)
  const dashMatch = ogTitle.match(/^(.+?)\s+[-–]\s+(.+?)\s*\|/)

  if (atMatch?.company && atMatch?.role) {
    return {
      company: atMatch.company,
      role: atMatch.role,
      description: extractOgMeta(html, "og:description") ?? null,
      location: null, salary_range: null,
      source_type: "linkedin", url: url.toString(),
      partial: false, confidence: "medium",
    }
  }

  if (dashMatch) {
    return {
      company: dashMatch[2].replace(/\s*\|\s*LinkedIn$/i, "").trim(),
      role: dashMatch[1].trim(),
      description: extractOgMeta(html, "og:description") ?? null,
      location: null, salary_range: null,
      source_type: "linkedin", url: url.toString(),
      partial: false, confidence: "medium",
    }
  }

  return {
    company: null,
    role: ogTitle.replace(/\s*\|\s*LinkedIn$/i, "").trim() || null,
    description: extractOgMeta(html, "og:description") ?? null,
    location: null, salary_range: null,
    source_type: "linkedin", url: url.toString(),
    partial: true, confidence: "low",
  }
}

// ── Generic ───────────────────────────────────────────────────────────────────
// Priority: JSON-LD → "Role at Company" in title/og → AI

async function extractGeneric(url: URL): Promise<JobImportResult> {
  return await extractGenericWithSource(url, "generic", null)
}

async function extractGenericWithSource(
  url: URL,
  sourceType: string,
  fallbackCompany: string | null,
): Promise<JobImportResult> {
  const html = await fetchHtml(url.toString())
  if (!html) return partialResult(url, sourceType, fallbackCompany, "Could not load page")

  // 1. JSON-LD JobPosting schema
  const jsonLd = extractJsonLd(html)
  if (jsonLd?.["@type"] === "JobPosting") {
    const company = jsonLd.hiringOrganization?.name
      ?? extractOgMeta(html, "og:site_name")
      ?? fallbackCompany
    return {
      company: typeof company === "string" ? company : fallbackCompany,
      role: jsonLd.title ?? null,
      description: jsonLd.description ? stripHtml(String(jsonLd.description)).slice(0, 5000) : null,
      location: extractJobLocation(jsonLd) ?? null,
      salary_range: extractSalaryRange(jsonLd),
      source_type: sourceType,
      url: url.toString(),
      partial: false,
      confidence: "high",
    }
  }

  // 2. "Role at Company" patterns in og:title or <title>
  const ogTitle = extractOgMeta(html, "og:title") ?? ""
  const pageTitle = extractTitle(html) ?? ""
  const atMatch = parseRoleAtCompany(ogTitle) ?? parseRoleAtCompany(pageTitle)

  if (atMatch?.role && atMatch?.company) {
    return {
      company: atMatch.company,
      role: atMatch.role,
      description: extractOgMeta(html, "og:description") ?? null,
      location: null, salary_range: null,
      source_type: sourceType,
      url: url.toString(),
      partial: false,
      confidence: "medium",
    }
  }

  // 3. Collect partial signals before AI
  const h1 = extractH1(html)
  const partialRole = (h1 ?? ogTitle.replace(/\s*\|.*$/, "").trim()) || null
  const partialCompany = fallbackCompany
    ?? extractOgMeta(html, "og:site_name")
    ?? url.hostname.replace(/^www\./, "")

  // 4. AI fallback (only if we have meaningful page content but couldn't extract cleanly)
  const openaiKey = Deno.env.get("OPENAI_API_KEY")
  if (openaiKey) {
    const snippet = extractVisibleText(html).slice(0, 3000)
    const ai = await aiExtract(snippet, url.toString(), openaiKey)
    if (ai?.role && ai?.company) {
      return { ...ai, source_type: sourceType, url: url.toString(), confidence: "medium" }
    }
  }

  return {
    company: partialCompany,
    role: partialRole,
    description: extractOgMeta(html, "og:description") ?? null,
    location: null, salary_range: null,
    source_type: sourceType,
    url: url.toString(),
    partial: true,
    confidence: partialRole ? "low" : "low",
  }
}

// ── Extraction helpers ────────────────────────────────────────────────────────

const UA_HEADERS = {
  "User-Agent": "JobMaker/1.0 (+job-search-tracker)",
  "Accept": "application/json,text/html",
}

const LINKEDIN_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

async function fetchHtml(
  url: string,
  extraHeaders?: Record<string, string>,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        ...extraHeaders,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const ct = res.headers.get("content-type") ?? ""
    if (!ct.includes("html")) return null
    return await res.text()
  } catch {
    return null
  }
}

// Extract all data from HTML — used as fallback for any ATS that has good HTML
function extractFromHtml(html: string, sourceType: string): JobImportResult {
  const jsonLd = extractJsonLd(html)
  if (jsonLd?.["@type"] === "JobPosting") {
    return {
      company: jsonLd.hiringOrganization?.name ?? null,
      role: jsonLd.title ?? null,
      description: jsonLd.description ? stripHtml(String(jsonLd.description)).slice(0, 5000) : null,
      location: extractJobLocation(jsonLd) ?? null,
      salary_range: extractSalaryRange(jsonLd),
      source_type: sourceType,
      url: "",
      partial: false,
      confidence: "high",
    }
  }

  const ogTitle = extractOgMeta(html, "og:title") ?? ""
  const atMatch = parseRoleAtCompany(ogTitle)
  return {
    company: atMatch?.company ?? extractOgMeta(html, "og:site_name") ?? null,
    role: (atMatch?.role ?? extractH1(html) ?? ogTitle.replace(/\s*\|.*$/, "").trim()) || null,
    description: extractOgMeta(html, "og:description") ?? null,
    location: null, salary_range: null,
    source_type: sourceType, url: "",
    partial: true, confidence: "low",
  }
}

function extractJsonLd(html: string): Record<string, unknown> | null {
  const matches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const m of matches) {
    try {
      const obj = JSON.parse(m[1])
      if (obj?.["@type"] === "JobPosting") return obj
      if (Array.isArray(obj?.["@graph"])) {
        const job = (obj["@graph"] as Record<string, unknown>[]).find(n => n["@type"] === "JobPosting")
        if (job) return job
      }
    } catch { /* skip */ }
  }
  return null
}

function extractOgMeta(html: string, prop: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"))
  return m ? decodeHtmlEntities(m[1].trim()) : null
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? decodeHtmlEntities(m[1].trim()) : null
}

function extractH1(html: string): string | null {
  const m = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  return m ? decodeHtmlEntities(m[1].trim()) : null
}

function extractJobLocation(jsonLd: Record<string, unknown>): string | null {
  const loc = jsonLd.jobLocation as Record<string, unknown> | undefined
  if (!loc) return null
  const addr = loc.address as Record<string, unknown> | undefined
  if (addr) return [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(", ") || null
  return typeof loc === "string" ? loc : null
}

function extractSalaryRange(jsonLd: Record<string, unknown>): string | null {
  const s = jsonLd.baseSalary as Record<string, unknown> | undefined
  if (!s) return null
  const val = s.value as Record<string, unknown> | undefined
  if (!val) return null
  const currency = (s.currency as string) ?? ""
  const min = val.minValue; const max = val.maxValue
  if (min && max) return `${currency}${min}–${max}`
  if (min) return `${currency}${min}+`
  return null
}

// Parse "Role at Company | Suffix" or "Role - Company | Suffix"
function parseRoleAtCompany(title: string): { role: string; company: string } | null {
  if (!title) return null
  // "Role at Company | anything" or "Role at Company"
  const atMatch = title.match(/^(.+?)\s+at\s+([^|]+?)(?:\s*\||$)/i)
  if (atMatch) {
    const role = atMatch[1].trim()
    const company = atMatch[2].trim()
    // Sanity: both should be non-trivial
    if (role.length > 2 && company.length > 1) return { role, company }
  }
  return null
}

function extractVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim()
}

function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
}

function toTitleCase(s: string): string {
  if (!s) return s
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim()
}

// ── AI fallback ───────────────────────────────────────────────────────────────

async function aiExtract(
  text: string,
  url: string,
  openaiKey: string,
): Promise<Omit<JobImportResult, "source_type" | "url"> | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: `Extract job posting data from this page. Return JSON: company, role, description (max 2000 chars), location, salary_range, partial (true if any field uncertain).

URL: ${url}

Text:
${text}`,
        }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const p = JSON.parse(data.choices[0].message.content)
    return {
      company: p.company ?? null, role: p.role ?? null,
      description: p.description?.slice(0, 5000) ?? null,
      location: p.location ?? null, salary_range: p.salary_range ?? null,
      partial: !!p.partial, confidence: "medium",
    }
  } catch { return null }
}

// ── Result helpers ────────────────────────────────────────────────────────────

function partialResult(
  url: URL,
  sourceType: string,
  company: string | null,
  error?: string,
): JobImportResult {
  return {
    company, role: null, description: null, location: null, salary_range: null,
    source_type: sourceType, url: url.toString(),
    partial: true, confidence: "low", error,
  }
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

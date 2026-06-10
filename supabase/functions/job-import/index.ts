// Universal job import: URL → structured job data
// Supports: Greenhouse, Lever, Ashby, Workday, LinkedIn job posts, generic career pages
// Called pre-save — never creates the job itself; returns extracted fields for user preview.
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
  source_type: string       // 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'linkedin' | 'generic'
  url: string
  partial: boolean          // true if extraction was incomplete
  error?: string
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 })

  let body: { url?: string } = {}
  try { body = await req.json() } catch { /* ignore */ }

  const rawUrl = body.url?.trim()
  if (!rawUrl) {
    return json({ error: "url is required" }, 400)
  }

  let parsed: URL
  try { parsed = new URL(rawUrl) } catch {
    return json({ error: "Invalid URL" }, 400)
  }

  const host = parsed.hostname.toLowerCase()

  try {
    let result: JobImportResult

    if (host.includes("greenhouse.io") || host.includes("greenhouse-mail.io")) {
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
    return json({ error: "Extraction failed", url: rawUrl, partial: true, source_type: "generic",
      company: null, role: null, description: null, location: null, salary_range: null }, 500)
  }
})

// ── Greenhouse ──────────────────────────────────────────────────────────────
// Public API: boards-api.greenhouse.io/v1/boards/{company}/jobs/{id}

async function extractGreenhouse(url: URL): Promise<JobImportResult> {
  // Patterns:
  //   boards.greenhouse.io/{company}/jobs/{id}
  //   {company}.greenhouse.io/jobs/{id}?gh_jid={id}
  const path = url.pathname  // e.g. /wiz/jobs/123456
  const parts = path.split("/").filter(Boolean)

  let company = ""
  let jobId = ""

  if (url.hostname === "boards.greenhouse.io") {
    // /companyslug/jobs/123456
    company = parts[0] ?? ""
    jobId = parts[2] ?? ""
  } else {
    // {company}.greenhouse.io/jobs/123456 or ?gh_jid=123456
    company = url.hostname.split(".")[0]
    jobId = parts[1] ?? url.searchParams.get("gh_jid") ?? ""
  }

  if (!company || !jobId) {
    return await extractGeneric(url)
  }

  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${jobId}`
  const res = await fetch(apiUrl, { headers: { "User-Agent": "JobMaker/1.0" } })
  if (!res.ok) return await extractGeneric(url)

  const data = await res.json()

  const description = data.content
    ? stripHtml(data.content).slice(0, 5000)
    : null

  return {
    company: toTitleCase(data.departments?.[0]?.name ? company : company),
    role: data.title ?? null,
    description,
    location: data.location?.name ?? null,
    salary_range: null,
    source_type: "greenhouse",
    url: url.toString(),
    partial: false,
  }
}

// ── Lever ───────────────────────────────────────────────────────────────────
// Public API: api.lever.co/v0/postings/{company}/{posting-id}

async function extractLever(url: URL): Promise<JobImportResult> {
  // jobs.lever.co/{company}/{posting-uuid}
  const parts = url.pathname.split("/").filter(Boolean)
  const company = parts[0] ?? ""
  const postingId = parts[1] ?? ""

  if (!company || !postingId) return await extractGeneric(url)

  const apiUrl = `https://api.lever.co/v0/postings/${company}/${postingId}`
  const res = await fetch(apiUrl, { headers: { "User-Agent": "JobMaker/1.0" } })
  if (!res.ok) return await extractGeneric(url)

  const data = await res.json()

  // Lever returns lists of {text, content} — concatenate into description
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
    company: toTitleCase(data.team ?? company),
    role: data.text ?? null,
    description: descParts.join("\n").slice(0, 5000) || null,
    location: data.categories?.location ?? null,
    salary_range: null,
    source_type: "lever",
    url: url.toString(),
    partial: false,
  }
}

// ── Ashby ───────────────────────────────────────────────────────────────────
// No official public API — extract from page HTML / JSON-LD

async function extractAshby(url: URL): Promise<JobImportResult> {
  const html = await fetchHtml(url.toString())
  if (!html) return partialResult(url, "ashby")

  const jsonLd = extractJsonLd(html)
  if (jsonLd?.["@type"] === "JobPosting") {
    return {
      company: jsonLd.hiringOrganization?.name ?? extractOgMeta(html, "og:site_name") ?? null,
      role: jsonLd.title ?? extractOgMeta(html, "og:title") ?? null,
      description: jsonLd.description ? stripHtml(jsonLd.description).slice(0, 5000) : null,
      location: extractJobLocation(jsonLd) ?? null,
      salary_range: extractSalaryRange(jsonLd),
      source_type: "ashby",
      url: url.toString(),
      partial: false,
    }
  }

  // Fall back to OG tags
  return {
    company: extractOgMeta(html, "og:site_name") ?? null,
    role: extractOgMeta(html, "og:title") ?? extractTitle(html),
    description: extractOgMeta(html, "og:description") ?? null,
    location: null,
    salary_range: null,
    source_type: "ashby",
    url: url.toString(),
    partial: true,
  }
}

// ── Workday ─────────────────────────────────────────────────────────────────
// SPA — extract from page title and subdomain

async function extractWorkday(url: URL): Promise<JobImportResult> {
  // {company}.wd{n}.myworkdayjobs.com/...
  const subdomain = url.hostname.split(".")[0]
  const companyName = toTitleCase(subdomain)

  const html = await fetchHtml(url.toString())
  if (!html) return partialResult(url, "workday", companyName)

  // Workday renders client-side but initial HTML often has title
  const pageTitle = extractTitle(html)
  // Title is usually: "Job Title | Company" or "Company | Job Title"
  let role: string | null = null
  if (pageTitle) {
    const sep = pageTitle.indexOf(" | ")
    role = sep >= 0 ? pageTitle.slice(0, sep).trim() : pageTitle.replace(/workday/i, "").trim()
  }

  const jsonLd = extractJsonLd(html)
  if (jsonLd?.["@type"] === "JobPosting") {
    return {
      company: jsonLd.hiringOrganization?.name ?? companyName,
      role: jsonLd.title ?? role,
      description: jsonLd.description ? stripHtml(jsonLd.description).slice(0, 5000) : null,
      location: extractJobLocation(jsonLd) ?? null,
      salary_range: extractSalaryRange(jsonLd),
      source_type: "workday",
      url: url.toString(),
      partial: false,
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
  }
}

// ── LinkedIn ─────────────────────────────────────────────────────────────────
// Public job pages return og:title even without auth

async function extractLinkedIn(url: URL): Promise<JobImportResult> {
  // Normalise URL: prefer /jobs/view/{id} form
  const html = await fetchHtml(url.toString(), {
    // LinkedIn needs a realistic User-Agent to avoid serving error pages
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  })

  if (!html) return partialResult(url, "linkedin")

  const jsonLd = extractJsonLd(html)
  if (jsonLd?.["@type"] === "JobPosting") {
    return {
      company: jsonLd.hiringOrganization?.name ?? null,
      role: jsonLd.title ?? null,
      description: jsonLd.description ? stripHtml(jsonLd.description).slice(0, 5000) : null,
      location: extractJobLocation(jsonLd) ?? null,
      salary_range: extractSalaryRange(jsonLd),
      source_type: "linkedin",
      url: url.toString(),
      partial: false,
    }
  }

  // OG title is usually "{Role} at {Company} | LinkedIn"
  const ogTitle = extractOgMeta(html, "og:title") ?? ""
  const atMatch = ogTitle.match(/^(.+?)\s+at\s+(.+?)\s*(?:\||$)/i)
  return {
    company: atMatch ? atMatch[2].trim() : null,
    role: atMatch ? atMatch[1].trim() : ogTitle.replace(/\s*\|\s*LinkedIn$/, "").trim() || null,
    description: extractOgMeta(html, "og:description") ?? null,
    location: null,
    salary_range: null,
    source_type: "linkedin",
    url: url.toString(),
    partial: !atMatch,
  }
}

// ── Generic ──────────────────────────────────────────────────────────────────
// Works for most career pages with standard HTML/JSON-LD

async function extractGeneric(url: URL): Promise<JobImportResult> {
  const html = await fetchHtml(url.toString())
  if (!html) return partialResult(url, "generic")

  const jsonLd = extractJsonLd(html)
  if (jsonLd?.["@type"] === "JobPosting") {
    return {
      company: jsonLd.hiringOrganization?.name ?? extractOgMeta(html, "og:site_name") ?? null,
      role: jsonLd.title ?? null,
      description: jsonLd.description ? stripHtml(jsonLd.description).slice(0, 5000) : null,
      location: extractJobLocation(jsonLd) ?? null,
      salary_range: extractSalaryRange(jsonLd),
      source_type: "generic",
      url: url.toString(),
      partial: false,
    }
  }

  const ogTitle = extractOgMeta(html, "og:title")
  const ogDesc = extractOgMeta(html, "og:description")
  const pageTitle = extractTitle(html)
  const h1 = extractH1(html)

  // Try AI extraction if we have page content but no schema
  const openaiKey = Deno.env.get("OPENAI_API_KEY")
  if (openaiKey && html.length > 200) {
    const snippet = extractVisibleText(html).slice(0, 3000)
    const ai = await aiExtract(snippet, url.toString(), openaiKey)
    if (ai) return { ...ai, source_type: "generic", url: url.toString() }
  }

  return {
    company: extractOgMeta(html, "og:site_name") ?? url.hostname.replace(/^www\./, ""),
    role: h1 ?? ogTitle ?? pageTitle ?? null,
    description: ogDesc ?? null,
    location: null,
    salary_range: null,
    source_type: "generic",
    url: url.toString(),
    partial: true,
  }
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

async function fetchHtml(url: string, extraHeaders?: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "JobMaker/1.0 (job search tracker; job-import)",
        "Accept": "text/html,application/xhtml+xml",
        ...extraHeaders,
      },
      redirect: "follow",
    })
    if (!res.ok) return null
    const ct = res.headers.get("content-type") ?? ""
    if (!ct.includes("html")) return null
    return await res.text()
  } catch {
    return null
  }
}

function extractJsonLd(html: string): Record<string, unknown> | null {
  const matches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
  for (const m of matches) {
    try {
      const obj = JSON.parse(m[1])
      if (obj?.["@type"] === "JobPosting") return obj
      // Handle @graph arrays
      if (Array.isArray(obj?.["@graph"])) {
        const job = (obj["@graph"] as Record<string, unknown>[]).find(
          (n) => n["@type"] === "JobPosting",
        )
        if (job) return job
      }
    } catch { /* skip malformed */ }
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
  if (addr) {
    return [addr.addressLocality, addr.addressCountry].filter(Boolean).join(", ") || null
  }
  return typeof loc === "string" ? loc : null
}

function extractSalaryRange(jsonLd: Record<string, unknown>): string | null {
  const s = jsonLd.baseSalary as Record<string, unknown> | undefined
  if (!s) return null
  const val = s.value as Record<string, unknown> | undefined
  if (!val) return null
  const min = val.minValue
  const max = val.maxValue
  const currency = s.currency ?? ""
  if (min && max) return `${currency}${min}–${max}`
  if (min) return `${currency}${min}+`
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
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
}

function toTitleCase(s: string): string {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── AI fallback extraction ───────────────────────────────────────────────────

async function aiExtract(
  text: string,
  url: string,
  openaiKey: string,
): Promise<Omit<JobImportResult, "source_type" | "url"> | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: `Extract job posting details from this page text. Return JSON with: company (string|null), role (string|null), description (string|null, max 2000 chars), location (string|null), salary_range (string|null), partial (true if unsure about any field).

Page URL: ${url}

Page text:
${text}`,
        }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const parsed = JSON.parse(data.choices[0].message.content)
    return {
      company: parsed.company ?? null,
      role: parsed.role ?? null,
      description: parsed.description ? parsed.description.slice(0, 5000) : null,
      location: parsed.location ?? null,
      salary_range: parsed.salary_range ?? null,
      partial: !!parsed.partial,
    }
  } catch {
    return null
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function partialResult(url: URL, sourceType: string, company?: string): JobImportResult {
  return {
    company: company ?? null,
    role: null,
    description: null,
    location: null,
    salary_range: null,
    source_type: sourceType,
    url: url.toString(),
    partial: true,
    error: "Could not extract job details — please fill in manually",
  }
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY")
    if (!SERPAPI_KEY) {
      return new Response(JSON.stringify({ error: "Job search API not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { query, location, page = 0 } = await req.json()
    if (!query) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const params = new URLSearchParams({
      engine: "google_jobs",
      q: query,
      api_key: SERPAPI_KEY,
      start: String(page * 10),
    })

    if (location) {
      params.set("location", location)
    }

    const res = await fetch(`https://serpapi.com/search.json?${params}`)

    if (!res.ok) {
      const err = await res.text()
      return new Response(JSON.stringify({ error: `Search API error: ${res.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const data = await res.json()

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const jobs = (data.jobs_results || []).map((job: any) => ({
      id: job.job_id || `${job.title}-${job.company_name}`,
      role: job.title || '',
      company: job.company_name || '',
      location: job.location || '',
      description: job.description || '',
      link: job.share_link || job.related_links?.[0]?.link || '',
      apply_links: (job.apply_options || []).map((opt: any) => ({
        title: opt.title || '',
        link: opt.link || '',
      })),
      source: job.via || '',
      logo: job.thumbnail || '',
      posted: job.detected_extensions?.posted_at || '',
      type: job.detected_extensions?.schedule_type || '',
    }))

    return new Response(JSON.stringify({ jobs, total: jobs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

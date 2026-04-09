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
    const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY")
    if (!RAPIDAPI_KEY) {
      return new Response(JSON.stringify({ error: "Job search API not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { query, location, page = 1 } = await req.json()
    if (!query) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Search using JSearch API
    const params = new URLSearchParams({
      query: location ? `${query} in ${location}` : query,
      page: String(page),
      num_pages: "1",
      date_posted: "week", // Only recent jobs
    })

    const res = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
      headers: {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
      },
    })

    if (!res.ok) {
      const err = await res.text()
      return new Response(JSON.stringify({ error: `Search API error: ${res.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const data = await res.json()
    const jobs = (data.data || []).map((job: any) => ({
      id: job.job_id,
      role: job.job_title || '',
      company: job.employer_name || '',
      location: job.job_city ? `${job.job_city}, ${job.job_country}` : job.job_country || '',
      description: job.job_description || '',
      link: job.job_apply_link || job.job_google_link || '',
      source: job.job_publisher || 'Job Board',
      logo: job.employer_logo || '',
      posted: job.job_posted_at_datetime_utc || '',
      type: job.job_employment_type || '',
      is_remote: job.job_is_remote || false,
    }))

    return new Response(JSON.stringify({ jobs, total: data.total || jobs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

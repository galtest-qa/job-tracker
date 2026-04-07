import { getDb, run } from './db.js'

const jobs = [
  {
    company: 'Wiz',
    role: 'Release Operations Manager',
    link: 'https://www.wiz.io/careers',
    source: 'LinkedIn',
    status: 'Applied',
    description: `About the Role:
We're looking for a Release Operations Manager to own and optimize our software release lifecycle. You'll work cross-functionally with engineering, product, and QA to ensure smooth, reliable releases at scale.

Responsibilities:
- Own the end-to-end release process for our cloud security platform
- Coordinate release schedules across multiple engineering teams
- Build and maintain release automation pipelines (CI/CD)
- Manage release readiness reviews and go/no-go decisions
- Track release metrics and drive continuous improvement
- Work with QA to ensure adequate test coverage before releases
- Manage hotfix and patch processes for critical issues
- Document release processes and train teams on best practices

Requirements:
- 3+ years in release management, release engineering, or DevOps
- Experience with CI/CD tools (Jenkins, GitHub Actions, GitLab CI)
- Strong understanding of software development lifecycle
- Experience working in a fast-paced startup environment
- Excellent cross-functional communication skills
- Experience with cloud-native applications and microservices
- Familiarity with agile/scrum methodologies
- Experience with monitoring and observability tools

Nice to have:
- Background in security or compliance
- Experience with Kubernetes and container orchestration
- Scripting abilities (Python, Bash)`,
    tags: ['Release Ops', 'Cloud Security', 'Startup'],
    notes: 'Strong match - direct competitor to Upwind. Know the domain well.',
    company_overview: 'Leading cloud security platform, unicorn startup',
    company_industry: 'Cloud Security',
    company_size: 'Series D, ~1500 employees',
  },
  {
    company: 'Monday.com',
    role: 'Product Operations Lead',
    link: 'https://monday.com/careers',
    source: 'LinkedIn',
    status: 'Saved',
    description: `About the Role:
We're hiring a Product Operations Lead to bridge the gap between our product, engineering, and go-to-market teams. You'll help us scale how we build, launch, and iterate on products.

Responsibilities:
- Design and implement product operations workflows across teams
- Own the product launch process from planning to post-launch analysis
- Build dashboards and reporting for product KPIs
- Manage the product feedback loop from customers to product teams
- Coordinate cross-functional initiatives between Product, R&D, and Sales
- Run beta programs and early access initiatives
- Analyze product usage data to inform roadmap decisions
- Manage PoC processes for enterprise customers

Requirements:
- 4+ years in product operations, product management, or program management
- Experience managing cross-functional programs at scale
- Strong analytical skills — comfortable with data, metrics, dashboards
- Excellent stakeholder management and communication
- Experience with product management tools (Jira, Productboard, etc.)
- Track record of building processes from scratch in a growth-stage company
- Experience with enterprise customer workflows and PoCs

Nice to have:
- Experience in B2B SaaS
- SQL or BI tool proficiency
- Background in QA or engineering`,
    tags: ['Product Ops', 'B2B SaaS', 'Growth'],
    notes: 'Interesting role - good alignment with PoC and process building experience.',
    company_overview: 'Work management platform, publicly traded',
    company_industry: 'SaaS / Productivity',
    company_size: 'Public, ~2000 employees',
  },
  {
    company: 'Cybereason',
    role: 'Technical Program Manager',
    link: 'https://cybereason.com/careers',
    source: 'Referral',
    status: 'Interviewing',
    description: `About the Role:
Join our team as a Technical Program Manager driving critical initiatives across engineering and product. You'll manage complex programs that span multiple teams and ensure alignment between technical execution and business goals.

Responsibilities:
- Lead cross-team technical programs from inception to delivery
- Coordinate engineering resources across multiple product teams
- Define program milestones, track progress, and communicate status to leadership
- Identify and mitigate risks across program workstreams
- Partner with Product to translate roadmap into executable plans
- Drive process improvements for engineering workflows
- Manage vendor and third-party integrations
- Support release management and deployment coordination

Requirements:
- 5+ years in technical program management or similar role
- Strong technical background — able to engage with engineering on architecture
- Experience with agile at scale (SAFe, Spotify model, etc.)
- Proven track record managing programs with 5+ engineering teams
- PMP or equivalent certification preferred
- Experience with security products or cybersecurity industry
- Advanced proficiency with project management tools
- Strong executive communication skills

Nice to have:
- Experience in endpoint security or EDR products
- DevOps or SRE background
- MBA or technical degree`,
    tags: ['TPM', 'Security', 'Enterprise'],
    notes: 'Referral from Dan. More senior than my experience but the security domain helps. Interview scheduled for next week.',
    interview_notes: 'Prepare: talk about cross-functional coordination at Upwind, release process scaling, PoC management as program management.',
    company_overview: 'Cybersecurity company specializing in endpoint protection',
    company_industry: 'Cybersecurity',
    company_size: 'Growth stage, ~800 employees',
  }
]

async function seed() {
  await getDb()
  for (const job of jobs) {
    run(`
      INSERT INTO jobs (company, role, link, description, source, status, tags, notes,
        interview_notes, company_overview, company_industry, company_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      job.company, job.role, job.link, job.description, job.source,
      job.status, JSON.stringify(job.tags || []), job.notes || '',
      job.interview_notes || '', job.company_overview || '',
      job.company_industry || '', job.company_size || ''
    ])
  }
  console.log(`Seeded ${jobs.length} example jobs.`)
}

seed()

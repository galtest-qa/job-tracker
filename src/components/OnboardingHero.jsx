import React from 'react'

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

const steps = [
  {
    num: 1,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
    title: 'Install the Chrome Extension',
    desc: 'Browse LinkedIn and save jobs to your board with one click — title, company, and description included. No copy-pasting.',
    cta: 'Go to Settings → Extension',
    action: 'settings',
    doneKey: 'extension',
  },
  {
    num: 2,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
    title: 'Upload your resume',
    desc: 'Get an AI match score on every job you save. The AI compares your resume against each job description automatically.',
    cta: 'Upload Resume',
    action: 'resume',
    doneKey: 'resume',
  },
  {
    num: 3,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="21" cy="21" r="1"/><circle cx="3" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
    ),
    title: 'Save your first job',
    desc: 'Use the Chrome extension on any LinkedIn job page, or add a job manually. Your board will start filling up and Today\'s Focus will guide you.',
    cta: '+ Add Job Manually',
    action: 'add',
    doneKey: 'jobs',
  },
]

export default function OnboardingHero({ hasExtension, hasResume, onOpenSettings, onOpenResume, onAddJob }) {
  const done = {
    extension: hasExtension,
    resume: hasResume,
    jobs: false,
  }

  const allDone = done.extension && done.resume

  return (
    <div className="onboarding-hero">
      <div className="onboarding-hero-header">
        <h2 className="onboarding-title">Welcome to Job Maker</h2>
        <p className="onboarding-subtitle">Track your job search, get AI match scores, and land your next role. Complete these steps to get the most out of the platform.</p>
      </div>

      <div className="onboarding-steps">
        {steps.map((step) => {
          const isDone = done[step.doneKey]
          return (
            <div key={step.num} className={`onboarding-step ${isDone ? 'done' : ''}`}>
              <div className="onboarding-step-icon-wrap">
                {isDone
                  ? <div className="onboarding-step-check"><CheckIcon /></div>
                  : <div className="onboarding-step-icon">{step.icon}</div>
                }
              </div>
              <div className="onboarding-step-body">
                <div className="onboarding-step-num">Step {step.num}</div>
                <div className="onboarding-step-title">{step.title}</div>
                <div className="onboarding-step-desc">{step.desc}</div>
              </div>
              {!isDone && (
                <button
                  className={`btn ${step.num === 1 ? 'btn-primary' : 'btn-secondary'} onboarding-step-btn`}
                  onClick={() => {
                    if (step.action === 'settings') onOpenSettings('extension')
                    else if (step.action === 'resume') onOpenResume()
                    else if (step.action === 'add') onAddJob()
                  }}
                >
                  {step.cta}
                </button>
              )}
              {isDone && <span className="onboarding-step-done-label">Done</span>}
            </div>
          )
        })}
      </div>

      {allDone && (
        <div className="onboarding-all-set">
          You're all set! Add your first job using the extension on LinkedIn or manually with the button above.
        </div>
      )}
    </div>
  )
}

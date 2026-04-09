// Bridge: listens for postMessage from the Job Tracker app
// and saves the auth token to chrome.storage for the LinkedIn content script

window.addEventListener('message', (event) => {
  if (event.data?.type === 'job-tracker-connect' && event.data?.accessToken) {
    chrome.storage.local.set({
      supabaseUrl: event.data.supabaseUrl,
      supabaseAnonKey: event.data.supabaseAnonKey,
      accessToken: event.data.accessToken,
      refreshToken: event.data.refreshToken,
      userEmail: event.data.email,
      userId: event.data.userId,
    }, () => {
      // Confirm back to the page
      window.postMessage({ type: 'job-tracker-connected', ok: true }, '*')
    })
  }
})

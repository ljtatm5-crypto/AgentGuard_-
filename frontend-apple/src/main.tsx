import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { USE_MOCK } from './api/client'
import './styles.css'
import './apple.css'
import './mobile.css'
import './legibility.css'

async function bootstrap() {
  if (USE_MOCK) {
    try {
      const { worker } = await import('./mock/browser')
      await worker.start({ onUnhandledRequest: 'warn', quiet: true })
    } catch (error) {
      // The shell must remain visible even when a browser blocks service workers.
      console.error('Mock service worker failed to start', error)
    }
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}

void bootstrap()

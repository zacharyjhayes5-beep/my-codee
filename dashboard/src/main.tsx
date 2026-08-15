import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initRepository } from './lib/repository'

const root = createRoot(document.getElementById('root')!)

/**
 * Storage is opened and the cache filled before the first render, which is
 * what lets every component keep reading its data synchronously. Nothing is
 * painted in the meantime — the app appears fully formed, exactly as it did
 * when the data came straight off localStorage.
 */
initRepository()
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    console.error('Could not open the dashboard’s local storage', error)
    root.render(
      <div className="boot-error">
        <h1>The dashboard can&rsquo;t reach its saved data</h1>
        <p>
          This browser blocked access to local storage. Private or incognito windows
          usually cause it, as do settings that block site data.
        </p>
        <p>Open the dashboard in a normal window and it should load. Nothing has been lost.</p>
      </div>,
    )
  })

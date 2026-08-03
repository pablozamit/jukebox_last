/* eslint-disable react-refresh/only-export-components */
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './ThemeContext'
import { ToastProvider } from './Toast'

const AdminPage = lazy(() => import('./AdminPage.jsx'))

const isAdmin = window.location.pathname === '/admin'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        {isAdmin ? (
          <Suspense fallback={<div className="min-h-screen bg-zinc-950 flex items-center justify-center text-brand-gold">Cargando...</div>}>
            <AdminPage />
          </Suspense>
        ) : (
          <App />
        )}
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)

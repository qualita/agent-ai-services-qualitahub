import { useAuth } from '@/auth/AuthProvider'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

export function LoginPage() {
  const { login, loading } = useAuth()
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')

  return (
    <div className="min-h-screen bg-gradient-to-br from-qhub-cream-light to-qhub-cream flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded shadow-lg border border-qhub-cream-dark/30 overflow-hidden">
          {/* Header band with logo */}
          <div className="bg-qhub-green px-8 py-5">
            <img src="/img/qualitahub_logo_white.png" alt="QualitaHub" className="h-6" />
          </div>

          <div className="p-8">
            {/* Heading */}
            <div className="mb-2">
              <div className="text-lg font-semibold text-slate-800 leading-tight">Bienvenido</div>
            </div>
            <p className="text-sm text-slate-500 mb-8">
              Dashboard de monitorización de Agent AI Services
            </p>

            <p className="text-sm text-slate-600 mb-6">
              Accede con tu cuenta corporativa de Microsoft para continuar.
            </p>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-xs mb-4 bg-red-50 px-3 py-2 rounded">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  {error === 'unauthorized'
                    ? 'Tu cuenta no tiene acceso a esta aplicación. Contacta al administrador.'
                    : 'Error de autenticación. Inténtalo de nuevo.'}
                </span>
              </div>
            )}

            <button
              onClick={login}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-brand-600 text-white py-2.5 px-4 rounded text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
              )}
              <span>{loading ? 'Verificando sesión...' : 'Continuar con Microsoft'}</span>
            </button>

            <p className="text-xs text-slate-400 mt-6 text-center">
              Conexión segura mediante Microsoft Entra ID
            </p>
          </div>

          {/* Footer */}
          <div className="bg-qhub-cream-light px-8 py-4 border-t border-qhub-cream-dark/30">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Agent AI Services</span>
              <span>QualitaHub</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

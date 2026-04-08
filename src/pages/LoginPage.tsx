import { useAuth } from '@/auth/AuthProvider'
import { AlertCircle, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

export function LoginPage() {
  const { login, loading } = useAuth()
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-6 py-4">
        <img src="/img/qualitahub_logo_white.png" alt="QualitaHub" className="h-5 opacity-80" />
        <div className="h-4 w-px bg-white/20" />
        <span className="text-sm text-white/50 font-medium">Agent AI Services</span>
      </header>

      {/* Centered card */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
            {/* Logo area */}
            <div className="pt-10 pb-6 text-center">
              <img
                src="/img/qualitahub_logo_white.png"
                alt="QualitaHub"
                className="h-6 mx-auto brightness-0"
              />
              <h1 className="text-2xl font-semibold text-slate-900 mt-5">Bienvenido</h1>
              <p className="text-sm text-slate-500 mt-1">
                Dashboard de monitorización de Agent AI Services
              </p>
            </div>

            {/* Action area */}
            <div className="px-8 pb-6">
              <p className="text-sm text-slate-600 text-center mb-6">
                Accede con tu cuenta corporativa de Microsoft para continuar
              </p>

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-xs mb-4 bg-red-50 px-3 py-2.5 rounded-lg">
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
                className="w-full flex items-center justify-center gap-3 bg-gray-900 text-white py-3 px-4 rounded-xl text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-60 shadow-lg shadow-gray-900/20"
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
            </div>

            {/* Divider */}
            <div className="mx-8">
              <div className="border-t border-slate-100" />
            </div>

            {/* Features */}
            <div className="px-8 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                Funcionalidades disponibles
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-brand-500 flex-shrink-0" />
                  Monitorización de ejecuciones de agentes
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-brand-500 flex-shrink-0" />
                  Gestión de usuarios y permisos
                </li>
              </ul>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-8 py-4 border-t border-slate-100">
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Conexión segura mediante Microsoft Entra ID</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

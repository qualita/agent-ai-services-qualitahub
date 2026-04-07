import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { AlertCircle } from 'lucide-react'

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'email' | 'password'>('email')

  const handleEmailNext = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Introduce your email address.')
      return
    }
    setError('')
    setStep('password')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const ok = await login(email, password)
    setLoading(false)
    if (!ok) setError('Incorrect credentials. Use admin@agentai.demo or viewer@agentai.demo with password demo123.')
  }

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
            {/* Sign in heading */}
            <div className="mb-8">
              <div className="text-base font-semibold text-slate-800 leading-tight">Sign in</div>
            </div>

            {step === 'email' ? (
              <form onSubmit={handleEmailNext}>
                <p className="text-sm text-slate-600 mb-4">
                  Use your organizational account to access{' '}
                  <span className="font-semibold text-slate-800">Agent AI Services</span>.
                </p>

                <div className="mb-4">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@organization.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    autoFocus
                    autoComplete="email"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-xs mb-4">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <p className="text-xs text-slate-400 mb-6">
                  Authentication powered by Microsoft Entra ID.
                </p>

                <button
                  type="submit"
                  className="w-full bg-brand-600 text-white py-2 px-4 rounded text-sm font-medium hover:bg-brand-700 transition-colors"
                >
                  Next
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin}>
                <button
                  type="button"
                  onClick={() => { setStep('email'); setError('') }}
                  className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 mb-4"
                >
                  <span className="text-xs">&larr;</span>
                  <span>{email}</span>
                </button>

                <p className="text-sm text-slate-600 mb-4">Enter password</p>

                <div className="mb-4">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    autoFocus
                    autoComplete="current-password"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-xs mb-4">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-600 text-white py-2 px-4 rounded text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-60"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            )}
          </div>

          {/* Footer */}
          <div className="bg-qhub-cream-light px-8 py-4 border-t border-qhub-cream-dark/30">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Agent AI Services</span>
              <span>QualitaHub</span>
            </div>
          </div>
        </div>

        {/* Demo credentials hint */}
        <div className="mt-4 bg-white rounded border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Demo credentials</p>
          <div className="space-y-1 text-xs text-slate-600">
            <p><span className="font-mono bg-slate-100 px-1 rounded">admin@agentai.demo</span> / <span className="font-mono bg-slate-100 px-1 rounded">demo123</span> — Full access</p>
            <p><span className="font-mono bg-slate-100 px-1 rounded">viewer@agentai.demo</span> / <span className="font-mono bg-slate-100 px-1 rounded">demo123</span> — Restricted view</p>
          </div>
        </div>
      </div>
    </div>
  )
}

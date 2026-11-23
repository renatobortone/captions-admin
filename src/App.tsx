import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Check, Eye, EyeOff, Headphones, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Sparkles, X } from 'lucide-react'
import { apiRequest, authBody, type User } from './api'
import LicenseAdmin from './LicenseAdmin'
import UserPortal from './UserPortal'
import captionsIcon from './assets/captions-icon.png'

type Mode = 'login' | 'register' | 'forgot'
type Notice = { kind: 'success' | 'error'; text: string } | null

const AUTH_CALLBACK_PATH = `${import.meta.env.BASE_URL}auth/callback`.replace(/\/$/, '')

function getErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Algo deu errado. Tente novamente.'
  const message = error.message.trim()
  if (/invalid login credentials|invalid credentials|invalid email or password/i.test(message)) {
    return 'E-mail ou senha incorretos. Confira os dados e tente novamente.'
  }
  if (/already registered|already exists|user exists/i.test(message)) {
    return 'Este e-mail já possui uma conta. Entre ou use outro e-mail.'
  }
  return message
}

function App() {
  const [mode, setMode] = useState<Mode>('login')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [callbackError, setCallbackError] = useState('')

  const readSession = useCallback(async () => {
    try {
      const response = await apiRequest<{ user: User }>('/v1/me')
      setUser(response.user)
      return true
    } catch {
      setUser(null)
      return false
    } finally {
      setSessionLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function initialize() {
      const isCallback = window.location.pathname.replace(/\/$/, '') === AUTH_CALLBACK_PATH
      const callbackQuery = new URLSearchParams(window.location.search)
      const isRecovery = isCallback && callbackQuery.get('flow') === 'recovery'
      if (isCallback && isRecovery && !window.location.hash) {
        try {
          await apiRequest('/v1/me')
          if (!cancelled) setRecoveryMode(true)
        } catch {
          if (!cancelled) setCallbackError('A sessão de recuperação expirou. Solicite um novo link para redefinir a senha.')
        } finally {
          if (!cancelled) setSessionLoading(false)
        }
        return
      }
      if (isCallback) {
        const hash = new URLSearchParams(window.location.hash.slice(1))
        const accessToken = hash.get('access_token')
        const refreshToken = hash.get('refresh_token')
        const tokenType = hash.get('token_type')
        const authError = hash.get('error_description') || hash.get('error')

        if (authError) {
          if (!cancelled) {
            setCallbackError(isRecovery ? 'O link de recuperação não pôde ser validado. Ele pode ter expirado ou já ter sido usado. Solicite um novo.' : 'O link de confirmação não pôde ser validado. Ele pode ter expirado ou já ter sido usado. Solicite um novo e-mail de confirmação.')
            setSessionLoading(false)
            window.history.replaceState(null, '', isRecovery ? `${AUTH_CALLBACK_PATH}?flow=recovery` : AUTH_CALLBACK_PATH)
          }
          return
        }

        if (accessToken && refreshToken && (!tokenType || tokenType.toLowerCase() === 'bearer')) {
          try {
            const result = await apiRequest<{ user: User }>('/v1/auth/exchange', {
              method: 'POST',
              body: JSON.stringify({ accessToken, refreshToken, client: 'browser' }),
            })
            if (!cancelled) {
              if (!isRecovery) setUser(result.user)
              setNotice({ kind: 'success', text: isRecovery ? 'Sessão de recuperação validada. Escolha sua nova senha.' : 'Acesso concluído.' })
              setRecoveryMode(isRecovery)
            }
          } catch (error) {
            if (!cancelled) setCallbackError(getErrorMessage(error))
          } finally {
            if (!cancelled) {
              setSessionLoading(false)
              window.history.replaceState(null, '', isRecovery ? `${AUTH_CALLBACK_PATH}?flow=recovery` : AUTH_CALLBACK_PATH)
            }
          }
          return
        }

        if (!cancelled) {
          const foundSession = await readSession()
          if (!foundSession) {
            setCallbackError('Não encontramos uma sessão completa neste link. Abra o link completo recebido por e-mail ou solicite outro.')
          }
        }
        return
      }

      try {
        const response = await apiRequest<{ user: User }>('/v1/me')
        if (!cancelled) setUser(response.user)
      } catch {
        if (!cancelled) {
          try {
            await apiRequest('/v1/auth/refresh', {
              method: 'POST',
              body: JSON.stringify({ client: 'browser' }),
            })
            const refreshed = await apiRequest<{ user: User }>('/v1/me')
            if (!cancelled) setUser(refreshed.user)
          } catch {
            if (!cancelled) setUser(null)
          }
        }
      } finally {
        if (!cancelled) setSessionLoading(false)
      }
    }
    void initialize()
    return () => { cancelled = true }
  }, [readSession])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    setLoading(true)
    try {
      if (recoveryMode) {
        if (newPassword !== confirmNewPassword) {
          throw new Error('As senhas não coincidem.')
        }
        await apiRequest('/v1/auth/password/reset', {
          method: 'POST',
          body: JSON.stringify({ password: newPassword }),
        })
        try {
          await apiRequest('/v1/auth/logout', { method: 'POST', body: JSON.stringify({ client: 'browser' }) })
        } catch {
          // The password has changed and the API reset endpoint already clears its cookies.
        }
        setRecoveryMode(false)
        setNewPassword('')
        setConfirmNewPassword('')
        setUser(null)
        window.history.replaceState(null, '', AUTH_CALLBACK_PATH)
        setNotice({ kind: 'success', text: 'Senha atualizada. Entre com sua nova senha.' })
      } else if (mode === 'register') {
        await apiRequest('/v1/auth/register', {
          method: 'POST',
          body: JSON.stringify(authBody(email, password)),
        })
        setNotice({ kind: 'success', text: 'Cadastro concluído com sucesso! Você já pode entrar na sua conta.' })
        setMode('login')
        setPassword('')
      } else if (mode === 'forgot') {
        const result = await apiRequest('/v1/auth/password/forgot', {
          method: 'POST',
          body: JSON.stringify({ email, client: 'browser' }),
        })
        setNotice({ kind: 'success', text: result.message || 'Se a conta existir, enviaremos as instruções para redefinir a senha.' })
        setMode('login')
        setPassword('')
      } else {
        const result = await apiRequest<{ user: User }>('/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify(authBody(email, password)),
        })
        setUser(result.user)
        setPassword('')
      }
    } catch (error) {
      setNotice({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    setLoading(true)
    setNotice(null)
    try {
      await apiRequest('/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ client: 'browser' }),
      })
      setUser(null)
      setNotice({ kind: 'success', text: 'Você saiu da sua conta com segurança.' })
    } catch (error) {
      setNotice({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setNotice(null)
    setCallbackError('')
    setPassword('')
  }

  const callbackRoute = window.location.pathname.replace(/\/$/, '') === AUTH_CALLBACK_PATH

  if (sessionLoading) {
    return <main className="boot-screen" aria-label="Carregando sua conta"><div className="boot-mark"><Sparkles size={21} /></div><LoaderCircle className="spinner" size={21} /><span>Preparando seu espaço</span></main>
  }

  if (user) {
    if (user.role === 'admin') {
      return <LicenseAdmin user={user} onLogout={() => void handleLogout()} />
    }
    return <UserPortal user={user} onLogout={() => void handleLogout()} />
  }

  return (
    <main className="auth-page">
      <div className="auth-visual" aria-hidden="true">
        <div className="visual-grain" />
        <div className="visual-header"><Brand light /><span className="studio-tag"><span className="live-dot" /> FEITO PARA SHOWS AO VIVO</span></div>
        <div className="visual-main">
          <p className="visual-kicker"><span /> DIREÇÃO DE PALCO · BACKSTAGE · HOUSEMIX · BANDA</p>
          <h2>A comunicação<br />do evento.<br /><em>Em tempo real.</em></h2>
          <p className="visual-description">Transcreva em tempo real a comunicação entre Direção de Palco, Backstage, HouseMix e banda — da passagem de som ao último acorde.</p>
          <div className="visual-art">
            <div className="art-ring ring-back" /><div className="art-ring ring-front" />
            <div className="art-core"><div className="core-glow" /><div className="core-wave"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><span>AO VIVO<br />NO EVENTO</span></div>
            <div className="art-caption cap-one">Direção · HouseMix</div><div className="art-caption cap-two">[ canais em sintonia ]</div>
            <div className="art-stars">✳ <span>✳</span></div>
          </div>
        </div>
        <div className="visual-bottom"><span>DA PASSAGEM DE SOM AO ÚLTIMO ACORDE</span><span className="bottom-line" /><span>CAPTIONS</span></div>
      </div>
      <section className="auth-panel">
        <div className="mobile-brand"><Brand /></div>
        <div className="auth-card">
          <div className="auth-heading">
            <span className="auth-overline">CAPTIONS · COMUNICAÇÃO EM TEMPO REAL</span>
            <h1>{callbackRoute && callbackError ? 'Link não confirmado' : recoveryMode ? 'Crie uma nova senha.' : mode === 'login' ? 'Bom ter você de volta.' : mode === 'forgot' ? 'Recupere seu acesso.' : 'Crie sua conta Captions.'}</h1>
            <p>{callbackRoute && callbackError ? 'Não foi possível validar este link. Você pode solicitar outro.' : recoveryMode ? 'Escolha uma senha segura para voltar à sua conta.' : mode === 'login' ? 'Entre para acompanhar as licenças e a comunicação dos seus eventos.' : mode === 'forgot' ? 'Enviaremos instruções para redefinir sua senha.' : 'Acompanhe a comunicação entre Direção de Palco, Backstage, HouseMix e banda.'}</p>
          </div>

          {callbackError && <div className="notice error-notice callback-notice" role="alert"><X size={17} /><span>{callbackError}</span></div>}
          {notice && <div className={`notice ${notice.kind === 'error' ? 'error-notice' : 'success-notice'}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.kind === 'success' ? <Check size={17} /> : <X size={17} />}<span>{notice.text}</span></div>}

          {!recoveryMode && mode !== 'forgot' && <div className="mode-switch" role="tablist" aria-label="Acesso à conta">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Entrar</button>
            <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Criar conta</button>
          </div>}

          <form onSubmit={(event) => void handleSubmit(event)} className="auth-form">
            {!recoveryMode && <>
              <label className="field-label" htmlFor="email">E-mail</label>
              <div className="input-wrap"><Mail size={17} /><input id="email" name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            </>}
            {recoveryMode ? <>
              <label className="field-label" htmlFor="new-password">Nova senha</label>
              <div className="input-wrap"><LockKeyhole size={17} /><input id="new-password" name="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Mínimo de 10 caracteres" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} required /><button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
              <label className="field-label" htmlFor="confirm-new-password">Confirme a nova senha</label>
              <div className="input-wrap"><LockKeyhole size={17} /><input id="confirm-new-password" name="confirm-new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Digite novamente" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} minLength={10} required /></div>
            </> : mode !== 'forgot' && <>
              <div className="password-label-row"><label className="field-label" htmlFor="password">Senha</label>{mode === 'login' && <span className="helper-text">Mínimo de 10 caracteres</span>}</div>
              <div className="input-wrap"><LockKeyhole size={17} /><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Sua senha" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required /><button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
            </>}
            {mode === 'register' && <p className="form-hint">Vamos enviar um link para confirmar seu e-mail.</p>}
            {mode === 'login' && <button className="text-button forgot-link" type="button" onClick={() => switchMode('forgot')}>Esqueci minha senha</button>}
            <button className="button button-primary submit-button" type="submit" disabled={loading}>
              {loading ? <><LoaderCircle size={18} className="spinner" /> Aguarde um instante</> : <>{recoveryMode ? 'Salvar nova senha' : mode === 'login' ? 'Entrar na minha conta' : mode === 'forgot' ? 'Enviar instruções' : 'Criar minha conta'} <ArrowRight size={17} /></>}
            </button>
          </form>
          {(mode === 'forgot' || recoveryMode) && <button className="text-button back-to-login" type="button" onClick={() => { setRecoveryMode(false); switchMode('login') }}>Voltar para entrar</button>}

          <div className="secure-note"><ShieldCheck size={16} /><span>Seus dados protegidos, sempre.</span><span className="secure-divider" /><span>Conexão segura</span></div>
        </div>
        <div className="auth-footer"><span>© 2026 Captions</span><a href="mailto:suporte@captions.app"><Headphones size={15} /> Fale com a gente</a></div>
      </section>
    </main>
  )
}

function Brand({ light = false }: { light?: boolean }) {
  return <a href="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="Captions — início"><img className="brand-logo" src={captionsIcon} alt="" /><span>Captions</span></a>
}

export default App

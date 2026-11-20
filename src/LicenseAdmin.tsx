import { useCallback, useEffect, useState } from 'react'
import { Activity, Check, Clipboard, KeyRound, LoaderCircle, LogOut, Plus, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { apiRequest, type User } from './api'
import captionsIcon from './assets/captions-icon.png'
import './licenses.css'

type License = {
  license_id: string
  name: string
  status: 'active' | 'revoked' | string
  created_at: number
  commercial_expires_at: number | null
  auth_subject: string | null
}

type Activation = {
  activation_id: string
  license_id: string
  installation_id: string
  status: 'active' | 'revoked' | string
  created_at: number
  last_validated_at: number | null
  revoked_at: number | null
  license_status: string
  commercial_expires_at: number | null
  auth_subject: string | null
}

type Tab = 'licenses' | 'activations'
type Feedback = { kind: 'success' | 'error'; text: string } | null

function formatDate(value: number | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function readableError(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return 'Não foi possível concluir a solicitação. Tente novamente.'
}

export default function LicenseAdmin({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('licenses')
  const [licenses, setLicenses] = useState<License[]>([])
  const [activations, setActivations] = useState<Activation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [licenseName, setLicenseName] = useState('')
  const [revoking, setRevoking] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [newKey, setNewKey] = useState('')
  const [copied, setCopied] = useState(false)

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    if (!quiet) setFeedback(null)
    const [licenseResult, activationResult] = await Promise.allSettled([
      apiRequest<{ licenses: License[] }>('/v1/portal/licenses'),
      apiRequest<{ activations: Activation[] }>('/v1/portal/activations'),
    ])
    if (licenseResult.status === 'fulfilled') setLicenses(licenseResult.value.licenses || [])
    if (activationResult.status === 'fulfilled') setActivations(activationResult.value.activations || [])
    const failure = licenseResult.status === 'rejected' ? licenseResult.reason : activationResult.status === 'rejected' ? activationResult.reason : null
    if (failure) setFeedback({ kind: 'error', text: readableError(failure) })
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  async function createLicense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = licenseName.trim()
    if (!name) return
    setCreating(true)
    setFeedback(null)
    setNewKey('')
    try {
      const result = await apiRequest<{ licenseId: string; name: string; licenseKey: string }>('/v1/portal/licenses', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setNewKey(result.licenseKey)
      setLicenseName('')
      setCopied(false)
      setFeedback({ kind: 'success', text: `Licença “${result.name}” criada. Copie a chave agora; ela não será exibida novamente.` })
      await loadData(true)
    } catch (error) {
      setFeedback({ kind: 'error', text: readableError(error) })
    } finally {
      setCreating(false)
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(newKey)
      setCopied(true)
    } catch {
      setFeedback({ kind: 'error', text: 'Não foi possível copiar automaticamente. Selecione e copie a chave manualmente.' })
    }
  }

  async function revokeActivation(activation: Activation) {
    if (!window.confirm('Revogar esta ativação? O Mac perderá o acesso na próxima validação online.')) return
    setRevoking(activation.activation_id)
    setFeedback(null)
    try {
      await apiRequest(`/v1/portal/activations/${encodeURIComponent(activation.activation_id)}`, { method: 'DELETE' })
      setFeedback({ kind: 'success', text: 'Ativação revogada.' })
      await loadData(true)
    } catch (error) {
      setFeedback({ kind: 'error', text: readableError(error) })
    } finally {
      setRevoking(null)
    }
  }

  const activeLicenses = licenses.filter((license) => license.status === 'active').length
  const activeActivations = activations.filter((activation) => activation.status === 'active').length

  return (
    <main className="license-admin-page">
      <header className="license-topbar">
        <a href="/" className="brand" aria-label="Captions — início"><img className="brand-logo" src={captionsIcon} alt="" /><span>Captions</span></a>
        <div className="license-top-actions"><span className="license-admin-badge"><ShieldCheck size={15} /> Administração</span><span className="license-admin-email">{user.email}</span><button className="license-logout" type="button" onClick={onLogout} aria-label="Sair da conta"><LogOut size={16} /><span>Sair</span></button></div>
      </header>

      <section className="license-heading">
        <div><span className="license-eyebrow">PAINEL INTERNO</span><h1>Licenças</h1><p>Emita licenças e acompanhe as instalações ativas.</p></div>
        <button className="license-refresh" type="button" onClick={() => void loadData(true)} disabled={refreshing || loading}><RefreshCw size={15} className={refreshing ? 'license-spinning' : ''} /> Atualizar</button>
      </section>

      <section className="license-stats" aria-label="Resumo">
        <article className="license-stat"><span>LICENÇAS ATIVAS</span><strong>{loading ? '—' : activeLicenses}</strong><KeyRound size={18} /></article>
        <article className="license-stat"><span>MACS ATIVOS</span><strong>{loading ? '—' : activeActivations}</strong><Activity size={18} /></article>
        <article className="license-stat"><span>TOTAL DE LICENÇAS</span><strong>{loading ? '—' : licenses.length}</strong><ShieldCheck size={18} /></article>
      </section>

      <section className="license-workspace">
        <div className="license-workspace-header"><div className="license-tabs" role="tablist" aria-label="Gerenciar licenças"><button type="button" role="tab" aria-selected={tab === 'licenses'} className={tab === 'licenses' ? 'selected' : ''} onClick={() => setTab('licenses')}>Licenças <span>{licenses.length}</span></button><button type="button" role="tab" aria-selected={tab === 'activations'} className={tab === 'activations' ? 'selected' : ''} onClick={() => setTab('activations')}>Ativações <span>{activations.length}</span></button></div></div>

        {feedback && <div className={`license-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'success' ? <Check size={16} /> : <X size={16} />}<span>{feedback.text}</span></div>}

        {newKey && <div className="license-key-once"><div><span>CHAVE EXIBIDA UMA ÚNICA VEZ</span><code>{newKey}</code></div><button type="button" onClick={() => void copyKey()}><Clipboard size={15} />{copied ? 'Copiada' : 'Copiar chave'}</button><button className="license-dismiss-key" type="button" aria-label="Dispensar chave" onClick={() => setNewKey('')}><X size={16} /></button></div>}

        {tab === 'licenses' ? <>
          <form className="license-create-form" onSubmit={(event) => void createLicense(event)}><div><label htmlFor="license-name">Nova licença</label><span>O nome ajuda a identificar a pessoa ou organização.</span></div><input id="license-name" value={licenseName} onChange={(event) => setLicenseName(event.target.value)} maxLength={120} placeholder="Ex.: Estúdio Aurora" required /><button type="submit" disabled={creating || !licenseName.trim()}><Plus size={16} />{creating ? 'Criando…' : 'Criar licença'}</button></form>
          <div className="license-table-wrap"><table className="license-table"><thead><tr><th>LICENÇA</th><th>STATUS</th><th>VINCULADA À CONTA</th><th>CRIADA EM</th><th>VALIDADE COMERCIAL</th></tr></thead><tbody>
            {loading ? <tr><td colSpan={5} className="license-empty"><LoaderCircle size={18} className="license-spinning" /> Carregando licenças…</td></tr> : licenses.length === 0 ? <tr><td colSpan={5} className="license-empty">Nenhuma licença cadastrada.</td></tr> : licenses.map((license) => <tr key={license.license_id}><td><strong>{license.name}</strong><small className="license-id">ID · {license.license_id}</small></td><td><span className={`license-status ${license.status === 'active' ? 'active' : 'inactive'}`}>{license.status === 'active' ? 'Ativa' : license.status}</span></td><td>{license.auth_subject ? <span className="license-linked">Vinculada <small>{license.auth_subject.slice(0, 8)}…</small></span> : <span className="license-unlinked">Ainda não reivindicada</span>}</td><td>{formatDate(license.created_at)}</td><td>{formatDate(license.commercial_expires_at)}</td></tr>)}
          </tbody></table></div>
        </> : <div className="license-table-wrap"><table className="license-table"><thead><tr><th>LICENÇA</th><th>ATIVAÇÃO</th><th>STATUS</th><th>ÚLTIMA VALIDAÇÃO</th><th>AÇÃO</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={5} className="license-empty"><LoaderCircle size={18} className="license-spinning" /> Carregando ativações…</td></tr> : activations.length === 0 ? <tr><td colSpan={5} className="license-empty">Nenhuma ativação registrada.</td></tr> : activations.map((activation) => { const license = licenses.find((item) => item.license_id === activation.license_id); return <tr key={activation.activation_id}><td><strong>{license?.name || 'Licença'}</strong><small className="license-id">ID · {activation.license_id}</small></td><td><strong className="device-id">{activation.installation_id}</strong><small className="license-id">Ativada {formatDate(activation.created_at)}</small></td><td><span className={`license-status ${activation.status === 'active' ? 'active' : 'inactive'}`}>{activation.status === 'active' ? 'Ativa' : 'Revogada'}</span></td><td>{formatDate(activation.last_validated_at)}</td><td>{activation.status === 'active' ? <button className="license-revoke" type="button" disabled={revoking === activation.activation_id} onClick={() => void revokeActivation(activation)}>{revoking === activation.activation_id ? <LoaderCircle size={14} className="license-spinning" /> : <X size={14} />} Revogar</button> : <span className="license-revoked-date">{formatDate(activation.revoked_at)}</span>}</td></tr> })}
        </tbody></table></div>}
      </section>
      <footer className="license-admin-footer"><span>© 2026 Captions</span><span>As ações administrativas são autorizadas e auditadas pela API.</span></footer>
    </main>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Activity, CalendarClock, Check, CircleHelp, CreditCard, KeyRound, LoaderCircle, LogOut, Minus, Monitor, Plus, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { apiRequest, type User } from './api'
import captionsIcon from './assets/captions-icon.png'
import './user-portal.css'

type Activation = {
  activation_id: string
  license_id: string
  license_name: string
  installation_id: string
  device_name: string | null
  status: 'active' | 'revoked' | string
  created_at: number
  last_validated_at: number | null
  revoked_at: number | null
}

type Feedback = { kind: 'success' | 'error'; text: string } | null
type Billing = {
  customerId: string | null
  subscription: null | {
    status: string
    seatQuantity: number
    unitAmountMinor: number
    currency: string
    currentPeriodStart: number | null
    currentPeriodEnd: number | null
    cancelAtPeriodEnd: boolean
    canceledAt: number | null
  }
  activeMacs: number
  availableSeats: number
  monthlyUnitAmountMinor: number
  currency: string
  maxSeats: number
}

function formatDate(value: number | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Não foi possível concluir a solicitação. Tente novamente.'
}

export default function UserPortal({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [activations, setActivations] = useState<Activation[]>([])
  const [billing, setBilling] = useState<Billing | null>(null)
  const [billingUnavailable, setBillingUnavailable] = useState(false)
  const [seatQuantity, setSeatQuantity] = useState(1)
  const [billingLoading, setBillingLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const loadBilling = useCallback(async () => {
    try {
      const result = await apiRequest<Billing>('/v1/me/billing')
      setBilling(result)
      setBillingUnavailable(false)
      setBillingLoading(false)
      if (result.subscription) setSeatQuantity(result.subscription.seatQuantity)
    } catch (error) {
      setBillingUnavailable(true)
      setFeedback({ kind: 'error', text: errorMessage(error) })
    } finally {
      setBillingLoading(false)
    }
  }, [])

  const loadActivations = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    try {
      const result = await apiRequest<{ activations: Activation[] }>('/v1/me/activations')
      setActivations(result.activations || [])
      if (!quiet) setFeedback(null)
    } catch (error) {
      setFeedback({ kind: 'error', text: errorMessage(error) })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [loadBilling])

  useEffect(() => {
    void loadActivations()
    void loadBilling()
    const params = new URLSearchParams(window.location.search)
    if (params.has('billing')) {
      const result = params.get('billing')
      window.history.replaceState(null, '', window.location.pathname)
      if (result === 'success') {
        setFeedback({ kind: 'success', text: 'Retorno do checkout recebido. A assinatura será exibida após a confirmação segura do pagamento.' })
        window.setTimeout(() => { void loadBilling() }, 2500)
      } else if (result === 'cancelled') {
        setFeedback({ kind: 'error', text: 'Checkout cancelado. Nenhuma assinatura foi iniciada.' })
      }
    }
  }, [loadActivations, loadBilling])

  async function startCheckout() {
    setBillingLoading(true)
    setFeedback(null)
    try {
      const result = await apiRequest<{ checkoutUrl: string }>('/v1/me/checkout', {
        method: 'POST', body: JSON.stringify({ quantity: seatQuantity }),
      })
      if (!result.checkoutUrl.startsWith('https://checkout.stripe.com/')) throw new Error('A URL de checkout retornada não é segura.')
      window.location.assign(result.checkoutUrl)
    } catch (error) {
      setFeedback({ kind: 'error', text: errorMessage(error) })
      setBillingLoading(false)
    }
  }

  async function openBillingPortal() {
    setPortalLoading(true)
    setFeedback(null)
    try {
      const result = await apiRequest<{ url: string }>('/v1/me/billing-portal', { method: 'POST', body: JSON.stringify({}) })
      if (!result.url.startsWith('https://billing.stripe.com/')) throw new Error('A URL do portal de cobrança retornada não é segura.')
      window.location.assign(result.url)
    } catch (error) {
      setFeedback({ kind: 'error', text: errorMessage(error) })
      setPortalLoading(false)
    }
  }

  async function revokeActivation(activation: Activation) {
    if (!window.confirm(`Desativar este dispositivo? “${activation.license_name}” poderá ser ativada em outro Mac depois.`)) return
    setRevoking(activation.activation_id)
    setFeedback(null)
    try {
      await apiRequest(`/v1/me/activations/${encodeURIComponent(activation.activation_id)}`, { method: 'DELETE' })
      setFeedback({ kind: 'success', text: 'Dispositivo desativado. A licença pode ser ativada em outro Mac.' })
      await Promise.all([loadActivations(true), loadBilling()])
    } catch (error) {
      setFeedback({ kind: 'error', text: errorMessage(error) })
    } finally {
      setRevoking(null)
    }
  }

  const activeCount = activations.filter((activation) => activation.status === 'active').length

  return (
    <main className="user-portal">
      <header className="user-portal-topbar">
        <a href="/" className="brand" aria-label="Captions — início"><img className="brand-logo" src={captionsIcon} alt="" /><span>Captions</span></a>
        <div className="user-portal-actions"><span className="user-portal-secure"><ShieldCheck size={15} /> Área segura</span><span className="user-portal-email">{user.email}</span><button type="button" className="user-portal-logout" onClick={onLogout}><LogOut size={16} /><span>Sair</span></button></div>
      </header>

      <section className="user-portal-heading">
        <div><span className="user-portal-eyebrow">SUA CONTA CAPTIONS</span><h1>Suas licenças</h1><p>Acompanhe suas licenças ativadas e gerencie os Macs conectados à sua conta.</p></div>
        <button type="button" className="user-portal-refresh" onClick={() => void loadActivations(true)} disabled={refreshing || loading}><RefreshCw size={15} className={refreshing ? 'user-portal-spinning' : ''} /> Atualizar</button>
      </section>

      <section className="user-portal-billing" aria-label="Assinatura mensal">
        <div className="user-portal-billing-main"><span className="user-portal-eyebrow">ASSINATURA MENSAL</span>
          {billingUnavailable ? <><h2>Não foi possível carregar a cobrança</h2><p>Atualize a página ou tente novamente em instantes. Nenhuma assinatura foi alterada.</p></> : billing?.subscription ? <><h2>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: billing.subscription.currency }).format(billing.subscription.unitAmountMinor / 100)} <small>/ Mac / mês</small></h2>
            <p><span className={`user-portal-status ${['active', 'trialing'].includes(billing.subscription.status) ? 'active' : 'inactive'}`}>{billing.subscription.cancelAtPeriodEnd ? 'Cancelamento agendado' : billing.subscription.status === 'active' ? 'Ativa' : billing.subscription.status === 'past_due' ? 'Pagamento pendente' : billing.subscription.status === 'suspended' ? 'Suspensa' : billing.subscription.status === 'trialing' ? 'Período de teste' : billing.subscription.status}</span>
              {' · '}{billing.subscription.seatQuantity} {billing.subscription.seatQuantity === 1 ? 'Mac contratado' : 'Macs contratados'} · {billing.activeMacs} Mac(s) em uso{billing.subscription.status === 'past_due' ? ' · tolerância de 7 dias após falha de pagamento' : ''}{billing.subscription.status === 'suspended' ? ' · regularize o pagamento no portal para reativar' : ''}</p>
            <p>{billing.subscription.cancelAtPeriodEnd ? 'Acesso até ' : 'Próxima renovação: '}{formatDate(billing.subscription.currentPeriodEnd)}</p>
          </> : <><h2>R$ 39,90 <small>/ Mac / mês</small></h2><p>Cada Mac permite usar o Captions em um dispositivo por vez. A cobrança só começa após confirmar sua compra na Stripe.</p></>}
        </div>
        <div className="user-portal-billing-action">{billingLoading ? <span className="user-portal-billing-loading"><LoaderCircle size={15} className="user-portal-spinning" /> Carregando cobrança…</span> : billingUnavailable ? null : billing?.subscription && !['canceled', 'incomplete_expired'].includes(billing.subscription.status) ? <button type="button" className="user-portal-manage-billing" onClick={() => void openBillingPortal()} disabled={portalLoading || !billing.customerId}>{portalLoading ? <LoaderCircle size={15} className="user-portal-spinning" /> : <CreditCard size={15} />} Gerenciar cobrança</button> : <><div className="user-portal-seat-picker"><div className="user-portal-seat-picker-heading"><span>Quantos Macs?</span><span>1 Mac por licença</span></div><div className="user-portal-seat-stepper" aria-label="Quantidade de Macs"><button type="button" aria-label="Remover um Mac" onClick={() => setSeatQuantity((quantity) => Math.max(1, quantity - 1))} disabled={billingLoading || seatQuantity <= 1}><Minus size={16} /></button><output aria-live="polite" aria-atomic="true"><strong>{seatQuantity}</strong><span>{seatQuantity === 1 ? 'Mac' : 'Macs'}</span></output><button type="button" aria-label="Adicionar um Mac" onClick={() => setSeatQuantity((quantity) => Math.min(billing?.maxSeats || 10, quantity + 1))} disabled={billingLoading || seatQuantity >= (billing?.maxSeats || 10)}><Plus size={16} /></button></div><div className="user-portal-seat-total"><span>Total mensal</span><strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((billing?.monthlyUnitAmountMinor || 3990) * seatQuantity / 100)} <small>/ mês</small></strong></div></div><button type="button" className="user-portal-manage-billing" onClick={() => void startCheckout()} disabled={billingLoading}>{billingLoading ? <LoaderCircle size={15} className="user-portal-spinning" /> : <Plus size={15} />} Assinar pela Stripe</button></>}</div>
      </section>

      <section className="user-portal-stats" aria-label="Resumo das licenças">
        <article className="user-portal-stat"><span>MACS CONTRATADOS</span><strong>{billingLoading ? '—' : billingUnavailable ? '—' : billing?.subscription?.seatQuantity ?? 0}</strong><KeyRound size={18} /></article>
        <article className="user-portal-stat"><span>MACS ATIVOS</span><strong>{loading ? '—' : activeCount}</strong><Activity size={18} /></article>
        <article className="user-portal-stat"><span>CONTA</span><strong className="user-portal-verified">Ativa</strong><ShieldCheck size={18} /></article>
      </section>

      <section className="user-portal-workspace">
        <div className="user-portal-workspace-heading"><div><h2>Dispositivos e licenças</h2><p>Desative um Mac para liberar a licença e usá-la em outro dispositivo.</p></div><span className="user-portal-count">{loading ? '…' : `${activations.length} ${activations.length === 1 ? 'licença' : 'licenças'}`}</span></div>
        {feedback && <div className={`user-portal-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'success' ? <Check size={16} /> : <X size={16} />}<span>{feedback.text}</span></div>}
        {loading ? <div className="user-portal-empty"><LoaderCircle size={19} className="user-portal-spinning" /> Carregando suas licenças…</div> : activations.length === 0 ? <div className="user-portal-empty"><KeyRound size={20} /><strong>Nenhuma licença ativada ainda</strong><span>Quando você ativar o Captions em um Mac, a licença e o dispositivo aparecerão aqui.</span></div> : <div className="user-portal-list">
          {activations.map((activation) => <article className="user-portal-license" key={activation.activation_id}>
            <div className="user-portal-license-icon"><Monitor size={19} /></div>
            <div className="user-portal-license-main"><div className="user-portal-license-title"><h3>{activation.device_name || activation.license_name || 'Meu Mac'}</h3><span className={`user-portal-status ${activation.status === 'active' ? 'active' : 'inactive'}`}>{activation.status === 'active' ? 'Ativa' : 'Desativada'}</span></div>
              {activation.device_name && <span className="user-portal-device">{activation.license_name || 'Licença Captions'}</span>}
              <div className="user-portal-meta"><span><CalendarClock size={13} /> Ativada em {formatDate(activation.created_at)}</span><span><Activity size={13} /> Última conexão {formatDate(activation.last_validated_at)}</span></div>
            </div>
            <div className="user-portal-license-action">{activation.status === 'active' ? <button type="button" className="user-portal-deactivate" onClick={() => void revokeActivation(activation)} disabled={revoking === activation.activation_id}>{revoking === activation.activation_id ? <LoaderCircle size={14} className="user-portal-spinning" /> : <X size={14} />} Desativar Mac</button> : <span className="user-portal-revoked">Desativada em {formatDate(activation.revoked_at)}</span>}</div>
          </article>)}
        </div>}
      </section>
      <aside className="user-portal-note"><CircleHelp size={16} /><span>Desativar um Mac não cancela sua licença nem altera sua cobrança. A vaga fica disponível para ativação em outro dispositivo.</span></aside>
      <footer className="user-portal-footer"><span>© 2026 Captions</span><a href="mailto:suporte@captions.app"><CircleHelp size={15} /> Precisa de ajuda?</a></footer>
    </main>
  )
}

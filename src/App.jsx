import { useState, useEffect } from 'react'
import { FORM_INICIAL } from './data/checklists.js'
import { getUsuarioLogado, fazerLogout, isAdmin } from './lib/auth.js'
import { pautasHojeFiscal, concluirPauta, criarProximaRecorrencia } from './lib/pautas.js'
import { buscarAuditoriasReabertas } from './lib/supabase.js'
import { iniciarRastreio, pararRastreio } from './lib/rastreio.js'
import { sincronizarPendentes, contarPendentes } from './lib/offline.js'

import Login                from './pages/Login.jsx'
import GestaoUsuarios       from './pages/GestaoUsuarios.jsx'
import ImportarEquipes      from './pages/ImportarEquipes.jsx'
import GestaoPauta          from './pages/GestaoPauta.jsx'
import HistoricoAuditorias  from './pages/HistoricoAuditorias.jsx'
import Metas                from './pages/Metas.jsx'
import FeedbacksPDF         from './pages/FeedbacksPDF.jsx'
import RelatorioEquipe      from './pages/RelatorioEquipe.jsx'
import Dashboard            from './pages/Dashboard.jsx'
import MapaFiscais          from './pages/MapaFiscais.jsx'
import S0Selecao       from './steps/S0Selecao.jsx'
import S1Identificacao from './steps/S1Identificacao.jsx'
import S3Checklist     from './steps/S3Checklist.jsx'
import S4Fotos         from './steps/S4Fotos.jsx'
import S5Assinatura    from './steps/S5Assinatura.jsx'
import S6Resultado     from './steps/S6Resultado.jsx'

const STEPS = ['Serviço', 'Identificação', 'Checklist', 'Evidências', 'Assinatura', 'Resultado']

export default function App() {
  const [usuario,             setUsuario]             = useState(getUsuarioLogado)
  const [tela,                setTela]                = useState('home')
  const [step,                setStep]                = useState(0)
  const [form,                setForm]                = useState(FORM_INICIAL())
  const [pautasHoje,          setPautasHoje]          = useState([])
  const [pautaAtiva,          setPautaAtiva]          = useState(null)
  const [loadingPauta,        setLoadingPauta]        = useState(false)
  const [auditoriasReabertas, setAuditoriasReabertas] = useState([])
  const [auditoriaEditando,   setAuditoriaEditando]   = useState(null)
  const [fotosAntigas,        setFotosAntigas]        = useState([])

  // Offline
  const [online,           setOnline]           = useState(navigator.onLine)
  const [pendentesOffline, setPendentesOffline] = useState(0)
  const [sincronizando,    setSincronizando]    = useState(false)
  const [msgSync,          setMsgSync]          = useState('')

  const upd  = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const next = () => setStep(s => s + 1)
  const prev = () => setStep(s => s - 1)

  const logout = () => {
    pararRastreio()
    fazerLogout()
    setUsuario(null)
  }

  // FIX 1: Sincroniza pendentes ao carregar o app (caso já esteja online)
  useEffect(() => {
    const syncInicial = async () => {
      if (navigator.onLine) {
        const qtd = await contarPendentes()
        setPendentesOffline(qtd)
        if (qtd > 0) {
          setSincronizando(true)
          setMsgSync(`🔄 Sincronizando ${qtd} auditoria(s) pendente(s)...`)
          try {
            const ok = await sincronizarPendentes((feito, total) => {
              setMsgSync(`🔄 Sincronizando... ${feito}/${total}`)
            })
            setPendentesOffline(0)
            setMsgSync(`✅ ${ok} auditoria(s) sincronizada(s) com sucesso!`)
            setTimeout(() => setMsgSync(''), 4000)
          } catch (e) {
            setMsgSync('❌ Erro ao sincronizar. Tente mais tarde.')
            setTimeout(() => setMsgSync(''), 4000)
          } finally {
            setSincronizando(false)
          }
        }
      } else {
        const qtd = await contarPendentes()
        setPendentesOffline(qtd)
      }
    }
    syncInicial()
  }, [])

  // Detecta transição online/offline
  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true)
      const qtd = await contarPendentes()
      if (qtd > 0) {
        setSincronizando(true)
        setMsgSync(`🔄 Sincronizando ${qtd} auditoria(s) salva(s) offline...`)
        try {
          const ok = await sincronizarPendentes((feito, total) => {
            setMsgSync(`🔄 Sincronizando... ${feito}/${total}`)
          })
          setMsgSync(`✅ ${ok} auditoria(s) sincronizada(s) com sucesso!`)
          setPendentesOffline(0)
          setTimeout(() => setMsgSync(''), 4000)
        } catch (e) {
          setMsgSync('❌ Erro ao sincronizar. Tente mais tarde.')
          setTimeout(() => setMsgSync(''), 4000)
        } finally {
          setSincronizando(false)
        }
      }
    }
    const handleOffline = () => setOnline(false)

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Inicia rastreio automaticamente ao logar
  useEffect(() => {
    if (usuario) iniciarRastreio(usuario)
    return () => { if (!usuario) pararRastreio() }
  }, [usuario])

  const carregarReabertas = async (user) => {
    if (!user) return
    try {
      const reabertas = await buscarAuditoriasReabertas(user.login)
      setAuditoriasReabertas(reabertas)
    } catch (e) { setAuditoriasReabertas([]) }
  }

  useEffect(() => {
    if (usuario && tela === 'home') carregarReabertas(usuario)
  }, [usuario, tela])

  const iniciarAuditoria = async () => {
    setLoadingPauta(true)
    try {
      const pautas = await pautasHojeFiscal(usuario.login)
      setPautasHoje(pautas)
      setPautaAtiva(null)
    } catch (e) { setPautasHoje([]) }
    finally { setLoadingPauta(false) }
    setAuditoriaEditando(null)
    setFotosAntigas([])
    // FIX 2: Pré-preenche fiscal e matrícula do usuário logado (funciona offline)
    setForm({
      ...FORM_INICIAL(),
      fiscal:    usuario.nome      || '',
      matricula: usuario.matricula || '',
    })
    setStep(0)
    setTela('auditoria')
  }

  const editarAuditoriaReaberta = (auditoria) => {
    setAuditoriaEditando(auditoria.id)
    setFotosAntigas(auditoria.fotos_urls || [])
    setForm({
      ...FORM_INICIAL(),
      fiscal:           auditoria.fiscal           || '',
      matricula:        auditoria.matricula         || '',
      prefixo:          auditoria.prefixo           || '',
      os:               auditoria.os               || '',
      uc:               auditoria.uc               || '',
      endereco:         auditoria.endereco          || '',
      lat:              auditoria.lat               || '',
      lng:              auditoria.lng               || '',
      data:             auditoria.data_auditoria    || '',
      hora:             auditoria.hora_auditoria    || '',
      tipoAuditoria:    auditoria.tipo_auditoria    || 'DESEMPENHO',
      tipoServico:      auditoria.tipo_servico      || 'CORTE',
      produtivo:        auditoria.produtivo         ?? true,
      respostas:        auditoria.respostas         || {},
      feedback:         auditoria.feedback          || '',
      observacoes:      auditoria.observacoes       || '',
      nomeEletricista:  auditoria.nome_eletricista  || '',
      nomeEletricista2: auditoria.nome_eletricista2 || '',
      fotos:            [],
      assinatura:       null,
      assinatura2:      null,
    })
    setPautasHoje([])
    setPautaAtiva(null)
    setStep(0)
    setTela('auditoria')
  }

  const onAuditoriaSalva = async (auditoria_id) => {
    contarPendentes().then(setPendentesOffline)
    if (auditoriaEditando) {
      setAuditoriaEditando(null)
      setFotosAntigas([])
      setAuditoriasReabertas(prev => prev.filter(a => a.id !== auditoriaEditando))
      return
    }
    if (pautaAtiva) {
      try {
        await concluirPauta(pautaAtiva.id, auditoria_id)
        await criarProximaRecorrencia(pautaAtiva)
        setPautaAtiva(null)
        setPautasHoje(prev => prev.filter(p => p.id !== pautaAtiva.id))
      } catch (e) { console.error('Erro ao concluir pauta:', e) }
    }
  }

  if (!usuario) return <Login onLogin={u => setUsuario(u)} />
  if (tela === 'gestao')       return <GestaoUsuarios      usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'importar')     return <ImportarEquipes     onVoltar={() => setTela('home')} />
  if (tela === 'pauta')        return <GestaoPauta         usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'historico')    return <HistoricoAuditorias usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'metas')        return <Metas               usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'feedbacks')    return <FeedbacksPDF        usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'relat-equipe') return <RelatorioEquipe     usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'dashboard')    return <Dashboard           usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'mapa-fiscais') return <MapaFiscais         usuarioLogado={usuario} onVoltar={() => setTela('home')} />

  if (tela === 'home') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 24,
      }}>

        {/* BANNER OFFLINE */}
        {!online && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
            background: '#dc2626', color: '#fff', padding: '10px 16px',
            textAlign: 'center', fontSize: 13, fontWeight: 700,
          }}>
            📵 Sem internet — auditorias serão salvas localmente e sincronizadas ao reconectar
          </div>
        )}

        {/* BANNER SINCRONIZAÇÃO */}
        {msgSync && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
            background: msgSync.startsWith('✅') ? '#16a34a' : msgSync.startsWith('❌') ? '#dc2626' : '#2563eb',
            color: '#fff', padding: '10px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700,
          }}>
            {msgSync}
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: 40, marginTop: (!online || msgSync) ? 40 : 0 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>⚡</div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Auditoria Operacional</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>DPL Construções — Equatorial Energia</p>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.1)', borderRadius: 14,
          padding: '14px 20px', marginBottom: 32, width: '100%', maxWidth: 380,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{usuario.nome}</p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
              {usuario.perfil} · {usuario.base_regiao}
              {!online && <span style={{ color: '#fca5a5', marginLeft: 8 }}>● offline</span>}
              {online  && <span style={{ color: '#86efac', marginLeft: 8 }}>● online</span>}
            </p>
          </div>
          <button onClick={logout} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            padding: '7px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
          }}>Sair</button>
        </div>

        {/* BANNER PENDENTES OFFLINE */}
        {pendentesOffline > 0 && online && (
          <div style={{
            width: '100%', maxWidth: 380, marginBottom: 16,
            background: '#fef3c7', border: '2px solid #f59e0b',
            borderRadius: 14, padding: '12px 16px',
          }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>
              📤 {pendentesOffline} auditoria(s) aguardando sincronização
            </p>
            <button onClick={async () => {
              setSincronizando(true)
              setMsgSync(`🔄 Sincronizando ${pendentesOffline} auditoria(s)...`)
              const ok = await sincronizarPendentes()
              setPendentesOffline(0)
              setMsgSync(`✅ ${ok} auditoria(s) sincronizada(s)!`)
              setSincronizando(false)
              setTimeout(() => setMsgSync(''), 4000)
            }} disabled={sincronizando} style={{
              width: '100%', padding: '9px', borderRadius: 10, border: 'none',
              background: sincronizando ? '#64748b' : '#d97706',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
              {sincronizando ? '⏳ Sincronizando...' : '🔄 Sincronizar agora'}
            </button>
          </div>
        )}

        {/* BANNER AUDITORIAS REABERTAS */}
        {auditoriasReabertas.length > 0 && (
          <div style={{ width: '100%', maxWidth: 380, marginBottom: 20 }}>
            {auditoriasReabertas.map(a => (
              <div key={a.id} style={{
                background: '#fef3c7', border: '2px solid #f59e0b',
                borderRadius: 14, padding: '14px 16px', marginBottom: 10,
              }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#92400e', marginBottom: 4 }}>
                  🔓 Auditoria devolvida para correção
                </p>
                <p style={{ fontSize: 12, color: '#78350f', marginBottom: 10 }}>
                  <strong>{a.prefixo}</strong> · OS {a.os} · {a.data_auditoria}<br />
                  Devolvida por: {a.reaberta_por}
                </p>
                <button onClick={() => editarAuditoriaReaberta(a)} style={{
                  width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                  background: '#d97706', color: '#fff', fontSize: 13,
                  fontWeight: 700, cursor: 'pointer',
                }}>
                  ✏️ Corrigir Auditoria
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>

          <button onClick={iniciarAuditoria} disabled={loadingPauta} style={{
            background: loadingPauta ? '#64748b' : '#2563eb', color: '#fff', border: 'none',
            padding: '18px', borderRadius: 14, fontSize: 17, fontWeight: 800,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            {loadingPauta ? '⏳ Verificando pautas...' : '📋 Iniciar Auditoria'}
          </button>

          <button onClick={() => setTela('historico')} style={{
            background: 'rgba(30,58,95,0.9)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
            padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            📁 Histórico de Auditorias
          </button>

          {isAdmin(usuario) && (
            <>
              <button onClick={() => setTela('dashboard')} style={{
                background: 'linear-gradient(135deg, rgba(37,99,235,0.9), rgba(124,58,237,0.9))', color: '#fff', border: 'none',
                padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                📊 Dashboard / Ranking
              </button>

              <button onClick={() => setTela('mapa-fiscais')} style={{
                background: 'linear-gradient(135deg, rgba(5,150,105,0.9), rgba(6,95,70,0.9))', color: '#fff', border: 'none',
                padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                📍 Fiscais em Campo
              </button>

              <button onClick={() => setTela('metas')} style={{
                background: 'rgba(5,150,105,0.9)', color: '#fff', border: 'none',
                padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                🎯 Metas por Fiscal
              </button>

              <button onClick={() => setTela('feedbacks')} style={{
                background: 'rgba(124,58,237,0.85)', color: '#fff', border: 'none',
                padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                💬 Feedbacks em PDF
              </button>

              <button onClick={() => setTela('relat-equipe')} style={{
                background: 'rgba(194,65,12,0.9)', color: '#fff', border: 'none',
                padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                🚗 Relatório por Equipe
              </button>

              <button onClick={() => setTela('pauta')} style={{
                background: 'rgba(217,119,6,0.9)', color: '#fff', border: 'none',
                padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                📋 Pauta de Fiscalização
              </button>

              <button onClick={() => setTela('gestao')} style={{
                background: 'rgba(124,58,237,0.9)', color: '#fff', border: 'none',
                padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                👥 Gestão de Usuários
              </button>

              <button onClick={() => setTela('importar')} style={{
                background: 'rgba(15,118,110,0.9)', color: '#fff', border: 'none',
                padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                📥 Importar Equipes (CSV)
              </button>
            </>
          )}
        </div>

        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 40 }}>Contrato 1021/2024 — v2.0</p>
      </div>
    )
  }

  const stepProps = { form, upd, setForm, next, prev, setStep }
  return (
    <div className="app-shell">
      <header className="app-header no-print">

        {/* BANNER OFFLINE dentro da auditoria */}
        {!online && (
          <div style={{
            background: '#dc2626', color: '#fff', borderRadius: 8,
            padding: '6px 10px', marginBottom: 6, fontSize: 12, fontWeight: 700, textAlign: 'center',
          }}>
            📵 Offline — auditoria será salva localmente
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            DPL Construções — Equatorial Energia
          </div>
          <button onClick={() => setTela('home')} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          }}>🏠 Home</button>
        </div>
        {auditoriaEditando && (
          <div style={{ background: '#fef3c7', borderRadius: 8, padding: '6px 10px', marginBottom: 6, fontSize: 12, color: '#92400e', fontWeight: 700 }}>
            ✏️ Modo edição — auditoria reaberta
          </div>
        )}
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>Auditoria Operacional de Campo</div>
        <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i < step ? '#3b82f6' : i === step ? '#60a5fa' : 'rgba(255,255,255,0.2)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>{STEPS[step]} — {step + 1}/{STEPS.length}</span>
          {step > 0 && step < 5 && (
            <span style={{ fontSize: 11, opacity: 0.6 }}>
              {form.tipoServico && `${form.tipoServico} · ${form.produtivo ? 'Prod.' : 'Improd.'}`}
            </span>
          )}
        </div>
      </header>

      <main className="app-content">
        {step === 0 && <S0Selecao      {...stepProps} pautasHoje={pautasHoje} pautaAtiva={pautaAtiva} setPautaAtiva={setPautaAtiva} />}
        {step === 1 && <S1Identificacao {...stepProps} pautaAtiva={pautaAtiva} />}
        {step === 2 && <S3Checklist    {...stepProps} />}
        {step === 3 && <S4Fotos        {...stepProps} modoEdicao={!!auditoriaEditando} fotosAntigas={fotosAntigas} />}
        {step === 4 && <S5Assinatura   {...stepProps} />}
        {step === 5 && <S6Resultado    {...stepProps} onAuditoriaSalva={onAuditoriaSalva} auditoriaEditandoId={auditoriaEditando} fotosAntigas={fotosAntigas} isOnline={online} />}
      </main>
    </div>
  )
}

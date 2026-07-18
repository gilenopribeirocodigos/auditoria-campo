import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { FORM_INICIAL } from './data/checklists.js'
import { getUsuarioLogado, fazerLogout, isAdmin, temPermissao, verificarSessao, registrarAtividade, getVersaoApp } from './lib/auth.js'
import { pautasHojeFiscal, pautasFuturasFiscal, concluirPauta, criarProximaRecorrencia } from './lib/pautas.js'
import { buscarAuditoriasReabertas } from './lib/supabase.js'
import { iniciarRastreio, pararRastreio } from './lib/rastreio.js'
import { sincronizarPendentes, contarPendentes } from './lib/offline.js'
import { sincronizarPendentesRegistros, contarPendentesRegistros } from './lib/registros_offline.js'
import { gerarNumeroAS } from './lib/numeroAS.js'

import Login                    from './pages/Login.jsx'
import GestaoUsuarios           from './pages/GestaoUsuarios.jsx'
import ImportarEquipes          from './pages/ImportarEquipes.jsx'
import GestaoPauta              from './pages/GestaoPauta.jsx'
import HistoricoAuditorias      from './pages/HistoricoAuditorias.jsx'
import Metas                    from './pages/Metas.jsx'
import FeedbacksPDF             from './pages/FeedbacksPDF.jsx'
import RelatorioEquipe          from './pages/RelatorioEquipe.jsx'
import Dashboard                from './pages/Dashboard.jsx'
import MapaFiscais              from './pages/MapaFiscais.jsx'
import RegistrosApp             from './RegistrosApp.jsx'
import RegistrosOperacionais    from './pages/RegistrosOperacionais.jsx'
import RelatorioEvidencias      from './pages/RelatorioEvidencias.jsx'
import PaginaAssinar            from './pages/PaginaAssinar.jsx'
// ── NOVO: Módulo de Indisponibilidade ────────────────────────────────────────
import IndisponibilidadePage    from './pages/IndisponibilidadePage.jsx'
import DashboardIndisponibilidade from './pages/DashboardIndisponibilidade.jsx'
import RotinasAdministrativas   from './pages/RotinasAdministrativas.jsx'
import TratamentoNaoConformidades from './pages/TratamentoNaoConformidades.jsx'
import DiagnosticoRastreio      from './pages/DiagnosticoRastreio.jsx'

import S0Selecao       from './steps/S0Selecao.jsx'
import S1Identificacao from './steps/S1Identificacao.jsx'
import S3Checklist     from './steps/S3Checklist.jsx'
import S4Fotos         from './steps/S4Fotos.jsx'
import S5Assinatura    from './steps/S5Assinatura.jsx'
import S6Resultado     from './steps/S6Resultado.jsx'

const STEPS = ['Serviço', 'Identificação', 'Checklist', 'Evidências', 'Assinatura', 'Resultado']

const VERSAO = getVersaoApp()

function separarDataHoraFortaleza(valor = new Date().toISOString()) {
  const data = new Date(valor)
  if (!Number.isNaN(data.getTime())) {
    const partes = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Fortaleza',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(data)
    const valorParte = tipo => partes.find(p => p.type === tipo)?.value || ''
    return {
      data: `${valorParte('year')}-${valorParte('month')}-${valorParte('day')}`,
      hora: `${valorParte('hour')}:${valorParte('minute')}:${valorParte('second')}`,
    }
  }
  return { data: '', hora: '' }
}

export default function App() {
  const [usuario,             setUsuario]             = useState(getUsuarioLogado)
  const [tela,                setTela]                = useState('home')
  const [step,                setStep]                = useState(0)
  const [form,                setForm]                = useState(FORM_INICIAL())
  const [pautasHoje,          setPautasHoje]          = useState([])
  const [pautasFuturas,       setPautasFuturas]       = useState([])
  const [pautaAtiva,          setPautaAtiva]          = useState(null)
  const [loadingPauta,        setLoadingPauta]        = useState(false)
  const [auditoriasReabertas, setAuditoriasReabertas] = useState([])
  const [auditoriaEditando,   setAuditoriaEditando]   = useState(null)
  const [fotosAntigas,        setFotosAntigas]        = useState([])
  const [msgSessao,           setMsgSessao]           = useState('')
  const [modalAtualizacao,    setModalAtualizacao]    = useState(false)
  const [online,              setOnline]              = useState(navigator.onLine)
  const [pendentesOffline,    setPendentesOffline]    = useState(0)
  const [sincronizando,       setSincronizando]       = useState(false)
  const [msgSync,             setMsgSync]             = useState('')
  const [pendentesReg,        setPendentesReg]        = useState(0)

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    // [DPL] Checa por atualização periodicamente (não só na primeira carga)
    // — sem isso, um app que fica dias aberto/minimizado (como no rastreio
    // em segundo plano) só via o service worker novo depois de fechar e
    // reabrir várias vezes, atrasando demais a propagação de correções
    // durante testes de campo.
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => { registration.update() }, 60 * 1000)
    },
  })

  const upd  = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const next = () => setStep(s => s + 1)
  const prev = () => setStep(s => s - 1)

  const logout = () => {
    pararRastreio()
    fazerLogout()
    setUsuario(null)
  }

  useEffect(() => {
    // [DPL] Antes só atualizava na tela Home — se o usuário ficasse em
    // qualquer outra tela (ex: Diagnóstico de Rastreio), o app continuava
    // preso na versão antiga indefinidamente. Agora atualiza assim que uma
    // versão nova é detectada, em qualquer tela, contanto que não esteja no
    // meio de uma edição (perderia o formulário em andamento).
    if (needRefresh && !auditoriaEditando) {
      setTimeout(() => { updateServiceWorker(true) }, 1000)
    }
  }, [needRefresh])

  useEffect(() => {
    if (!usuario) return
    const onAtividade = () => registrarAtividade()
    window.addEventListener('click',      onAtividade)
    window.addEventListener('keydown',    onAtividade)
    window.addEventListener('touchstart', onAtividade)
    window.addEventListener('scroll',     onAtividade)
    const intervalo = setInterval(async () => {
      const { valida, motivo } = await verificarSessao()
      if (!valida) {
        if (motivo === 'nova_versao') {
          fazerLogout()
          setUsuario(null)
          setModalAtualizacao(true)
        } else if (motivo === 'timeout') {
          setMsgSessao('⏰ Sessão expirada por inatividade.')
          setTimeout(() => { setMsgSessao(''); setUsuario(null) }, 2000)
        } else {
          setUsuario(null)
        }
      }
    }, 25 * 60 * 1000)
    return () => {
      clearInterval(intervalo)
      window.removeEventListener('click',      onAtividade)
      window.removeEventListener('keydown',    onAtividade)
      window.removeEventListener('touchstart', onAtividade)
      window.removeEventListener('scroll',     onAtividade)
    }
  }, [usuario, tela])

  useEffect(() => {
    const syncInicial = async () => {
      if (navigator.onLine) {
        const qtdAud = await contarPendentes()
        const qtdReg = await contarPendentesRegistros()
        setPendentesOffline(qtdAud)
        setPendentesReg(qtdReg)
        const total = qtdAud + qtdReg
        if (total > 0) {
          setSincronizando(true)
          setMsgSync(`🔄 Sincronizando ${total} item(ns) pendente(s)...`)
          try {
            let okAud = 0, okReg = 0
            if (qtdAud > 0) okAud = await sincronizarPendentes()
            if (qtdReg > 0) okReg = await sincronizarPendentesRegistros()
            setPendentesOffline(0)
            setPendentesReg(0)
            setMsgSync(`✅ ${okAud + okReg} item(ns) sincronizado(s) com sucesso!`)
            setTimeout(() => setMsgSync(''), 4000)
          } catch (e) {
            setMsgSync('❌ Erro ao sincronizar. Tente mais tarde.')
            setTimeout(() => setMsgSync(''), 4000)
          } finally { setSincronizando(false) }
        }
      } else {
        const qtdAud = await contarPendentes()
        const qtdReg = await contarPendentesRegistros()
        setPendentesOffline(qtdAud)
        setPendentesReg(qtdReg)
      }
    }
    syncInicial()
  }, [])

  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true)
      const qtdAud = await contarPendentes()
      const qtdReg = await contarPendentesRegistros()
      const total  = qtdAud + qtdReg
      if (total > 0) {
        setSincronizando(true)
        setMsgSync(`🔄 Sincronizando ${total} item(ns) salvos offline...`)
        try {
          let okAud = 0, okReg = 0
          if (qtdAud > 0) okAud = await sincronizarPendentes()
          if (qtdReg > 0) okReg = await sincronizarPendentesRegistros()
          setPendentesOffline(0)
          setPendentesReg(0)
          setMsgSync(`✅ ${okAud + okReg} item(ns) sincronizado(s) com sucesso!`)
          setTimeout(() => setMsgSync(''), 4000)
        } catch (e) {
          setMsgSync('❌ Erro ao sincronizar. Tente mais tarde.')
          setTimeout(() => setMsgSync(''), 4000)
        } finally { setSincronizando(false) }
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

  useEffect(() => {
    if (usuario) iniciarRastreio(usuario)
    return () => { pararRastreio() }
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
      if (isAdmin(usuario) || temPermissao(usuario, 'pauta_ver_futuras')) {
        try { setPautasFuturas(await pautasFuturasFiscal(usuario.login)) }
        catch (e) { setPautasFuturas([]) }
      } else {
        setPautasFuturas([])
      }
    } catch (e) { setPautasHoje([]) }
    finally { setLoadingPauta(false) }
    setAuditoriaEditando(null)
    setFotosAntigas([])
    setForm({ ...FORM_INICIAL(), fiscal: usuario.nome || '', matricula: usuario.matricula || '', numeroAS: gerarNumeroAS() })
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
      numeroAS:         auditoria.numero_as         || '',
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
      motivoAuditoria:  auditoria.motivo_auditoria  || '',
      qtdeCabosOs:      auditoria.qtde_cabos_os      ?? '',
      qtdeCabosEmCampo: auditoria.qtde_cabos_em_campo ?? '',
      statusMotivoAuditoria: typeof auditoria.status_motivo_auditoria === 'boolean'
        ? auditoria.status_motivo_auditoria
        : auditoria.avaliacao_motivo_auditoria === 'CONFORME'
          ? true
          : auditoria.avaliacao_motivo_auditoria === 'NÃO CONFORME'
            ? false
            : null,
      observacoesMotivoAuditoria: auditoria.observacoes_motivo_auditoria || '',
      fotosMotivo:      [],
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

  const onAuditoriaSalva = async (auditoria_id, extras = {}) => {
    contarPendentes().then(setPendentesOffline)
    if (auditoriaEditando) {
      setAuditoriaEditando(null)
      setFotosAntigas([])
      setAuditoriasReabertas(prev => prev.filter(a => a.id !== auditoriaEditando))
      return
    }
    if (pautaAtiva) {
      try {
        const avaliacaoMotivoPauta =
          form.statusMotivoAuditoria === true  ? 'CONFORME' :
          form.statusMotivoAuditoria === false ? 'NÃO CONFORME' :
          null
        const execucao = separarDataHoraFortaleza()
        await concluirPauta(pautaAtiva.id, auditoria_id, {
          motivo_auditoria: form.motivoAuditoria || pautaAtiva.motivo_auditoria || null,
          avaliacao_motivo_auditoria: avaliacaoMotivoPauta,
          qtde_cabos_os: form.qtdeCabosOs || pautaAtiva.qtde_cabos_os || null,
          qtde_cabos_em_campo: form.qtdeCabosEmCampo || null,
          data_execucao: form.data || execucao.data,
          hora_execucao: form.hora || execucao.hora,
          numero_as: form.numeroAS || pautaAtiva.numero_as || null,
          nc_status: extras.nc_status ?? null,
        })
        await criarProximaRecorrencia(pautaAtiva)
        setPautaAtiva(null)
        setPautasHoje(prev => prev.filter(p => p.id !== pautaAtiva.id))
      } catch (e) { console.error('Erro ao concluir pauta:', e) }
    }
  }

  // ── Modal bloqueante de atualização ──────────────────────────────────────────
  if (modalAtualizacao) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
        <div style={{
          background: '#fff', borderRadius: 20, padding: '36px 28px',
          maxWidth: 400, width: '100%', textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🔄</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>Sistema Atualizado!</h2>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 8 }}>
            Uma nova versão do sistema foi disponibilizada.
          </p>
          <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 28 }}>
            Por segurança, sua sessão foi encerrada.<br />Faça login novamente para continuar.
          </p>
          <button
            onClick={() => { setModalAtualizacao(false); window.location.reload() }}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: '#2563eb', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            }}>
            🔐 Entrar novamente
          </button>
          <p style={{ fontSize: 11, color: '#cbd5e1', marginTop: 16 }}>VérticeGP · v{VERSAO}</p>
        </div>
      </div>
    )
  }

  // ── Rota pública: /assinar/:token ────────────────────────────────────────────
  const pathToken = window.location.pathname.match(/^\/assinar\/([0-9a-f-]+)$/i)?.[1]
  if (pathToken) return <PaginaAssinar tokenUUID={pathToken} />

  if (!usuario) return <Login onLogin={u => { setUsuario(u) }} />

  // ── Rotas das telas ──────────────────────────────────────────────────────────
  if (tela === 'gestao')               return <GestaoUsuarios           usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'importar')             return <ImportarEquipes          usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'pauta')                return <GestaoPauta              usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'historico')            return <HistoricoAuditorias      usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'metas')                return <Metas                    usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'feedbacks')            return <FeedbacksPDF             usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'relat-equipe')         return <RelatorioEquipe          usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'dashboard')            return <Dashboard                usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'mapa-fiscais')         return <MapaFiscais              usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'registros-historico')  return <RegistrosOperacionais    usuarioLogado={usuario} onVoltar={() => setTela('home')} onNovo={() => setTela('registros-novo')} onRelatorio={() => setTela('relatorio-evidencias')} isOnline={online} />
  if (tela === 'relatorio-evidencias') return <RelatorioEvidencias      usuarioLogado={usuario} onVoltar={() => setTela('registros-historico')} />
  if (tela === 'registros-novo')       return <RegistrosApp             usuarioLogado={usuario} onVoltar={() => setTela('home')} isOnline={online} />
  // ── NOVO: Indisponibilidade ──────────────────────────────────────────────────
  if (tela === 'indisponibilidade')    return <IndisponibilidadePage    usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'dashboard-indisp')     return <DashboardIndisponibilidade usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'rotinas-admin')        return <RotinasAdministrativas   usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'tratamento-ncs')       return <TratamentoNaoConformidades usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  if (tela === 'diagnostico-rastreio') return <DiagnosticoRastreio       onVoltar={() => setTela('home')} />

  if (tela === 'home') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 24,
      }}>

        {msgSessao && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
            background: msgSessao.includes('⏰') ? '#d97706' : '#2563eb',
            color: '#fff', padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700,
          }}>{msgSessao}</div>
        )}
        {!online && (
          <div style={{
            position: 'fixed', top: msgSessao ? 44 : 0, left: 0, right: 0, zIndex: 9998,
            background: '#dc2626', color: '#fff', padding: '10px 16px',
            textAlign: 'center', fontSize: 13, fontWeight: 700,
          }}>📵 Sem internet — auditorias serão salvas localmente e sincronizadas ao reconectar</div>
        )}
        {msgSync && (
          <div style={{
            position: 'fixed', top: msgSessao ? 44 : 0, left: 0, right: 0, zIndex: 9998,
            background: msgSync.startsWith('✅') ? '#16a34a' : msgSync.startsWith('❌') ? '#dc2626' : '#2563eb',
            color: '#fff', padding: '10px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700,
          }}>{msgSync}</div>
        )}

        <div style={{ textAlign: 'center', marginBottom: 40, marginTop: (msgSessao || !online || msgSync) ? 50 : 0 }}>
          <style>{`
            @keyframes vgp-ef{0%{stroke-dashoffset:48;opacity:.45}50%{opacity:1}100%{stroke-dashoffset:0;opacity:.45}}
            @keyframes vgp-sf{0%{stroke-dashoffset:32;opacity:.25}100%{stroke-dashoffset:0;opacity:.65}}
            @keyframes vgp-glow{0%,100%{opacity:.18}50%{opacity:.52}}
            @keyframes vgp-wave{0%,13%,100%{fill:#ffffff;opacity:.82}6.5%{fill:#fbbf24;opacity:1}}
            .vgp-e{stroke:rgba(255,255,255,.72);stroke-width:1.7;fill:none;stroke-linecap:round;stroke-dasharray:6 9;animation:vgp-ef 2.2s linear infinite}
            .vgp-sp{stroke:rgba(255,255,255,.38);stroke-width:1.25;fill:none;stroke-linecap:round;stroke-dasharray:4 8;animation:vgp-sf 1.7s linear infinite}
            .vgp-hl{fill:rgba(251,191,36,.24);animation:vgp-glow 2.8s ease-in-out infinite}
            .vgp-nd{animation:vgp-wave 3.6s ease-in-out infinite}
            .vgp-d0{animation-delay:0s}.vgp-d1{animation-delay:.37s}.vgp-d2{animation-delay:.73s}
            .vgp-d3{animation-delay:1.1s}.vgp-d4{animation-delay:1.47s}.vgp-d5{animation-delay:1.83s}
            @keyframes vgp-gp-glow{0%,100%{text-shadow:0 0 0px rgba(251,191,36,0)}50%{text-shadow:0 0 14px rgba(251,191,36,.85),0 0 28px rgba(251,191,36,.3)}}
            .vgp-gp{color:#fbbf24;animation:vgp-gp-glow 2.6s ease-in-out infinite}
          `}</style>
          <div style={{ marginBottom: 12 }}>
            <svg viewBox="0 0 100 100" width="80" height="80" xmlns="http://www.w3.org/2000/svg">
              <line className="vgp-e vgp-d0" x1="50" y1="7"  x2="87" y2="28"/>
              <line className="vgp-e vgp-d1" x1="87" y1="28" x2="87" y2="72"/>
              <line className="vgp-e vgp-d2" x1="87" y1="72" x2="50" y2="93"/>
              <line className="vgp-e vgp-d3" x1="50" y1="93" x2="13" y2="72"/>
              <line className="vgp-e vgp-d4" x1="13" y1="72" x2="13" y2="28"/>
              <line className="vgp-e vgp-d5" x1="13" y1="28" x2="50" y2="7"/>
              <line className="vgp-sp vgp-d0" x1="50" y1="50" x2="50" y2="7"/>
              <line className="vgp-sp vgp-d1" x1="50" y1="50" x2="87" y2="28"/>
              <line className="vgp-sp vgp-d2" x1="50" y1="50" x2="87" y2="72"/>
              <line className="vgp-sp vgp-d3" x1="50" y1="50" x2="50" y2="93"/>
              <line className="vgp-sp vgp-d4" x1="50" y1="50" x2="13" y2="72"/>
              <line className="vgp-sp vgp-d5" x1="50" y1="50" x2="13" y2="28"/>
              <circle className="vgp-hl" cx="50" cy="50" r="17"/>
              <circle cx="50" cy="50" r="7.5" fill="#fbbf24"/>
              <circle className="vgp-nd vgp-d0" cx="50" cy="7"  r="5.5" fill="#fff"/>
              <circle className="vgp-nd vgp-d1" cx="87" cy="28" r="5.5" fill="#fff"/>
              <circle className="vgp-nd vgp-d2" cx="87" cy="72" r="5.5" fill="#fff"/>
              <circle className="vgp-nd vgp-d3" cx="50" cy="93" r="5.5" fill="#fff"/>
              <circle className="vgp-nd vgp-d4" cx="13" cy="72" r="5.5" fill="#fff"/>
              <circle className="vgp-nd vgp-d5" cx="13" cy="28" r="5.5" fill="#fff"/>
            </svg>
          </div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Vértice<span className="vgp-gp">GP</span></h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Plataforma de Gestão Operacional</p>
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

        {pendentesOffline > 0 && online && (
          <div style={{
            width: '100%', maxWidth: 380, marginBottom: 16,
            background: '#fef3c7', border: '2px solid #f59e0b', borderRadius: 14, padding: '12px 16px',
          }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>
              📤 {pendentesOffline + pendentesReg} item(ns) aguardando sincronização
              {pendentesOffline > 0 && ` (${pendentesOffline} auditoria(s)`}
              {pendentesReg > 0 && ` · ${pendentesReg} registro(s))`}
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
                  background: '#d97706', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>✏️ Corrigir Auditoria</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {temPermissao(usuario, 'iniciar_auditoria') && (
            <button onClick={iniciarAuditoria} disabled={loadingPauta} style={{
              background: loadingPauta ? '#64748b' : '#2563eb', color: '#fff', border: 'none',
              padding: '18px', borderRadius: 14, fontSize: 17, fontWeight: 800,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
              {loadingPauta ? '⏳ Verificando pautas...' : '📋 Iniciar Auditoria'}
            </button>
          )}

          <button onClick={() => setTela('historico')} style={{
            background: 'rgba(30,58,95,0.9)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
            padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>📁 Histórico de Auditorias</button>

          <button onClick={() => setTela('registros-historico')} style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.9), rgba(109,40,217,0.9))', color: '#fff', border: 'none',
            padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>📝 Registros Operacionais</button>

          {temPermissao(usuario, 'tratar_nc') && (
            <button onClick={() => setTela('tratamento-ncs')} style={{
              background: 'linear-gradient(135deg, rgba(194,65,12,0.9), rgba(154,52,18,0.9))', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>🛠️ Tratamento de Não Conformidades</button>
          )}

          {temPermissao(usuario, 'rotinas_administrativas') && (
            <button onClick={() => setTela('rotinas-admin')} style={{
              background: 'linear-gradient(135deg, rgba(14,116,144,0.95), rgba(37,99,235,0.9))', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>🗓️ Rotinas Administrativas</button>
          )}

          {/* ── NOVO: Indisponibilidade ── */}
          {temPermissao(usuario, 'indisponibilidade') && (
            <button onClick={() => setTela('indisponibilidade')} style={{
              background: 'linear-gradient(135deg, rgba(220,38,38,0.9), rgba(185,28,28,0.9))', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>🚫 Registrar Indisponibilidade</button>
          )}

          {temPermissao(usuario, 'dashboard') && (
            <button onClick={() => setTela('dashboard')} style={{
              background: 'linear-gradient(135deg, rgba(37,99,235,0.9), rgba(124,58,237,0.9))', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>📊 Dashboard / Ranking</button>
          )}

          {/* ── NOVO: Dashboard Indisponibilidade ── */}
          {temPermissao(usuario, 'dashboard_indisponibilidade') && (
            <button onClick={() => setTela('dashboard-indisp')} style={{
              background: 'linear-gradient(135deg, rgba(30,58,95,0.9), rgba(220,38,38,0.85))', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>📈 Dashboard Indisponibilidade</button>
          )}

          {temPermissao(usuario, 'fiscais_campo') && (
            <button onClick={() => setTela('mapa-fiscais')} style={{
              background: 'linear-gradient(135deg, rgba(5,150,105,0.9), rgba(6,95,70,0.9))', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>📍 Fiscais em Campo</button>
          )}

          {/* Sem gate de permissão: qualquer fiscal precisa poder checar o
              próprio rastreio no próprio aparelho. Só aparece no app Android
              nativo — no navegador não existe serviço nativo pra diagnosticar. */}
          {Capacitor.isNativePlatform() && (
            <button onClick={() => setTela('diagnostico-rastreio')} style={{
              background: 'rgba(30,58,95,0.55)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)',
              padding: '12px', borderRadius: 14, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>📡 Diagnóstico de Rastreio</button>
          )}

          {temPermissao(usuario, 'metas') && (
            <button onClick={() => setTela('metas')} style={{
              background: 'rgba(5,150,105,0.9)', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>🎯 Metas por Fiscal</button>
          )}

          {temPermissao(usuario, 'feedbacks') && (
            <button onClick={() => setTela('feedbacks')} style={{
              background: 'rgba(124,58,237,0.85)', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>💬 Feedbacks em PDF</button>
          )}

          {temPermissao(usuario, 'relat_equipe') && (
            <button onClick={() => setTela('relat-equipe')} style={{
              background: 'rgba(194,65,12,0.9)', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>🚗 Relatório por Equipe</button>
          )}

          {temPermissao(usuario, 'pauta') && (
            <button onClick={() => setTela('pauta')} style={{
              background: 'rgba(217,119,6,0.9)', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>📋 Pauta de Fiscalização</button>
          )}

          {temPermissao(usuario, 'gestao_usuarios') && (
            <button onClick={() => setTela('gestao')} style={{
              background: 'rgba(124,58,237,0.9)', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>👥 Gestão de Usuários</button>
          )}

          {(temPermissao(usuario, 'importar_equipes') || temPermissao(usuario, 'estrutura_online_visualizar') || temPermissao(usuario, 'estrutura_online_editar')) && (
            <button onClick={() => setTela('importar')} style={{
              background: 'rgba(15,118,110,0.9)', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>📥 Estrutura Operacional</button>
          )}

        </div>

        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 40 }}>
          VérticeGP · v{VERSAO} · © 2026 Todos os direitos reservados
        </p>
      </div>
    )
  }

  const stepProps = { form, upd, setForm, next, prev, setStep }
  return (
    <div className="app-shell">
      <header className="app-header no-print">
        {!online && (
          <div style={{
            background: '#dc2626', color: '#fff', borderRadius: 8,
            padding: '6px 10px', marginBottom: 6, fontSize: 12, fontWeight: 700, textAlign: 'center',
          }}>📵 Offline — auditoria será salva localmente</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Plataforma de Gestão Operacional
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
        {step === 0 && <S0Selecao       {...stepProps} pautasHoje={pautasHoje} pautasFuturas={pautasFuturas} pautaAtiva={pautaAtiva} setPautaAtiva={setPautaAtiva} permiteAuditoriaAvulsa={isAdmin(usuario) || temPermissao(usuario, 'auditoria_avulsa_com_pauta')} />}
        {step === 1 && <S1Identificacao {...stepProps} pautaAtiva={pautaAtiva} />}
        {step === 2 && <S3Checklist     {...stepProps} />}
        {step === 3 && <S4Fotos         {...stepProps} modoEdicao={!!auditoriaEditando} fotosAntigas={fotosAntigas} />}
        {step === 4 && <S5Assinatura    {...stepProps} />}
        {step === 5 && <S6Resultado     {...stepProps} pautaAtiva={pautaAtiva} onAuditoriaSalva={onAuditoriaSalva} auditoriaEditandoId={auditoriaEditando} fotosAntigas={fotosAntigas} isOnline={online} />}
      </main>
    </div>
  )
}

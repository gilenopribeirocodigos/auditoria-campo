import { useEffect, useState } from 'react'
import { CarregandoHexagono } from '../../components/Shared.jsx'
import { temPermissao } from '../../lib/auth.js'
import PCRecebidaDetalhe from './telas/PCRecebidaDetalhe.jsx'
import PCHistorico from './telas/PCHistorico.jsx'
import PCPadroes from './telas/PCPadroes.jsx'
import PCAprovadas from './telas/PCAprovadas.jsx'
import PCFechadas from './telas/PCFechadas.jsx'
import {
  listarMinhasPrestacoes, listarRecebidas, obterPrestacao, obterNomeUsuario,
  aprovarPrestacao, rejeitarPrestacao, excluirRascunho, obterPermissaoUsuario,
} from './lib/prestacaoContas.js'

// Cada status tem uma cor própria — aplicada tanto no card inteiro (fundo
// claro + borda) quanto no selo, pra dar sinal visual imediato de qual é
// qual. O rótulo do ENVIADO muda conforme a perspectiva (quem enviou vê
// "Enviada/Reenviada"; quem recebe vê "Recebida/Recebida (reenvio)") e
// conforme a rodada (rodada > 1 = já passou por uma rejeição antes).
const STATUS_VISUAL = {
  RASCUNHO:  { cardBg: '#f8fafc', cardBorder: '#cbd5e1', badgeBg: '#e2e8f0', badgeColor: '#475569' },
  ENVIADO:   { cardBg: '#eff6ff', cardBorder: '#93c5fd', badgeBg: '#dbeafe', badgeColor: '#1d4ed8' },
  APROVADO:  { cardBg: '#f0fdf4', cardBorder: '#86efac', badgeBg: '#dcfce7', badgeColor: '#15803d' },
  REJEITADO: { cardBg: '#fef2f2', cardBorder: '#fca5a5', badgeBg: '#fee2e2', badgeColor: '#b91c1c' },
  FECHADA:   { cardBg: '#faf5ff', cardBorder: '#d8b4fe', badgeBg: '#ede9fe', badgeColor: '#6d28d9' },
}

function rotuloStatus(status, rodada, perspectiva) {
  const reenvio = rodada > 1
  if (status === 'RASCUNHO')  return '📝 Rascunho'
  if (status === 'APROVADO')  return '✅ Aprovado'
  if (status === 'REJEITADO') return '↩️ Rejeitada'
  if (status === 'FECHADA')   return '✔️ Prestação de Conta Realizada'
  if (status === 'ENVIADO') {
    if (perspectiva === 'recebidas') return reenvio ? '🔄 Recebida (reenvio)' : '📥 Recebida'
    return reenvio ? '🔄 Reenviada' : '📤 Enviada'
  }
  return status
}

function visualStatus(status) {
  return STATUS_VISUAL[status] || STATUS_VISUAL.RASCUNHO
}

function LegendaStatus({ itens }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 14 }}>
      {itens.map(([status, label]) => {
        const v = visualStatus(status)
        return (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: v.badgeColor, display: 'inline-block' }} />
            <span style={{ fontSize: 10.5, color: '#64748b' }}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function PrestacaoContasLista({ usuarioLogado, onVoltar, onNova, onCorrigir }) {
  const [souAprovador, setSouAprovador] = useState(false)
  const podeReceber = souAprovador || temPermissao(usuarioLogado, 'prestacao_contas_receber') || temPermissao(usuarioLogado, 'prestacao_contas_ver_todas')
  const podeConfigurar = temPermissao(usuarioLogado, 'prestacao_contas_configurar')
  const verTodas = temPermissao(usuarioLogado, 'prestacao_contas_ver_todas')
  const podeFechar = temPermissao(usuarioLogado, 'prestacao_contas_fechar')
  const [mostrarPadroes, setMostrarPadroes] = useState(false)
  const [mostrarAprovadas, setMostrarAprovadas] = useState(false)
  const [mostrarFechadas, setMostrarFechadas] = useState(false)
  const [aba, setAba] = useState('enviadas')
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('TODOS')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [enviadas, setEnviadas] = useState([])
  const [recebidas, setRecebidas] = useState([])
  const [detalheId, setDetalheId] = useState(null)
  const [detalhe, setDetalhe] = useState(null)
  const [remetenteNome, setRemetenteNome] = useState('')
  const [processando, setProcessando] = useState(false)
  const [historicoAberto, setHistoricoAberto] = useState(null)

  const carregarListas = async () => {
    setCarregando(true)
    try {
      const [minhas, rec] = await Promise.all([
        listarMinhasPrestacoes(usuarioLogado.id),
        podeReceber ? listarRecebidas(usuarioLogado.id) : Promise.resolve([]),
      ])
      setEnviadas(minhas)
      setRecebidas(rec)
    } catch (e) {
      setErro(e.message || 'Erro ao carregar prestações de contas.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    obterPermissaoUsuario(usuarioLogado.id).then(p => setSouAprovador(!!p.aprovador)).catch(() => setSouAprovador(false))
  }, [usuarioLogado.id])

  useEffect(() => { carregarListas() }, [usuarioLogado.id, podeReceber]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirDetalhe = async (prestacaoId, remetenteId) => {
    setDetalheId(prestacaoId)
    setDetalhe(null)
    try {
      const [p, nome] = await Promise.all([obterPrestacao(prestacaoId), obterNomeUsuario(remetenteId)])
      setDetalhe(p)
      setRemetenteNome(nome)
    } catch (e) {
      alert('Não foi possível abrir: ' + (e.message || e))
      setDetalheId(null)
    }
  }

  const handleAprovar = async () => {
    setProcessando(true)
    try {
      await aprovarPrestacao(detalheId, usuarioLogado.id)
      setDetalheId(null)
      await carregarListas()
    } catch (e) {
      alert('Não foi possível aprovar: ' + (e.message || e))
    } finally {
      setProcessando(false)
    }
  }

  const handleRejeitar = async (motivo) => {
    setProcessando(true)
    try {
      await rejeitarPrestacao(detalheId, usuarioLogado.id, motivo)
      setDetalheId(null)
      await carregarListas()
    } catch (e) {
      alert('Não foi possível rejeitar: ' + (e.message || e))
    } finally {
      setProcessando(false)
    }
  }

  const handleExcluirRascunho = async (id) => {
    if (!confirm('Excluir este rascunho? Essa ação não pode ser desfeita.')) return
    try {
      await excluirRascunho(id)
      await carregarListas()
    } catch (e) {
      alert('Não foi possível excluir: ' + (e.message || e))
    }
  }

  const pendentes = recebidas.filter(p => p.status === 'ENVIADO').length

  // Busca por número, solicitante, classificação, descrição ou fornecedor —
  // e filtro por status. Aplicado só na lista visível (a troca de aba reseta).
  const correspondeABusca = (p, termo) => {
    if (!termo) return true
    const alvo = termo.toLowerCase()
    if (p.numero_pc?.toLowerCase().includes(alvo)) return true
    if (p.remetente_nome?.toLowerCase().includes(alvo)) return true
    return (p.pc_itens || []).some(i => (
      i.classificacao?.toLowerCase().includes(alvo) ||
      i.descricao?.toLowerCase().includes(alvo) ||
      i.fornecedor?.toLowerCase().includes(alvo)
    ))
  }
  const aplicarFiltros = (lista) => lista.filter(p => (
    (filtroStatus === 'TODOS' || p.status === filtroStatus) && correspondeABusca(p, busca)
  ))
  const enviadasFiltradas = aplicarFiltros(enviadas)
  const recebidasFiltradas = aplicarFiltros(recebidas)

  const mudarAba = (novaAba) => {
    setAba(novaAba)
    setBusca('')
    setFiltroStatus('TODOS')
  }

  const opcoesStatus = aba === 'enviadas'
    ? [['TODOS', 'Todos os status'], ['RASCUNHO', 'Rascunho'], ['ENVIADO', 'Enviada/Reenviada'], ['APROVADO', 'Aprovada'], ['REJEITADO', 'Rejeitada'], ['FECHADA', 'Conta Realizada']]
    : [['TODOS', 'Todos os status'], ['ENVIADO', 'Recebida'], ['APROVADO', 'Aprovada'], ['REJEITADO', 'Rejeitada'], ['FECHADA', 'Conta Realizada']]

  const BarraBuscaFiltro = ({ placeholder }) => (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <input
        type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder={placeholder}
        style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
      />
      <select
        value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
        style={{ padding: '9px 8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, color: '#475569', background: '#fff' }}
      >
        {opcoesStatus.map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
      </select>
    </div>
  )

  if (mostrarPadroes) {
    return <PCPadroes onVoltar={() => setMostrarPadroes(false)} />
  }

  if (mostrarAprovadas) {
    return <PCAprovadas usuarioLogado={usuarioLogado} verTodas={verTodas} onVoltar={() => setMostrarAprovadas(false)} onHome={onVoltar} />
  }

  if (mostrarFechadas) {
    return <PCFechadas onVoltar={() => setMostrarFechadas(false)} onHome={onVoltar} />
  }

  if (detalheId) {
    return (
      <div className="app-shell">
        <header className="app-header no-print">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>Prestação de Contas</div>
            <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>🏠 Home</button>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Análise de Prestação</div>
        </header>
        <main className="app-content">
          {!detalhe ? <CarregandoHexagono texto="Carregando..." /> : (
            <PCRecebidaDetalhe
              prestacao={detalhe}
              remetenteNome={remetenteNome}
              onAprovar={handleAprovar}
              onRejeitar={handleRejeitar}
              onVoltar={() => setDetalheId(null)}
              processando={processando}
            />
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Plataforma de Gestão Operacional
          </div>
          <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>🏠 Home</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>💰 Prestação de Contas</div>
      </header>

      <main className="app-content">
        {(podeConfigurar || podeReceber || podeFechar) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {podeReceber && (
              <button onClick={() => setMostrarAprovadas(true)} style={{
                border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d',
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>✅ Aprovadas</button>
            )}
            {(podeFechar || verTodas) && (
              <button onClick={() => setMostrarFechadas(true)} style={{
                border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#6d28d9',
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>🔒 Fechamentos</button>
            )}
            {podeConfigurar && (
              <button onClick={() => setMostrarPadroes(true)} style={{
                border: '1px solid #cbd5e1', background: '#fff', color: '#475569',
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>⚙️ Padrões</button>
            )}
          </div>
        )}

        {podeReceber && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => mudarAba('enviadas')} style={{
              flex: 1, padding: 10, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: aba === 'enviadas' ? '#1e3a5f' : '#e2e8f0',
              color: aba === 'enviadas' ? '#fff' : '#475569', fontSize: 13, fontWeight: 700,
            }}>Enviadas</button>
            <button onClick={() => mudarAba('recebidas')} style={{
              flex: 1, padding: 10, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative',
              background: aba === 'recebidas' ? '#1e3a5f' : '#e2e8f0',
              color: aba === 'recebidas' ? '#fff' : '#475569', fontSize: 13, fontWeight: 700,
            }}>
              Recebidas{pendentes > 0 && ` (${pendentes})`}
            </button>
          </div>
        )}

        {carregando ? (
          <CarregandoHexagono texto="Carregando..." />
        ) : erro ? (
          <p style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ {erro}</p>
        ) : aba === 'enviadas' ? (
          <>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Minhas Prestações
            </p>
            {enviadas.length > 0 && (
              <>
                <LegendaStatus itens={[
                  ['RASCUNHO', 'Rascunho'], ['ENVIADO', 'Enviada/Reenviada'], ['APROVADO', 'Aprovada'],
                  ['REJEITADO', 'Rejeitada'], ['FECHADA', 'Conta Realizada'],
                ]} />
                <BarraBuscaFiltro placeholder="Buscar por número, classificação, descrição..." />
              </>
            )}
            {enviadas.length === 0 ? (
              <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '28px 16px', textAlign: 'center', marginBottom: 20 }}>
                <p style={{ fontSize: 13, color: '#94a3b8' }}>Você ainda não enviou nenhuma prestação de contas.</p>
              </div>
            ) : enviadasFiltradas.length === 0 ? (
              <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '28px 16px', textAlign: 'center', marginBottom: 20 }}>
                <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma prestação encontrada com esse filtro.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {enviadasFiltradas.map(p => {
                  const v = visualStatus(p.status)
                  return (
                    <div key={p.id} style={{ background: v.cardBg, border: `1.5px solid ${v.cardBorder}`, borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{p.numero_pc}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: v.badgeBg, color: v.badgeColor }}>{rotuloStatus(p.status, p.rodada, 'enviadas')}</span>
                      </div>
                      <p style={{ fontSize: 12, color: '#64748b' }}>
                        {p.total_itens} {p.total_itens === 1 ? 'item' : 'itens'} · R$ {p.valor_total.toFixed(2).replace('.', ',')}
                        {p.rodada > 1 && ` · ${p.rodada}ª tentativa`}
                      </p>
                      {p.status === 'REJEITADO' && p.motivo_rejeicao && (
                        <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>Motivo mais recente: "{p.motivo_rejeicao}"</p>
                      )}
                      {p.status !== 'RASCUNHO' && (
                        <button onClick={() => setHistoricoAberto(historicoAberto === p.id ? null : p.id)} style={{
                          marginTop: 6, border: 'none', background: 'transparent', color: '#1e3a5f',
                          fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0,
                        }}>{historicoAberto === p.id ? '▲ Esconder histórico' : '▼ Ver histórico completo'}</button>
                      )}
                      {historicoAberto === p.id && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                          <PCHistorico prestacaoId={p.id} />
                        </div>
                      )}
                      {p.status === 'REJEITADO' && (
                        <button onClick={() => onCorrigir(p.id)} style={{
                          marginTop: 10, width: '100%', padding: 10, borderRadius: 8, border: 'none',
                          background: '#d97706', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}>✎ Corrigir e Reenviar</button>
                      )}
                      {p.status === 'RASCUNHO' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button onClick={() => onCorrigir(p.id)} style={{
                            flex: 1, padding: 10, borderRadius: 8, border: 'none',
                            background: '#1e3a5f', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}>✎ Continuar</button>
                          <button onClick={() => handleExcluirRascunho(p.id)} style={{
                            padding: '10px 14px', borderRadius: 8, border: 'none',
                            background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}>🗑️ Excluir</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={onNova} style={{
              width: '100%', padding: 16, borderRadius: 14, border: 'none',
              background: 'linear-gradient(135deg, rgba(245,158,11,0.95), rgba(217,119,6,0.95))',
              color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
            }}>＋ Nova Prestação de Contas</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Prestações Recebidas para Análise
            </p>
            {recebidas.length > 0 && (
              <>
                <LegendaStatus itens={[
                  ['ENVIADO', 'Recebida/Recebida (reenvio)'], ['APROVADO', 'Aprovada'],
                  ['REJEITADO', 'Rejeitada'], ['FECHADA', 'Conta Realizada'],
                ]} />
                <BarraBuscaFiltro placeholder="Buscar por número, solicitante, classificação..." />
              </>
            )}
            {recebidas.length === 0 ? (
              <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '28px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma prestação de contas foi enviada para você.</p>
              </div>
            ) : recebidasFiltradas.length === 0 ? (
              <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '28px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma prestação encontrada com esse filtro.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recebidasFiltradas.map(p => {
                  const v = visualStatus(p.status)
                  return (
                    <button key={p.id} onClick={() => abrirDetalhe(p.id, p.remetente_id)} style={{
                      textAlign: 'left', background: v.cardBg, border: `1.5px solid ${v.cardBorder}`, borderRadius: 12,
                      padding: '12px 14px', cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{p.numero_pc}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: v.badgeBg, color: v.badgeColor }}>{rotuloStatus(p.status, p.rodada, 'recebidas')}</span>
                      </div>
                      <p style={{ fontSize: 12, color: '#64748b' }}>
                        {p.remetente_nome} · {p.total_itens} {p.total_itens === 1 ? 'item' : 'itens'} · R$ {p.valor_total.toFixed(2).replace('.', ',')}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

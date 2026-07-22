import { useEffect, useState } from 'react'
import { CarregandoHexagono } from '../../components/Shared.jsx'
import { temPermissao } from '../../lib/auth.js'
import PCRecebidaDetalhe from './telas/PCRecebidaDetalhe.jsx'
import PCHistorico from './telas/PCHistorico.jsx'
import PCPadroes from './telas/PCPadroes.jsx'
import {
  listarMinhasPrestacoes, listarRecebidas, obterPrestacao, obterNomeUsuario,
  aprovarPrestacao, rejeitarPrestacao,
} from './lib/prestacaoContas.js'

const STATUS_BADGE = {
  RASCUNHO:  { bg: '#e2e8f0', color: '#475569', label: '📝 Rascunho' },
  ENVIADO:   { bg: '#dbeafe', color: '#1d4ed8', label: '📤 Enviado' },
  APROVADO:  { bg: '#dcfce7', color: '#15803d', label: '✅ Aprovado' },
  REJEITADO: { bg: '#fee2e2', color: '#b91c1c', label: '↩️ Rejeitado' },
}

export default function PrestacaoContasLista({ usuarioLogado, onVoltar, onNova, onCorrigir }) {
  const podeReceber = temPermissao(usuarioLogado, 'prestacao_contas_receber') || temPermissao(usuarioLogado, 'prestacao_contas_ver_todas')
  const podeConfigurar = temPermissao(usuarioLogado, 'prestacao_contas_configurar')
  const [mostrarPadroes, setMostrarPadroes] = useState(false)
  const [aba, setAba] = useState('enviadas')
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

  useEffect(() => { carregarListas() }, [usuarioLogado.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const pendentes = recebidas.filter(p => p.status === 'ENVIADO').length

  if (mostrarPadroes) {
    return <PCPadroes onVoltar={() => setMostrarPadroes(false)} />
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
        {podeConfigurar && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => setMostrarPadroes(true)} style={{
              border: '1px solid #cbd5e1', background: '#fff', color: '#475569',
              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>⚙️ Padrões</button>
          </div>
        )}

        {podeReceber && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => setAba('enviadas')} style={{
              flex: 1, padding: 10, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: aba === 'enviadas' ? '#1e3a5f' : '#e2e8f0',
              color: aba === 'enviadas' ? '#fff' : '#475569', fontSize: 13, fontWeight: 700,
            }}>Enviadas</button>
            <button onClick={() => setAba('recebidas')} style={{
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
            <p style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Minhas Prestações
            </p>
            {enviadas.length === 0 ? (
              <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '28px 16px', textAlign: 'center', marginBottom: 20 }}>
                <p style={{ fontSize: 13, color: '#94a3b8' }}>Você ainda não enviou nenhuma prestação de contas.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {enviadas.map(p => {
                  const badge = STATUS_BADGE[p.status] || STATUS_BADGE.RASCUNHO
                  return (
                    <div key={p.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{p.numero_pc}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: badge.bg, color: badge.color }}>{badge.label}</span>
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
            <p style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Prestações Recebidas para Análise
            </p>
            {recebidas.length === 0 ? (
              <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '28px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma prestação de contas foi enviada para você.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recebidas.map(p => {
                  const badge = STATUS_BADGE[p.status] || STATUS_BADGE.ENVIADO
                  return (
                    <button key={p.id} onClick={() => abrirDetalhe(p.id, p.remetente_id)} style={{
                      textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                      padding: '12px 14px', cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{p.numero_pc}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: badge.bg, color: badge.color }}>{badge.label}</span>
                      </div>
                      <p style={{ fontSize: 12, color: '#64748b' }}>
                        {p.total_itens} {p.total_itens === 1 ? 'item' : 'itens'} · R$ {p.valor_total.toFixed(2).replace('.', ',')}
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

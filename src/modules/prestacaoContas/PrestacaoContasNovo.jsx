import { useEffect, useState } from 'react'
import { CarregandoHexagono } from '../../components/Shared.jsx'
import PCItemForm from './telas/PCItemForm.jsx'
import PCRevisaoEnvio from './telas/PCRevisaoEnvio.jsx'
import {
  criarRascunho, obterPrestacao, listarDestinatariosDisponiveis,
  adicionarItem, atualizarItem, anexarFoto, removerFoto, removerItem,
  definirDestinatario, enviarPrestacao, excluirRascunho,
} from './lib/prestacaoContas.js'

export default function PrestacaoContasNovo({ usuarioLogado, onVoltar, onHome, prestacaoIdExistente }) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [prestacao, setPrestacao] = useState(null)
  const [eraRejeitada, setEraRejeitada] = useState(false)
  const [destinatarios, setDestinatarios] = useState([])
  const [view, setView] = useState('itens') // itens | novo-item | revisao
  const [itemEditando, setItemEditando] = useState(null)
  const [salvandoItem, setSalvandoItem] = useState(false)
  const [observacaoCorrecao, setObservacaoCorrecao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const [nova, dests] = await Promise.all([
          prestacaoIdExistente ? obterPrestacao(prestacaoIdExistente) : criarRascunho(usuarioLogado.id),
          listarDestinatariosDisponiveis(),
        ])
        setPrestacao(nova)
        setEraRejeitada(nova.status === 'REJEITADO')
        setDestinatarios(dests.filter(d => d.id !== usuarioLogado.id))
      } catch (e) {
        setErro(e.message || 'Erro ao iniciar prestação de contas.')
      } finally {
        setCarregando(false)
      }
    })()
  }, [usuarioLogado.id, prestacaoIdExistente])

  const recarregar = async (id) => {
    const atual = await obterPrestacao(id)
    setPrestacao(atual)
  }

  const handleSalvarItem = async (item, fotoInfo) => {
    setSalvandoItem(true)
    try {
      let itemId
      if (itemEditando) {
        await atualizarItem(itemEditando.id, item)
        itemId = itemEditando.id
      } else {
        const ordem = prestacao.pc_itens?.length || 0
        const novoItem = await adicionarItem(prestacao.id, item, ordem)
        itemId = novoItem.id
      }
      for (const fotoId of fotoInfo.removidasIds || []) await removerFoto(fotoId)
      for (const base64 of fotoInfo.novasBase64 || []) await anexarFoto(itemId, prestacao.id, base64)
      await recarregar(prestacao.id)
      setItemEditando(null)
      setView('itens')
    } catch (e) {
      alert('Não foi possível salvar o item: ' + (e.message || e))
    } finally {
      setSalvandoItem(false)
    }
  }

  const handleEditarItem = (item) => {
    setItemEditando(item)
    setView('novo-item')
  }

  const handleRemoverItem = async (itemId) => {
    if (!confirm('Remover este item?')) return
    try {
      await removerItem(itemId)
      await recarregar(prestacao.id)
    } catch (e) {
      alert('Não foi possível remover: ' + (e.message || e))
    }
  }

  const handleSair = async () => {
    if (!prestacaoIdExistente && (prestacao?.pc_itens?.length || 0) === 0) {
      try { await excluirRascunho(prestacao.id) } catch { /* rascunho vazio, sem problema deixar */ }
    }
    onVoltar()
  }

  const handleEnviar = async () => {
    setEnviando(true)
    try {
      await definirDestinatario(prestacao.id, prestacao.destinatario_id)
      await enviarPrestacao(prestacao.id, usuarioLogado.id, { reenvio: eraRejeitada, motivo: eraRejeitada ? observacaoCorrecao.trim() : '' })
      setEnviado(true)
    } catch (e) {
      alert('Não foi possível enviar: ' + (e.message || e))
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) return <div className="app-shell"><main className="app-content"><CarregandoHexagono texto="Preparando nova prestação..." /></main></div>

  if (erro) {
    return (
      <div className="app-shell">
        <main className="app-content">
          <p style={{ color: '#dc2626', fontWeight: 700, marginBottom: 12 }}>⚠️ {erro}</p>
          <button onClick={onVoltar} style={{ padding: '12px 16px', borderRadius: 10, border: 'none', background: '#1e3a5f', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>← Voltar</button>
        </main>
      </div>
    )
  }

  if (enviado) {
    return (
      <div className="app-shell">
        <main className="app-content" style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>✅</p>
          <p style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>Enviado para aprovação!</p>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>{prestacao.numero_pc}</p>
          <button onClick={onVoltar} style={{ padding: '14px 20px', borderRadius: 12, border: 'none', background: '#1e3a5f', color: '#fff', fontWeight: 700, cursor: 'pointer', width: '100%' }}>
            Voltar para Minhas Prestações
          </button>
        </main>
      </div>
    )
  }

  const itens = prestacao.pc_itens || []
  const total = itens.reduce((soma, i) => soma + Number(i.valor || 0), 0)

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Prestação de Contas
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleSair} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>← Voltar</button>
            {onHome && (
              <button onClick={onHome} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>🏠 Home</button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>
          💰 Nova Prestação — {prestacao.numero_pc}
        </div>
      </header>

      <main className="app-content">
        {view === 'novo-item' && (
          <PCItemForm
            salvando={salvandoItem}
            itemInicial={itemEditando}
            fotosIniciais={itemEditando?.pc_fotos || []}
            onSalvar={handleSalvarItem}
            onCancelar={() => { setItemEditando(null); setView('itens') }}
          />
        )}

        {view === 'revisao' && (
          <PCRevisaoEnvio
            itens={itens}
            destinatarios={destinatarios}
            destinatarioId={prestacao.destinatario_id}
            onMudarDestinatario={id => setPrestacao(p => ({ ...p, destinatario_id: id ? Number(id) : null }))}
            onEnviar={handleEnviar}
            onVoltar={() => setView('itens')}
            enviando={enviando}
            ehReenvio={eraRejeitada}
            observacaoCorrecao={observacaoCorrecao}
            onMudarObservacaoCorrecao={setObservacaoCorrecao}
          />
        )}

        {view === 'itens' && (
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f1f5f9', border: '1px solid #cbd5e1',
              borderRadius: 999, padding: '4px 12px', marginBottom: 10,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                📝 {eraRejeitada ? 'Corrigindo — ainda não reenviada' : 'Rascunho — ainda não enviada'}
              </span>
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>Despesa desta Prestação</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Cada prestação de contas tem uma única despesa, com o comprovante em foto. Toque no item pra editar (inclusive trocar a foto).
            </p>

            {itens.length === 0 ? (
              <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '24px 16px', textAlign: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma despesa adicionada ainda.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {itens.map(item => (
                  <div key={item.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <button onClick={() => handleEditarItem(item)} style={{ flex: 1, textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>✎ {item.classificacao} — {item.descricao}</p>
                      <p style={{ fontSize: 11, color: '#64748b' }}>
                        R$ {Number(item.valor).toFixed(2).replace('.', ',')} · {item.pc_fotos?.length > 0 ? '📷 com foto' : '⚠️ sem foto'}
                      </p>
                    </button>
                    <button onClick={() => handleRemoverItem(item.id)} style={{ border: 'none', background: 'transparent', color: '#dc2626', fontSize: 16, cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                  <span>Total</span><span>R$ {total.toFixed(2).replace('.', ',')}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {itens.length === 0 ? (
                <button onClick={() => setView('novo-item')} style={{
                  width: '100%', padding: 14, borderRadius: 12, border: 'none',
                  background: '#1e3a5f', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                }}>＋ Adicionar Despesa</button>
              ) : (
                <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                  Cada prestação de contas tem só 1 despesa. Remova a de cima se precisar trocar.
                </p>
              )}
              <button onClick={() => setView('revisao')} disabled={itens.length === 0} style={{
                width: '100%', padding: 14, borderRadius: 12, border: 'none',
                background: itens.length > 0 ? '#d97706' : '#e2e8f0',
                color: itens.length > 0 ? '#fff' : '#94a3b8',
                fontSize: 15, fontWeight: 700, cursor: itens.length > 0 ? 'pointer' : 'not-allowed',
              }}>Revisar e Enviar →</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

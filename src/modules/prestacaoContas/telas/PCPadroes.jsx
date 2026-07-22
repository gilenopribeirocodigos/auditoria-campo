import { useEffect, useState } from 'react'
import { CarregandoHexagono } from '../../../components/Shared.jsx'
import {
  listarClassificacoes, criarClassificacao, atualizarClassificacao, removerClassificacao,
  listarTiposComprovanteCadastrados, criarTipoComprovante, atualizarTipoComprovante, removerTipoComprovante,
  listarFormasPagamento, criarFormaPagamento, atualizarFormaPagamento, removerFormaPagamento,
} from '../lib/prestacaoContas.js'

function Secao({ titulo, itens, novoValor, onMudarNovoValor, onAdicionar, onRemover, onEditar, placeholder }) {
  const [editandoId, setEditandoId] = useState(null)
  const [editandoValor, setEditandoValor] = useState('')
  const [salvando, setSalvando] = useState(false)

  const iniciarEdicao = (it) => { setEditandoId(it.id); setEditandoValor(it.nome) }
  const cancelarEdicao = () => { setEditandoId(null); setEditandoValor('') }

  const confirmarEdicao = async () => {
    if (!editandoValor.trim()) return
    setSalvando(true)
    try {
      await onEditar(editandoId, editandoValor)
      cancelarEdicao()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>{titulo}</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="form-input" value={novoValor} onChange={e => onMudarNovoValor(e.target.value)}
          placeholder={placeholder} style={{ flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') onAdicionar() }}
        />
        <button onClick={onAdicionar} disabled={!novoValor.trim()} style={{
          padding: '0 16px', borderRadius: 10, border: 'none',
          background: novoValor.trim() ? '#1e3a5f' : '#e2e8f0', color: novoValor.trim() ? '#fff' : '#94a3b8',
          fontWeight: 700, cursor: novoValor.trim() ? 'pointer' : 'not-allowed',
        }}>＋</button>
      </div>
      {itens.length === 0 ? (
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Nenhum item cadastrado ainda.</p>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Nome</th>
                <th style={{ width: 76 }}></th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it, i) => {
                const editando = editandoId === it.id
                return (
                  <tr key={it.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: editando ? '6px 8px' : '8px 12px', fontSize: 13, color: '#1e293b' }}>
                      {editando ? (
                        <input
                          className="form-input" autoFocus value={editandoValor}
                          onChange={e => setEditandoValor(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') confirmarEdicao(); if (e.key === 'Escape') cancelarEdicao() }}
                          style={{ padding: '6px 8px', fontSize: 13 }}
                        />
                      ) : it.nome}
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {editando ? (
                        <>
                          <button onClick={confirmarEdicao} disabled={salvando || !editandoValor.trim()} style={{
                            width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#dcfce7',
                            color: '#15803d', fontSize: 12, fontWeight: 700, cursor: 'pointer', lineHeight: '24px', padding: 0, marginRight: 4,
                          }}>✓</button>
                          <button onClick={cancelarEdicao} disabled={salvando} style={{
                            width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#f1f5f9',
                            color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer', lineHeight: '24px', padding: 0,
                          }}>✕</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => iniciarEdicao(it)} style={{
                            width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#eff6ff',
                            color: '#1d4ed8', fontSize: 11, fontWeight: 700, cursor: 'pointer', lineHeight: '24px', padding: 0, marginRight: 4,
                          }}>✎</button>
                          <button onClick={() => onRemover(it)} style={{
                            width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#fef2f2',
                            color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', lineHeight: '24px', padding: 0,
                          }}>✕</button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PCPadroes({ onVoltar }) {
  const [carregando, setCarregando] = useState(true)
  const [classificacoes, setClassificacoes] = useState([])
  const [tipos, setTipos] = useState([])
  const [formas, setFormas] = useState([])
  const [novaClassificacao, setNovaClassificacao] = useState('')
  const [novoTipo, setNovoTipo] = useState('')
  const [novaForma, setNovaForma] = useState('')
  const [erro, setErro] = useState('')

  const carregar = async () => {
    setCarregando(true)
    try {
      const [c, t, f] = await Promise.all([listarClassificacoes(), listarTiposComprovanteCadastrados(), listarFormasPagamento()])
      setClassificacoes(c)
      setTipos(t)
      setFormas(f)
    } catch (e) {
      setErro(e.message || 'Erro ao carregar padrões.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const adicionarClassificacao = async () => {
    if (!novaClassificacao.trim()) return
    try {
      await criarClassificacao(novaClassificacao)
      setNovaClassificacao('')
      await carregar()
    } catch (e) { alert('Não foi possível adicionar: ' + (e.message || e)) }
  }

  const editarClassificacaoItem = async (id, novoNome) => {
    try { await atualizarClassificacao(id, novoNome); await carregar() }
    catch (e) { alert('Não foi possível salvar: ' + (e.message || e)) }
  }

  const removerClassificacaoItem = async (it) => {
    if (!confirm(`Remover "${it.nome}" da lista de classificações?`)) return
    try { await removerClassificacao(it.id); await carregar() }
    catch (e) { alert('Não foi possível remover: ' + (e.message || e)) }
  }

  const adicionarTipo = async () => {
    if (!novoTipo.trim()) return
    try {
      await criarTipoComprovante(novoTipo)
      setNovoTipo('')
      await carregar()
    } catch (e) { alert('Não foi possível adicionar: ' + (e.message || e)) }
  }

  const editarTipoItem = async (id, novoNome) => {
    try { await atualizarTipoComprovante(id, novoNome); await carregar() }
    catch (e) { alert('Não foi possível salvar: ' + (e.message || e)) }
  }

  const removerTipoItem = async (it) => {
    if (!confirm(`Remover "${it.nome}" da lista de comprovantes?`)) return
    try { await removerTipoComprovante(it.id); await carregar() }
    catch (e) { alert('Não foi possível remover: ' + (e.message || e)) }
  }

  const adicionarForma = async () => {
    if (!novaForma.trim()) return
    try {
      await criarFormaPagamento(novaForma)
      setNovaForma('')
      await carregar()
    } catch (e) { alert('Não foi possível adicionar: ' + (e.message || e)) }
  }

  const editarFormaItem = async (id, novoNome) => {
    try { await atualizarFormaPagamento(id, novoNome); await carregar() }
    catch (e) { alert('Não foi possível salvar: ' + (e.message || e)) }
  }

  const removerFormaItem = async (it) => {
    if (!confirm(`Remover "${it.nome}" da lista de formas de pagamento?`)) return
    try { await removerFormaPagamento(it.id); await carregar() }
    catch (e) { alert('Não foi possível remover: ' + (e.message || e)) }
  }

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>Prestação de Contas</div>
          <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>🏠 Home</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>⚙️ Padrões</div>
      </header>
      <main className="app-content">
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
          Gerencie as opções sugeridas nos campos de Classificação, Forma de Pagamento e Comprovante. Remover um item daqui não altera despesas já lançadas com esse texto.
        </p>
        {carregando ? (
          <CarregandoHexagono texto="Carregando..." />
        ) : erro ? (
          <p style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ {erro}</p>
        ) : (
          <>
            <Secao
              titulo="Classificação"
              itens={classificacoes}
              novoValor={novaClassificacao}
              onMudarNovoValor={setNovaClassificacao}
              onAdicionar={adicionarClassificacao}
              onEditar={editarClassificacaoItem}
              onRemover={removerClassificacaoItem}
              placeholder="Ex.: PEDÁGIO"
            />
            <Secao
              titulo="Forma de Pagamento"
              itens={formas}
              novoValor={novaForma}
              onMudarNovoValor={setNovaForma}
              onAdicionar={adicionarForma}
              onEditar={editarFormaItem}
              onRemover={removerFormaItem}
              placeholder="Ex.: Vale Alimentação"
            />
            <Secao
              titulo="Tipo de Comprovante"
              itens={tipos}
              novoValor={novoTipo}
              onMudarNovoValor={setNovoTipo}
              onAdicionar={adicionarTipo}
              onEditar={editarTipoItem}
              onRemover={removerTipoItem}
              placeholder="Ex.: Cupom Fiscal"
            />
          </>
        )}
      </main>
    </div>
  )
}

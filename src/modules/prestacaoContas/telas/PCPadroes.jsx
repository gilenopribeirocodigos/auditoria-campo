import { useEffect, useState } from 'react'
import { CarregandoHexagono } from '../../../components/Shared.jsx'
import {
  listarClassificacoes, criarClassificacao, removerClassificacao,
  listarTiposComprovanteCadastrados, criarTipoComprovante, removerTipoComprovante,
} from '../lib/prestacaoContas.js'

function Secao({ titulo, itens, novoValor, onMudarNovoValor, onAdicionar, onRemover, placeholder }) {
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {itens.length === 0 && <p style={{ fontSize: 12, color: '#94a3b8' }}>Nenhum item cadastrado ainda.</p>}
        {itens.map(it => (
          <span key={it.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f1f5f9',
            borderRadius: 999, padding: '5px 6px 5px 12px', fontSize: 12, fontWeight: 600, color: '#334155',
          }}>
            {it.nome}
            <button onClick={() => onRemover(it)} style={{
              width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#dc2626',
              color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', lineHeight: '18px', padding: 0,
            }}>✕</button>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function PCPadroes({ onVoltar }) {
  const [carregando, setCarregando] = useState(true)
  const [classificacoes, setClassificacoes] = useState([])
  const [tipos, setTipos] = useState([])
  const [novaClassificacao, setNovaClassificacao] = useState('')
  const [novoTipo, setNovoTipo] = useState('')
  const [erro, setErro] = useState('')

  const carregar = async () => {
    setCarregando(true)
    try {
      const [c, t] = await Promise.all([listarClassificacoes(), listarTiposComprovanteCadastrados()])
      setClassificacoes(c)
      setTipos(t)
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

  const removerTipoItem = async (it) => {
    if (!confirm(`Remover "${it.nome}" da lista de comprovantes?`)) return
    try { await removerTipoComprovante(it.id); await carregar() }
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
          Gerencie as opções sugeridas nos campos de Classificação e Comprovante. Remover um item daqui não altera despesas já lançadas com esse texto.
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
              onRemover={removerClassificacaoItem}
              placeholder="Ex.: PEDÁGIO"
            />
            <Secao
              titulo="Tipo de Comprovante"
              itens={tipos}
              novoValor={novoTipo}
              onMudarNovoValor={setNovoTipo}
              onAdicionar={adicionarTipo}
              onRemover={removerTipoItem}
              placeholder="Ex.: Cupom Fiscal"
            />
            <p style={{ fontSize: 11, color: '#94a3b8' }}>
              A opção "Outro" no Comprovante é fixa e sempre aparece, além dos itens acima.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

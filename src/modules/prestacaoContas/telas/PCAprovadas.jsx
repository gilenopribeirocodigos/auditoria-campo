import { useEffect, useMemo, useState } from 'react'
import { CarregandoHexagono } from '../../../components/Shared.jsx'
import { temPermissao } from '../../../lib/auth.js'
import { listarAprovadas, fecharPrestacoes } from '../lib/prestacaoContas.js'
import { gerarExcelConsolidado, baixarFotosConsolidadas } from '../lib/exportacao.js'

export default function PCAprovadas({ usuarioLogado, verTodas, onVoltar }) {
  const podeFechar = temPermissao(usuarioLogado, 'prestacao_contas_fechar')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aprovadas, setAprovadas] = useState([])
  const [selecionadas, setSelecionadas] = useState(new Set())
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [gerandoExcel, setGerandoExcel] = useState(false)
  const [baixandoFotos, setBaixandoFotos] = useState(false)
  const [fechando, setFechando] = useState(false)

  const carregar = async () => {
    setCarregando(true)
    try {
      const lista = await listarAprovadas(usuarioLogado.id, verTodas)
      setAprovadas(lista)
      setSelecionadas(new Set(lista.map(p => p.id)))
    } catch (e) {
      setErro(e.message || 'Erro ao carregar prestações aprovadas.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [usuarioLogado.id, verTodas]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtradas = useMemo(() => {
    return aprovadas.filter(p => {
      const dataAprov = p.analisado_em ? p.analisado_em.slice(0, 10) : ''
      if (dataDe && dataAprov < dataDe) return false
      if (dataAte && dataAprov > dataAte) return false
      return true
    })
  }, [aprovadas, dataDe, dataAte])

  const selecionadasNaLista = filtradas.filter(p => selecionadas.has(p.id))
  const totalSelecionado = selecionadasNaLista.reduce((s, p) => s + p.valor_total, 0)

  const toggle = (id) => {
    setSelecionadas(prev => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }

  const selecionarTodasFiltradas = () => setSelecionadas(new Set(filtradas.map(p => p.id)))
  const limparSelecao = () => setSelecionadas(new Set())

  const handleExcel = () => {
    if (selecionadasNaLista.length === 0) { alert('Selecione ao menos uma prestação.'); return }
    setGerandoExcel(true)
    try {
      gerarExcelConsolidado(selecionadasNaLista)
    } catch (e) {
      alert('Não foi possível gerar o Excel: ' + (e.message || e))
    } finally {
      setGerandoExcel(false)
    }
  }

  const handleFotos = async () => {
    if (selecionadasNaLista.length === 0) { alert('Selecione ao menos uma prestação.'); return }
    setBaixandoFotos(true)
    try {
      await baixarFotosConsolidadas(selecionadasNaLista)
    } catch (e) {
      alert('Não foi possível baixar as fotos: ' + (e.message || e))
    } finally {
      setBaixandoFotos(false)
    }
  }

  const handleFechar = async () => {
    if (selecionadasNaLista.length === 0) { alert('Selecione ao menos uma prestação.'); return }
    const confirmado = confirm(
      `Fechar a prestação de contas do período com ${selecionadasNaLista.length} prestação(ões), ` +
      `totalizando R$ ${totalSelecionado.toFixed(2).replace('.', ',')}?\n\n` +
      `Já baixou o Excel e as fotos desse lote? Depois de fechado, essas prestações saem desta tela ` +
      `e passam a aparecer como "Prestação de Conta Realizada".`
    )
    if (!confirmado) return
    setFechando(true)
    try {
      const fechamento = await fecharPrestacoes(selecionadasNaLista, usuarioLogado.id, { periodoDe: dataDe, periodoAte: dataAte })
      alert(`Fechado com sucesso: ${fechamento.numero_fechamento}`)
      await carregar()
    } catch (e) {
      alert('Não foi possível fechar: ' + (e.message || e))
    } finally {
      setFechando(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>Prestação de Contas</div>
          <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>🏠 Home</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>✅ Aprovadas — Exportar</div>
      </header>

      <main className="app-content">
        {carregando ? (
          <CarregandoHexagono texto="Carregando..." />
        ) : erro ? (
          <p style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ {erro}</p>
        ) : aprovadas.length === 0 ? (
          <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '28px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma prestação aprovada ainda.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Aprovada de</label>
                <input type="date" className="form-input" value={dataDe} onChange={e => setDataDe(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Aprovada até</label>
                <input type="date" className="form-input" value={dataAte} onChange={e => setDataAte(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ fontSize: 12, color: '#64748b' }}>{selecionadasNaLista.length} de {filtradas.length} selecionada(s)</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={selecionarTodasFiltradas} style={{ border: 'none', background: 'transparent', color: '#1e3a5f', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Selecionar todas</button>
                <button onClick={limparSelecao} style={{ border: 'none', background: 'transparent', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Limpar</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {filtradas.map(p => {
                const sel = selecionadas.has(p.id)
                return (
                  <label key={p.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff',
                    border: `1.5px solid ${sel ? '#3b82f6' : '#e2e8f0'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={sel} onChange={() => toggle(p.id)} style={{ marginTop: 3 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{p.numero_pc}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>R$ {p.valor_total.toFixed(2).replace('.', ',')}</span>
                      </div>
                      <p style={{ fontSize: 11, color: '#64748b' }}>
                        {p.remetente_nome} · {p.total_itens} {p.total_itens === 1 ? 'item' : 'itens'} · aprovada em {p.analisado_em ? new Date(p.analisado_em).toLocaleDateString('pt-BR') : '—'}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                <span>Total selecionado</span>
                <span>R$ {totalSelecionado.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={handleExcel} disabled={gerandoExcel} style={{
                width: '100%', padding: 14, borderRadius: 12, border: 'none',
                background: '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>{gerandoExcel ? '⏳ Gerando...' : '📊 Baixar Excel Consolidado'}</button>
              <button onClick={handleFotos} disabled={baixandoFotos} style={{
                width: '100%', padding: 14, borderRadius: 12, border: 'none',
                background: baixandoFotos ? '#94a3b8' : '#1e3a5f', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: baixandoFotos ? 'not-allowed' : 'pointer',
              }}>{baixandoFotos ? '⏳ Baixando fotos...' : '🗂️ Baixar Fotos em Lote (.zip)'}</button>
              <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                Um único Excel e um único .zip com tudo que estiver marcado acima.
              </p>

              {podeFechar && (
                <>
                  <div style={{ borderTop: '1px dashed #cbd5e1', margin: '6px 0' }} />
                  <button onClick={handleFechar} disabled={fechando} style={{
                    width: '100%', padding: 14, borderRadius: 12, border: 'none',
                    background: fechando ? '#94a3b8' : 'linear-gradient(135deg, #b45309, #92400e)',
                    color: '#fff', fontSize: 14, fontWeight: 700, cursor: fechando ? 'not-allowed' : 'pointer',
                  }}>{fechando ? '⏳ Fechando...' : '🔒 Fechar Prestação de Conta do Período'}</button>
                  <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                    Já baixou o Excel e as fotos acima? Isso encerra o ciclo: o selecionado sai desta fila e vai
                    pro histórico de "Fechamentos". O próximo ciclo começa do zero, só com as futuras aprovadas.
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

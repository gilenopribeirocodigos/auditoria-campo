import { useEffect, useState } from 'react'
import { CarregandoHexagono } from '../../../components/Shared.jsx'
import { listarFechamentos, listarPrestacoesDoFechamento } from '../lib/prestacaoContas.js'
import { gerarExcelConsolidado, baixarFotosConsolidadas } from '../lib/exportacao.js'

export default function PCFechadas({ onVoltar, onHome }) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [fechamentos, setFechamentos] = useState([])
  const [abertoId, setAbertoId] = useState(null)
  const [prestacoesDoAberto, setPrestacoesDoAberto] = useState([])
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)
  const [gerandoExcel, setGerandoExcel] = useState(false)
  const [baixandoFotos, setBaixandoFotos] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        setFechamentos(await listarFechamentos())
      } catch (e) {
        setErro(e.message || 'Erro ao carregar fechamentos.')
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  const abrir = async (id) => {
    if (abertoId === id) { setAbertoId(null); return }
    setAbertoId(id)
    setCarregandoDetalhe(true)
    try {
      setPrestacoesDoAberto(await listarPrestacoesDoFechamento(id))
    } catch (e) {
      alert('Não foi possível carregar: ' + (e.message || e))
    } finally {
      setCarregandoDetalhe(false)
    }
  }

  const handleExcel = () => {
    setGerandoExcel(true)
    try { gerarExcelConsolidado(prestacoesDoAberto) }
    catch (e) { alert('Não foi possível gerar o Excel: ' + (e.message || e)) }
    finally { setGerandoExcel(false) }
  }

  const handleFotos = async () => {
    setBaixandoFotos(true)
    try { await baixarFotosConsolidadas(prestacoesDoAberto) }
    catch (e) { alert('Não foi possível baixar as fotos: ' + (e.message || e)) }
    finally { setBaixandoFotos(false) }
  }

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>Prestação de Contas</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>← Voltar</button>
            {onHome && (
              <button onClick={onHome} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>🏠 Home</button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>🔒 Fechamentos</div>
      </header>

      <main className="app-content">
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
          Histórico dos lotes de prestação de contas já processados. Toque num lote pra ver as prestações incluídas e reexportar.
        </p>

        {carregando ? (
          <CarregandoHexagono texto="Carregando..." />
        ) : erro ? (
          <p style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ {erro}</p>
        ) : fechamentos.length === 0 ? (
          <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '28px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhum fechamento realizado ainda.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {fechamentos.map(f => (
              <div key={f.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <button onClick={() => abrir(f.id)} style={{
                  width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{f.numero_fechamento}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>R$ {Number(f.valor_total).toFixed(2).replace('.', ',')}</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#64748b' }}>
                    {f.qtd_prestacoes} {f.qtd_prestacoes === 1 ? 'prestação' : 'prestações'} · fechado por {f.fechado_por_nome} em {new Date(f.fechado_em).toLocaleString('pt-BR')}
                  </p>
                </button>

                {abertoId === f.id && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid #f1f5f9' }}>
                    {carregandoDetalhe ? (
                      <CarregandoHexagono texto="Carregando..." tamanho={36} padding={16} />
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, marginBottom: 10 }}>
                          {prestacoesDoAberto.map(p => (
                            <p key={p.id} style={{ fontSize: 12, color: '#374151' }}>
                              {p.numero_pc} — {p.remetente_nome} · R$ {p.valor_total.toFixed(2).replace('.', ',')}
                            </p>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={handleExcel} disabled={gerandoExcel} style={{
                            flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#7c3aed',
                            color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}>{gerandoExcel ? '⏳...' : '📊 Excel'}</button>
                          <button onClick={handleFotos} disabled={baixandoFotos} style={{
                            flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#1e3a5f',
                            color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}>{baixandoFotos ? '⏳...' : '🗂️ Fotos (.zip)'}</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

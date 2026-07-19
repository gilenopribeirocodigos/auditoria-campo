import { useState, useRef, useMemo } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase.js'
import {
  useFiltrosOperacionais,
  PainelFiltros,
  FIELD_HEIGHT, LABEL_STYLE, INPUT_STYLE,
} from '../components/PainelFiltros.jsx'
import { compartilharPDFNativo, renderizarElementoParaCanvas } from '../lib/compartilhar.js'

const STATUS_COR = {
  'ATENDE':         { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  'ATENDE PARCIAL': { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  'NÃO ATENDE':     { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
}

export default function FeedbacksPDF({ usuarioLogado, onVoltar }) {
  // Hook do painel — Período + Sup. Op + Sup. Campo + Prefixo + cascatas
  const filtros = useFiltrosOperacionais({ inicializarMes: true, usuarioLogado })

  // Filtros específicos desta tela (extras)
  const [agruparPor, setAgruparPor] = useState('equipe')

  const [auditorias, setAuditorias] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [gerado,     setGerado]     = useState(false)
  const [gerandoPDF, setGerandoPDF] = useState(false)
  const printRef = useRef(null)

  const buscar = async () => {
    setLoading(true)
    setGerado(false)
    try {
      const { ini, fim } = filtros.getDatasQuery()
      if (!ini || !fim) { setLoading(false); return }

      let q = supabase
        .from('auditorias').select('*')
        .gte('data_auditoria', ini).lte('data_auditoria', fim)
        .not('feedback', 'is', null).neq('feedback', '')
        .order('prefixo').order('data_auditoria')

      const { data, error } = await q
      if (error) throw error

      // Aplica filtros de Sup. Op + Sup. Campo + Prefixo em memória
      const filtradas = filtros.filtrar(data || [])
      setAuditorias(filtradas)
      setGerado(true)
    } catch (e) {
      console.error(e)
      alert('Erro ao buscar feedbacks: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // App Android nativo: window.print() não funciona dentro do WebView —
  // captura a mesma área de impressão já renderizada na tela e compartilha
  // como PDF via folha nativa do Android. Na web, mantém window.print().
  const imprimirPDF = async () => {
    if (!Capacitor.isNativePlatform()) { window.print(); return }
    setGerandoPDF(true)
    try {
      const canvas = await renderizarElementoParaCanvas(printRef.current, { escala: 3, corFundo: '#fff' })
      const nomeArq = `Feedbacks_${new Date().toISOString().slice(0, 10)}.pdf`
      await compartilharPDFNativo(canvas, nomeArq, { titulo: 'Relatório de Feedbacks' })
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
      alert('Não foi possível gerar o PDF. Tente novamente.')
    } finally {
      setGerandoPDF(false)
    }
  }

  const formatData    = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
  const formatPeriodo = () => {
    const { ini, fim } = filtros.getDatasQuery()
    return `${formatData(ini)} a ${formatData(fim)}`
  }

  const grupos = useMemo(() => {
    if (!auditorias.length) return []
    const chave = agruparPor === 'equipe' ? 'prefixo' : 'fiscal'
    const mapa = {}
    auditorias.forEach(a => {
      const k = a[chave] || '—'
      if (!mapa[k]) mapa[k] = []
      mapa[k].push(a)
    })
    return Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b))
  }, [auditorias, agruparPor])

  // ── Filtro extra: "Agrupar por" (slot na grid do painel) ──
  const extras = (
    <div>
      <label style={LABEL_STYLE}>Agrupar por</label>
      <select value={agruparPor} onChange={e => setAgruparPor(e.target.value)} style={{
        ...INPUT_STYLE, cursor: 'pointer', appearance: 'none',
        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%2394a3b8\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E")',
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32,
      }}>
        <option value="equipe">Equipe (Prefixo)</option>
        <option value="fiscal">Fiscal</option>
      </select>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area { padding: 0 !important; background: white !important; }
          body { background: white !important; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      {/* Header */}
      <div className="no-print" style={{ background: '#7c3aed', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>💬 Relatório de Feedbacks</h1>
          <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>
            Feedbacks aplicados às equipes no período
            {filtros.temSegregacao && (
              <span style={{
                marginLeft: 8, padding: '2px 8px', borderRadius: 10,
                background: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 700,
              }}>
                🔒 Sua estrutura ({filtros.prefixosPermitidos?.length || 0} prefixos)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* PAINEL DE FILTROS + ações */}
      <div className="no-print" style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 0' }}>

        <PainelFiltros
          filtros={filtros}
          titulo="🔍 Filtros do Relatório"
          badge="aplica em todos os feedbacks"
          extras={extras}
        />

        {/* Ações */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={buscar} disabled={loading} style={{
            height: FIELD_HEIGHT, padding: '0 22px',
            background: loading ? '#64748b' : '#1e3a5f', color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            {loading ? '⏳ Buscando...' : '🔍 Gerar Relatório'}
          </button>
          {gerado && auditorias.length > 0 && (
            <button onClick={imprimirPDF} disabled={gerandoPDF} style={{
              height: FIELD_HEIGHT, padding: '0 22px',
              background: gerandoPDF ? '#64748b' : '#7c3aed', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: gerandoPDF ? 'not-allowed' : 'pointer',
            }}>
              {gerandoPDF ? '⏳ Gerando PDF...' : `🖨️ Imprimir / Salvar PDF (${auditorias.length} feedbacks)`}
            </button>
          )}
        </div>

        {gerado && auditorias.length === 0 && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#15803d', fontWeight: 600, marginBottom: 16 }}>
            ✅ Nenhum feedback encontrado para os filtros selecionados.
          </div>
        )}
      </div>

      {/* ÁREA DE IMPRESSÃO */}
      {gerado && auditorias.length > 0 && (
        <div ref={printRef} className="print-area" style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 60px' }}>

          {/* Cabeçalho do relatório */}
          <div style={{
            background: '#1e3a5f', color: '#fff', borderRadius: 12,
            padding: '20px 24px', marginBottom: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
                  💬 Relatório de Feedbacks — DPL Construções
                </h2>
                <p style={{ fontSize: 12, opacity: 0.8 }}>Contrato Equatorial Energia 1021/2024</p>
                <p style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>
                  Período: {formatPeriodo()}
                </p>
                {filtros.selRegional.length > 0 && (
                  <p style={{ fontSize: 12, marginTop: 4, fontWeight: 600, opacity: 0.9 }}>
                    Regional: {filtros.selRegional.join(', ')}
                  </p>
                )}
                {filtros.selSupOp.length > 0 && (
                  <p style={{ fontSize: 12, marginTop: 4, fontWeight: 600, opacity: 0.9 }}>
                    Sup. Operacional: {filtros.selSupOp.join(', ')}
                  </p>
                )}
                {filtros.selSupCampo.length > 0 && (
                  <p style={{ fontSize: 12, marginTop: 4, fontWeight: 600, opacity: 0.9 }}>
                    Sup. Campo: {filtros.selSupCampo.join(', ')}
                  </p>
                )}
                {filtros.selPrefixos.length > 0 && (
                  <p style={{ fontSize: 12, marginTop: 4, fontWeight: 600, opacity: 0.9 }}>
                    Prefixo{filtros.selPrefixos.length > 1 ? 's' : ''}: {filtros.selPrefixos.join(', ')}
                  </p>
                )}
                <p style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                  Agrupado por: {agruparPor === 'equipe' ? 'Equipe (Prefixo)' : 'Fiscal'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 32, fontWeight: 900 }}>{auditorias.length}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>feedbacks no período</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                  {grupos.length} {agruparPor === 'equipe' ? 'equipe(s)' : 'fiscal(is)'}
                </div>
              </div>
            </div>
          </div>

          {/* Grupos */}
          {grupos.map(([grupo, items], gi) => (
            <div key={grupo} style={{ marginBottom: 28 }} className={gi > 0 && gi % 3 === 0 ? 'page-break' : ''}>

              <div style={{
                background: '#1e3a5f', color: '#fff',
                borderRadius: '10px 10px 0 0', padding: '12px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>
                  {agruparPor === 'equipe' ? '🚗 ' : '👤 '}{grupo}
                </span>
                <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                  <span style={{ background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: 20 }}>
                    {items.length} feedback{items.length > 1 ? 's' : ''}
                  </span>
                  <span style={{ background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: 20 }}>
                    Média: {(items.reduce((a, i) => a + Number(i.nota), 0) / items.length).toFixed(1)} pts
                  </span>
                </div>
              </div>

              <div style={{ border: '1.5px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                {items.map((a, idx) => {
                  const sc = STATUS_COR[a.status] || { bg: '#f1f5f9', color: '#374151', border: '#e2e8f0' }
                  return (
                    <div key={a.id} style={{
                      background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                      borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none',
                      padding: '14px 18px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                            {agruparPor === 'equipe' ? a.fiscal : a.prefixo}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px',
                            borderRadius: 20, background: sc.bg, color: sc.color,
                            border: `1px solid ${sc.border}`,
                          }}>{a.status}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            {a.tipo_servico} · {a.produtivo ? 'Produtivo' : 'Improdutivo'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b', flexShrink: 0 }}>
                          <span>📅 {formatData(a.data_auditoria)}</span>
                          <span>OS: {a.os}</span>
                          <span style={{
                            fontSize: 13, fontWeight: 800, color: sc.color,
                            background: sc.bg, padding: '1px 8px', borderRadius: 6,
                          }}>{Number(a.nota).toFixed(0)} pts</span>
                        </div>
                      </div>

                      <div style={{
                        background: '#fffbeb', border: '1px solid #fcd34d',
                        borderRadius: 8, padding: '10px 14px',
                        marginBottom: a.observacoes ? 8 : 0,
                      }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#92400e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Feedback do Fiscal:
                        </p>
                        <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6, margin: 0 }}>{a.feedback}</p>
                      </div>

                      {a.observacoes && (
                        <div style={{
                          background: '#f0f9ff', border: '1px solid #bae6fd',
                          borderRadius: 8, padding: '10px 14px', marginTop: 8,
                        }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Observações:
                          </p>
                          <p style={{ fontSize: 13, color: '#0c4a6e', lineHeight: 1.6, margin: 0 }}>{a.observacoes}</p>
                        </div>
                      )}

                      {(a.nome_eletricista || a.nome_eletricista2) && (
                        <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                          {a.nome_eletricista  && <span>👷 {a.nome_eletricista}</span>}
                          {a.nome_eletricista2 && <span style={{ marginLeft: 12 }}>👷 {a.nome_eletricista2}</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Rodapé */}
          <div style={{
            borderTop: '2px solid #e2e8f0', paddingTop: 16, marginTop: 8,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 11, color: '#94a3b8', flexWrap: 'wrap', gap: 8,
          }}>
            <span>DPL Construções — Contrato Equatorial Energia 1021/2024</span>
            <span>Gerado em {new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</span>
          </div>
        </div>
      )}
    </div>
  )
}

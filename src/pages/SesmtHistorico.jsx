import { useEffect, useState } from 'react'
import { listarAcoesSesmt } from '../lib/sesmt.js'
import { TIPOS_ACAO_SESMT } from '../data/sesmt_config.js'
import { CarregandoHexagono } from '../components/Shared.jsx'

const hojeISO = () => new Date().toISOString().slice(0, 10)
const inicioMesISO = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

export default function SesmtHistorico({ onVoltar }) {
  const [dataIni, setDataIni] = useState(inicioMesISO())
  const [dataFim, setDataFim] = useState(hojeISO())
  const [tipo,    setTipo]    = useState('')
  const [fiscal,  setFiscal]  = useState('')

  const [acoes,   setAcoes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState('')
  const [detalhe, setDetalhe] = useState(null)

  const buscar = async () => {
    setLoading(true)
    setErro('')
    try {
      const data = await listarAcoesSesmt({ tipo, dataIni, dataFim, fiscal: fiscal.trim() })
      setAcoes(data)
    } catch (e) {
      setErro(e.message || 'Erro ao carregar histórico.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { buscar() }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>
      <div style={{ background: 'linear-gradient(135deg, #92400e, #d97706)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
            ← Voltar
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📂 Histórico — Ações SESMT</h1>
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>Diálogo de Segurança, Treinamento e Reciclagem já registrados</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{acoes.length}</div>
              <div style={{ fontSize: 9, opacity: 0.85 }}>Total</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 16px 80px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>🔍 Filtros</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>De</label>
              <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Até</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', background: '#fff' }}>
                <option value="">Todos</option>
                {Object.entries(TIPOS_ACAO_SESMT).map(([k, t]) => <option key={k} value={k}>{t.emoji} {t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Fiscal</label>
              <input value={fiscal} onChange={e => setFiscal(e.target.value)} placeholder="Nome do fiscal"
                style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
          <button onClick={buscar} style={{ padding: '10px 20px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            🔍 Buscar
          </button>
        </div>

        {loading ? (
          <CarregandoHexagono texto="Carregando ações..." />
        ) : erro ? (
          <p style={{ color: '#dc2626', fontWeight: 700, textAlign: 'center', padding: 20 }}>⚠️ {erro}</p>
        ) : acoes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🦺</div>
            <p>Nenhuma ação encontrada no período.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {acoes.map(a => {
              const tc = TIPOS_ACAO_SESMT[a.tipo] || {}
              const qtdParticipantes = Array.isArray(a.participantes) ? a.participantes.length : 0
              const qtdAssinados = Array.isArray(a.participantes) ? a.participantes.filter(p => p.assinatura_url).length : 0
              return (
                <div key={a.id} onClick={() => setDetalhe(a)} style={{
                  background: '#fff', borderRadius: 14, border: `1.5px solid ${tc.border || '#e2e8f0'}`,
                  padding: '14px 16px', cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 18 }}>{tc.emoji}</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: tc.color || '#1e293b' }}>{tc.label}</span>
                      </div>
                      {a.tema && <p style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 4 }}>{a.tema}</p>}
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                        <span>👤 {a.fiscal}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>📅 {formatData(a.data_registro)} às {a.hora_registro}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>✍️ {qtdAssinados}/{qtdParticipantes} assinado(s)</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 18, color: '#94a3b8', marginLeft: 8 }}>›</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {detalhe && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setDetalhe(null) }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', padding: '24px 20px 40px' }}>
            {(() => {
              const tc = TIPOS_ACAO_SESMT[detalhe.tipo] || {}
              const participantes = detalhe.participantes || []
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 800 }}>{tc.emoji} {tc.label}</h3>
                    <button onClick={() => setDetalhe(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
                  </div>

                  <div style={{ background: tc.bg, border: `2px solid ${tc.border}`, borderRadius: 14, padding: 16, textAlign: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 40, marginBottom: 6 }}>{tc.emoji}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: tc.color }}>{tc.label}</div>
                    <div style={{ fontSize: 13, color: tc.color, opacity: 0.85, marginTop: 4 }}>{participantes.length} participante(s)</div>
                  </div>

                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                    {[
                      ['Fiscal',    detalhe.fiscal],
                      ['Matrícula', detalhe.matricula_fiscal],
                      ['Data/Hora', `${formatData(detalhe.data_registro)} às ${detalhe.hora_registro}`],
                      ['Local',     detalhe.endereco || (detalhe.lat ? `${detalhe.lat}, ${detalhe.lng}` : null)],
                      ['Tema',      detalhe.tema],
                      ['Motivo',    detalhe.motivo],
                    ].filter(([, v]) => v).map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                        <span style={{ color: '#94a3b8', fontWeight: 500 }}>{l}</span>
                        <span style={{ color: '#1e293b', fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {detalhe.observacao && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>OBSERVAÇÃO:</p>
                      <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>{detalhe.observacao}</p>
                    </div>
                  )}

                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>✅ Participantes ({participantes.length})</p>
                    {participantes.map((p, i) => {
                      const assinado = Boolean(p.assinatura_url)
                      return (
                        <div key={i} style={{
                          background: assinado ? '#f0fdf4' : '#fffbeb',
                          border: `1px solid ${assinado ? '#86efac' : '#fcd34d'}`,
                          borderRadius: 10, padding: '10px 12px', marginBottom: 8,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: assinado ? '#15803d' : '#92400e' }}>{i + 1}. {p.nome}</span>
                              {p.modo === 'online' && <span style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>🔗 online</span>}
                            </div>
                            {p.chapa && <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>Matrícula: {p.chapa}</p>}
                            {p.endereco_assinatura && (
                              <p style={{ fontSize: 11, color: '#15803d', margin: '4px 0 0', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                <span style={{ flexShrink: 0 }}>📍</span><span>{p.endereco_assinatura}</span>
                              </p>
                            )}
                            {!assinado && <p style={{ fontSize: 11, color: '#d97706', fontWeight: 600, margin: '4px 0 0' }}>⚠️ Não assinou</p>}
                          </div>
                          {assinado && (
                            <img src={p.assinatura_url} alt="assinatura" style={{ height: 36, maxWidth: 90, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0' }} />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {Array.isArray(detalhe.fotos_urls) && detalhe.fotos_urls.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📷 Fotos ({detalhe.fotos_urls.length})</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {detalhe.fotos_urls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`Foto ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={() => setDetalhe(null)} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Fechar
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

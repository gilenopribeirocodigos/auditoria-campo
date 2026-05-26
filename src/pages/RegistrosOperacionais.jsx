import { useState, useEffect, useRef } from 'react'
import { listarRegistros } from '../lib/registros.js'
import { listarAssinaturasColetadas, listarTokensRegistro } from '../lib/assinaturas.js'
import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'

function calcMesAtual() {
  const hoje = new Date()
  const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0]
  const fim  = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]
  return { ini, fim }
}

const TIPO_MEDIDA_LABEL = {
  FEEDBACK:            'Feedback',
  ADVERTENCIA_VERBAL:  'Advertência Verbal',
  ADVERTENCIA_ESCRITA: 'Advertência Escrita',
  SUSPENSAO:           'Suspensão',
}

function imprimirRegistro(r, assinaturasOnline = []) {
  const tipoConfig = TIPOS_REGISTRO[r.tipo]
  const modConfig  = MODALIDADES[r.modalidade]
  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const participantesRenderizados = (r.participantes || []).map(p => {
    const assinaturaOnline = assinaturasOnline.find(
      a => a.nome?.trim().toLowerCase() === p.nome?.trim().toLowerCase()
    )
    // isOnline: campo modo presente, OU tem assinatura coletada online sem assinatura presencial
    const isOnline = p.modo === 'online' || (!!assinaturaOnline && !p.assinatura_url)
    return {
      ...p,
      isOnline,
      assinaturaFinal: p.assinatura_url || assinaturaOnline?.assinatura_url || null,
    }
  })

  const apenasOnline = assinaturasOnline.filter(
    a => !r.participantes?.some(p => p.nome?.trim().toLowerCase() === a.nome?.trim().toLowerCase())
  )

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>${tipoConfig?.label}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:24px;}
  @media print{body{background:#fff;padding:0;}.no-print{display:none!important;}@page{margin:15mm;}}</style></head><body>
  <div style="background:linear-gradient(135deg,#1e3a5f,#1d4ed8);color:#fff;padding:20px 24px;border-radius:14px;margin-bottom:16px;">
    <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">DPL Construções — Equatorial Energia</div>
    <div style="font-size:20px;font-weight:800;">${tipoConfig?.emoji} ${tipoConfig?.label}</div>
    <div style="font-size:13px;opacity:0.8;margin-top:2px;">${modConfig?.label} · Contrato 1021/2024</div>
  </div>
  ${r.tipo === 'DISCIPLINAR' && r.tipo_medida ? `<div style="background:${tipoConfig?.bg};border:2px solid ${tipoConfig?.color};border-radius:12px;padding:12px 16px;margin-bottom:16px;text-align:center;"><span style="font-size:16px;font-weight:800;color:${tipoConfig?.color};">${TIPO_MEDIDA_LABEL[r.tipo_medida]||r.tipo_medida}</span></div>` : ''}
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:4px 0;margin-bottom:16px;">
    <div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;">Dados do Registro</div>
    <table style="width:100%;border-collapse:collapse;">
      ${[['Fiscal',r.fiscal],['Matrícula',r.matricula_fiscal],['Data/Hora',`${formatData(r.data_registro)} às ${r.hora_registro}`],['Local',r.endereco],['GPS',r.lat?`${r.lat}, ${r.lng}`:null],['Tema',r.tema],['Carga Horária',r.carga_horaria]].filter(([,v])=>v).map(([l,v])=>`<tr><td style="padding:7px 10px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">${l}</td><td style="padding:7px 10px;color:#1e293b;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9;">${v}</td></tr>`).join('')}
    </table>
  </div>
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">${r.tipo==='DISCIPLINAR'?'Descrição da Ocorrência':'Pauta / Conteúdo'}</div>
    <div style="font-size:13px;color:#475569;line-height:1.7;">${r.pauta||''}</div>
  </div>
  ${participantesRenderizados.length > 0 ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:16px;">
    <div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:700;color:#374151;">LISTA DE FREQUÊNCIA (${participantesRenderizados.length + apenasOnline.length})</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#1e3a5f;">
        <th style="padding:8px 10px;color:#fff;font-size:12px;text-align:left;">Nº</th>
        <th style="padding:8px 10px;color:#fff;font-size:12px;text-align:left;">Nome</th>
        <th style="padding:8px 10px;color:#fff;font-size:12px;">Mat.</th>
        <th style="padding:8px 10px;color:#fff;font-size:12px;">Assinatura / Status</th>
      </tr>
      ${participantesRenderizados.map((p,i)=>`
        <tr style="border-bottom:1px solid #f1f5f9;${p.isOnline?'background:#eff6ff;':''}">
          <td style="padding:8px 10px;font-size:13px;">${i+1}</td>
          <td style="padding:8px 10px;font-size:13px;font-weight:600;">
            ${p.nome}
            ${p.isOnline?'<span style="font-size:10px;color:#1d4ed8;background:#dbeafe;padding:1px 5px;border-radius:4px;margin-left:4px;">🔗 online</span>':''}
          </td>
          <td style="padding:8px 10px;font-size:13px;text-align:center;">${p.matricula||'—'}</td>
          <td style="padding:4px 8px;">
            ${p.assinaturaFinal
              ? `<img src="${p.assinaturaFinal}" style="height:40px;max-width:120px;object-fit:contain;" crossorigin="anonymous"/>`
              : p.isOnline
                ? '<span style="font-size:11px;color:#f59e0b;background:#fef3c7;padding:2px 6px;border-radius:4px;border:1px solid #fcd34d;">⏳ Aguardando assinatura</span>'
                : '<span style="font-size:11px;color:#94a3b8;">—</span>'
            }
          </td>
        </tr>`).join('')}
      ${apenasOnline.map((a,i)=>`
        <tr style="border-bottom:1px solid #f1f5f9;background:#eff6ff;">
          <td style="padding:8px 10px;font-size:13px;">${participantesRenderizados.length+i+1}</td>
          <td style="padding:8px 10px;font-size:13px;font-weight:600;">
            ${a.nome}
            <span style="font-size:10px;color:#1d4ed8;background:#dbeafe;padding:1px 5px;border-radius:4px;margin-left:4px;">🔗 online</span>
          </td>
          <td style="padding:8px 10px;font-size:13px;text-align:center;">${a.matricula||'—'}</td>
          <td style="padding:4px 8px;">${a.assinatura_url?`<img src="${a.assinatura_url}" style="height:40px;max-width:120px;object-fit:contain;" crossorigin="anonymous"/>`:''}</td>
        </tr>`).join('')}
    </table>
  </div>` : ''}
  ${Array.isArray(r.fotos_urls) && r.fotos_urls.length > 0 ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px;">📷 Fotos (${r.fotos_urls.length})</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
      ${r.fotos_urls.map(url=>`<img src="${url}" crossorigin="anonymous" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;display:block;"/>`).join('')}
    </div>
  </div>` : ''}
  <div style="border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;">DPL Construções — Contrato Equatorial Energia 1021/2024</p>
    <p style="font-size:10px;color:#cbd5e1;margin-top:2px;">Gerado em ${new Date().toLocaleDateString('pt-BR',{dateStyle:'long'})}</p>
  </div>
  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button onclick="window.print()" style="padding:12px 32px;background:#1e3a5f;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">🖨️ Imprimir / Salvar PDF</button>
  </div>
  </body></html>`

  const janela = window.open('', '_blank', 'width=700,height=900')
  if (!janela) { alert('Permita pop-ups.'); return }
  janela.document.write(html)
  janela.document.close()
  janela.onload = () => setTimeout(() => janela.print(), 600)
}

export default function RegistrosOperacionais({ usuarioLogado, onVoltar, onNovo }) {
  const [registros,     setRegistros]     = useState([])
  const [loading,       setLoading]       = useState(true)
  const [detalhe,       setDetalhe]       = useState(null)
  const [assinOnline,   setAssinOnline]   = useState([])
  const [loadingOnline, setLoadingOnline] = useState(false)
  const [filtros,       setFiltros]       = useState({
    dataIni: calcMesAtual().ini,
    dataFim: calcMesAtual().fim,
    tipo:    '',
    fiscal:  '',
  })
  const intervalRef = useRef(null)

  const buscar = async () => {
    setLoading(true)
    try {
      const data = await listarRegistros(filtros, usuarioLogado)
      setRegistros(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { buscar() }, [])
  useEffect(() => {
    intervalRef.current = setInterval(buscar, 30000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const upd = (k, v) => setFiltros(f => ({ ...f, [k]: v }))
  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
  const isAdmin = ['ADMIN', 'SUPERV. OPERAÇÃO', 'SUPERV. CAMPO'].includes(usuarioLogado?.perfil)

  const fetchAssinaturasOnline = async (registroId) => {
    setLoadingOnline(true)
    try {
      const tokens = await listarTokensRegistro(registroId)
      const todas  = []
      for (const t of tokens) {
        const col = await listarAssinaturasColetadas(t.id)
        todas.push(...col)
      }
      setAssinOnline(todas)
    } catch (e) {
      console.error('Erro ao buscar assinaturas online:', e)
    } finally {
      setLoadingOnline(false)
    }
  }

  const abrirDetalhe = (r) => {
    setDetalhe(r)
    setAssinOnline([])
    fetchAssinaturasOnline(r.id)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e3a5f)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
            ← Voltar para Home
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📝 Registros Operacionais</h1>
              <p style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
                {isAdmin ? 'Todos os registros' : `Seus registros — ${usuarioLogado?.nome}`}
              </p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{registros.length}</div>
              <div style={{ fontSize: 9, opacity: 0.85 }}>Total</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 80px' }}>

        <button onClick={onNovo} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#2563eb', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>
          + Novo Registro Operacional
        </button>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 12 }}>Filtros</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Data início</label>
              <input type="date" value={filtros.dataIni} onChange={e => upd('dataIni', e.target.value)} className="form-input" style={{ fontSize: 13, padding: '8px 10px' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Data fim</label>
              <input type="date" value={filtros.dataFim} onChange={e => upd('dataFim', e.target.value)} className="form-input" style={{ fontSize: 13, padding: '8px 10px' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Tipo</label>
              <select value={filtros.tipo} onChange={e => upd('tipo', e.target.value)} className="form-input" style={{ fontSize: 13, padding: '8px 10px' }}>
                <option value="">Todos</option>
                {Object.entries(TIPOS_REGISTRO).map(([k, t]) => (
                  <option key={k} value={k}>{t.emoji} {t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={buscar} style={{ marginTop: 12, padding: '10px 24px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            🔍 Buscar
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p>Carregando registros...</p>
          </div>
        ) : registros.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
            <p>Nenhum registro encontrado.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {registros.map(r => {
              const tc = TIPOS_REGISTRO[r.tipo] || {}
              const mc = MODALIDADES[r.modalidade] || {}
              return (
                <div key={r.id} style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${tc.border || '#e2e8f0'}`, padding: '14px 16px', cursor: 'pointer' }}
                  onClick={() => abrirDetalhe(r)}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 18 }}>{tc.emoji}</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: tc.color || '#1e293b' }}>{tc.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: tc.bg, color: tc.color }}>{mc.emoji} {mc.label}</span>
                        {r.tipo === 'DISCIPLINAR' && r.tipo_medida && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fee2e2', color: '#dc2626' }}>{TIPO_MEDIDA_LABEL[r.tipo_medida]}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                        <span>👤 {r.fiscal}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>📅 {formatData(r.data_registro)} às {r.hora_registro}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>👥 {Array.isArray(r.participantes) ? r.participantes.length : 0} participante(s)</span>
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

      {/* Modal detalhe */}
      {detalhe && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setDetalhe(null) }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', padding: '24px 20px 40px' }}>
            {(() => {
              const tc           = TIPOS_REGISTRO[detalhe.tipo] || {}
              const mc           = MODALIDADES[detalhe.modalidade] || {}
              const participantes = detalhe.participantes || []

              // ── Enriquece cada participante ──────────────────────────────────────────
              // Lógica dupla: usa p.modo quando disponível (registros novos),
              // e sempre cruza com assinOnline para capturar assinaturas já realizadas
              // (cobre também registros antigos sem o campo modo)
              const participantesEnriquecidos = participantes.map(p => {
                // Busca assinatura online independente do modo
                const assinaturaOnline = assinOnline.find(
                  a => a.nome?.trim().toLowerCase() === p.nome?.trim().toLowerCase()
                )
                // É online se: campo modo diz 'online', OU tem assinatura em assinOnline sem assinatura presencial
                const isOnline = p.modo === 'online' || (!!assinaturaOnline && !p.assinatura_url)
                return {
                  ...p,
                  isOnline,
                  assinouOnline:   !!assinaturaOnline,
                  assinaturaFinal: p.assinatura_url || assinaturaOnline?.assinatura_url || null,
                }
              })

              // Pessoas que assinaram online mas não estavam na lista original
              const apenasOnline = assinOnline.filter(
                a => !participantes.some(p => p.nome?.trim().toLowerCase() === a.nome?.trim().toLowerCase())
              )

              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 800 }}>{tc.emoji} {tc.label}</h3>
                    <button onClick={() => setDetalhe(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
                  </div>

                  <div style={{ background: tc.bg, border: `2px solid ${tc.border}`, borderRadius: 14, padding: '16px', textAlign: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 40, marginBottom: 6 }}>{tc.emoji}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: tc.color }}>{tc.label}</div>
                    <div style={{ fontSize: 13, color: tc.color, opacity: 0.85, marginTop: 4 }}>
                      {mc.emoji} {mc.label} · {participantes.length} participante(s)
                    </div>
                    {detalhe.tipo === 'DISCIPLINAR' && detalhe.tipo_medida && (
                      <div style={{ marginTop: 8, background: tc.color, color: '#fff', padding: '3px 12px', borderRadius: 8, display: 'inline-block', fontSize: 12, fontWeight: 700 }}>
                        {TIPO_MEDIDA_LABEL[detalhe.tipo_medida]}
                      </div>
                    )}
                  </div>

                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                    {[
                      ['Fiscal',        detalhe.fiscal],
                      ['Matrícula',     detalhe.matricula_fiscal],
                      ['Data / Hora',   `${formatData(detalhe.data_registro)} às ${detalhe.hora_registro}`],
                      ['Local',         detalhe.endereco],
                      ['GPS',           detalhe.lat ? `${detalhe.lat}, ${detalhe.lng}` : null],
                      ['Tema',          detalhe.tema],
                      ['Carga Horária', detalhe.carga_horaria],
                    ].filter(([, v]) => v).map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                        <span style={{ color: '#94a3b8', fontWeight: 500 }}>{l}</span>
                        <span style={{ color: '#1e293b', fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {detalhe.pauta && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                        {detalhe.tipo === 'DISCIPLINAR' ? 'DESCRIÇÃO DA OCORRÊNCIA:' : 'PAUTA / CONTEÚDO:'}
                      </p>
                      <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>{detalhe.pauta}</p>
                    </div>
                  )}

                  {detalhe.observacoes && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>OBSERVAÇÕES:</p>
                      <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{detalhe.observacoes}</p>
                    </div>
                  )}

                  {/* Lista de Frequência unificada */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: 0 }}>
                        ✅ Lista de Frequência ({participantesEnriquecidos.length + apenasOnline.length})
                      </p>
                      <button onClick={() => fetchAssinaturasOnline(detalhe.id)} disabled={loadingOnline}
                        style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: loadingOnline ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                        {loadingOnline ? '⏳' : '🔄 Atualizar'}
                      </button>
                    </div>

                    {participantesEnriquecidos.map((p, i) => {
                      const bgColor   = p.isOnline ? '#eff6ff' : '#f0fdf4'
                      const bdColor   = p.isOnline ? '#bfdbfe' : '#86efac'
                      const nameColor = p.isOnline ? '#1d4ed8' : '#15803d'

                      return (
                        <div key={i} style={{ background: bgColor, border: `1px solid ${bdColor}`, borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: nameColor }}>
                                  {i + 1}. {p.nome}
                                </span>
                                {p.isOnline && (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>
                                    🔗 online
                                  </span>
                                )}
                              </div>
                              {p.matricula && <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>Mat: {p.matricula}</p>}
                              {/* Localização de onde assinou (apenas online com assinatura) */}
                              {p.isOnline && p.assinouOnline && (() => {
                                const assinOnlineData = assinOnline.find(
                                  a => a.nome?.trim().toLowerCase() === p.nome?.trim().toLowerCase()
                                )
                                return assinOnlineData ? (
                                  <div style={{ marginTop: 6 }}>
                                    {assinOnlineData.endereco_assinatura && (
                                      <p style={{ fontSize: 11, color: '#1d4ed8', margin: '0 0 2px', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                        <span style={{ flexShrink: 0 }}>📍</span>
                                        <span>{assinOnlineData.endereco_assinatura}</span>
                                      </p>
                                    )}
                                    {assinOnlineData.latitude && assinOnlineData.longitude && (
                                      <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                        🌐 {Number(assinOnlineData.latitude).toFixed(7)}, {Number(assinOnlineData.longitude).toFixed(7)}
                                      </p>
                                    )}
                                  </div>
                                ) : null
                              })()}
                              {/* Mensagem de aguardando só para online sem assinatura */}
                              {p.isOnline && !p.assinaturaFinal && !loadingOnline && (
                                <p style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, margin: '4px 0 0' }}>
                                  ⏳ Aguardando assinatura via link
                                </p>
                              )}
                            </div>

                            <div style={{ flexShrink: 0 }}>
                              {p.assinaturaFinal ? (
                                <img src={p.assinaturaFinal} alt="assinatura"
                                  style={{ height: 40, maxWidth: 100, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0' }} />
                              ) : p.isOnline && loadingOnline ? (
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>⏳</span>
                              ) : !p.isOnline ? (
                                <span style={{ fontSize: 11, color: '#fbbf24', background: '#fffbeb', padding: '2px 8px', borderRadius: 6, border: '1px solid #fcd34d' }}>
                                  pendente
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {apenasOnline.map((a, i) => (
                      <div key={`extra-${i}`} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
                                {participantesEnriquecidos.length + i + 1}. {a.nome}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>🔗 online</span>
                            </div>
                            {a.matricula && <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>Mat: {a.matricula}</p>}
                            {a.endereco_assinatura && (
                              <p style={{ fontSize: 11, color: '#1d4ed8', margin: '4px 0 2px', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                <span style={{ flexShrink: 0 }}>📍</span>
                                <span>{a.endereco_assinatura}</span>
                              </p>
                            )}
                            {a.latitude && a.longitude && (
                              <p style={{ fontSize: 10, color: '#64748b', margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>
                                🌐 {Number(a.latitude).toFixed(7)}, {Number(a.longitude).toFixed(7)}
                              </p>
                            )}
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
                              {new Date(a.assinado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          </div>
                          {a.assinatura_url && (
                            <img src={a.assinatura_url} alt="assinatura"
                              style={{ height: 40, maxWidth: 100, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0' }} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {Array.isArray(detalhe.fotos_urls) && detalhe.fotos_urls.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📷 Fotos ({detalhe.fotos_urls.length})</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {detalhe.fotos_urls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`Foto ${i+1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={() => imprimirRegistro(detalhe, assinOnline)} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#1e3a5f', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
                    🖨️ Imprimir / Salvar PDF
                  </button>
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

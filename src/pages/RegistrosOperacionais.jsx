import { useState, useEffect, useRef } from 'react'
import { listarRegistros } from '../lib/registros.js'
import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'

function calcMesAtual() {
  const hoje = new Date()
  return {
    ini: new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0],
    fim: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0],
  }
}

const TIPO_MEDIDA_LABEL = {
  FEEDBACK:            'Feedback',
  ADVERTENCIA_VERBAL:  'Advertência Verbal',
  ADVERTENCIA_ESCRITA: 'Advertência Escrita',
  SUSPENSAO:           'Suspensão',
}

// ── Impressão PDF de múltiplos registros ──────────────────────────────────────
function imprimirLote(registros) {
  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const blocos = registros.map(r => {
    const tc = TIPOS_REGISTRO[r.tipo] || {}
    const mc = MODALIDADES[r.modalidade] || {}
    const parts = Array.isArray(r.participantes) ? r.participantes : []
    const fotos = Array.isArray(r.fotos_urls) ? r.fotos_urls : []

    return `
      <div style="page-break-inside:avoid;margin-bottom:32px;border:1.5px solid #e2e8f0;border-radius:14px;overflow:hidden;">
        <!-- Cabeçalho do registro -->
        <div style="background:${tc.bg || '#f8fafc'};border-bottom:1px solid ${tc.border || '#e2e8f0'};padding:14px 16px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-size:18px;">${tc.emoji || ''}</span>
            <strong style="font-size:15px;color:${tc.color || '#1e293b'};margin-left:8px;">${tc.label || r.tipo}</strong>
            <span style="font-size:12px;color:#64748b;margin-left:10px;">${mc.label || r.modalidade}</span>
            ${r.tipo_medida ? `<span style="font-size:11px;background:${tc.color};color:#fff;padding:2px 8px;border-radius:6px;margin-left:8px;font-weight:700;">${TIPO_MEDIDA_LABEL[r.tipo_medida] || r.tipo_medida}</span>` : ''}
          </div>
          <div style="font-size:12px;color:#64748b;text-align:right;">
            ${formatData(r.data_registro)} às ${r.hora_registro || '—'}
          </div>
        </div>

        <!-- Dados -->
        <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr>
              <td style="color:#94a3b8;padding:3px 0;width:120px;">Fiscal</td>
              <td style="color:#1e293b;font-weight:600;">${r.fiscal || '—'}</td>
              <td style="color:#94a3b8;padding:3px 0 3px 16px;width:120px;">Local</td>
              <td style="color:#1e293b;">${r.endereco || '—'}</td>
            </tr>
            ${r.tema ? `<tr><td style="color:#94a3b8;padding:3px 0;">Tema</td><td style="color:#1e293b;font-weight:600;">${r.tema}</td><td style="color:#94a3b8;padding:3px 0 3px 16px;">Carga Horária</td><td style="color:#1e293b;">${r.carga_horaria || '—'}</td></tr>` : ''}
          </table>
        </div>

        <!-- Pauta -->
        ${r.pauta ? `
        <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;background:#fffbeb;">
          <p style="font-size:11px;font-weight:700;color:#92400e;margin:0 0 4px 0;">${r.tipo === 'DISCIPLINAR' ? 'DESCRIÇÃO DA OCORRÊNCIA:' : 'PAUTA / CONTEÚDO:'}</p>
          <p style="font-size:13px;color:#78350f;line-height:1.6;margin:0;">${r.pauta}</p>
        </div>` : ''}

        <!-- Lista de frequência -->
        ${parts.length > 0 ? `
        <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
          <p style="font-size:11px;font-weight:700;color:#374151;margin:0 0 8px 0;">LISTA DE FREQUÊNCIA (${parts.length})</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr style="background:#1e3a5f;">
              <th style="padding:6px 8px;color:#fff;font-size:11px;text-align:left;width:30px;">Nº</th>
              <th style="padding:6px 8px;color:#fff;font-size:11px;text-align:left;">Nome</th>
              <th style="padding:6px 8px;color:#fff;font-size:11px;width:100px;">Matrícula</th>
              <th style="padding:6px 8px;color:#fff;font-size:11px;width:140px;">Assinatura</th>
            </tr>
            ${parts.map((p, i) => `
              <tr style="border-bottom:1px solid #f1f5f9;${i % 2 === 1 ? 'background:#f8fafc;' : ''}">
                <td style="padding:6px 8px;font-size:12px;">${i+1}</td>
                <td style="padding:6px 8px;font-size:12px;font-weight:600;">${p.nome}</td>
                <td style="padding:6px 8px;font-size:12px;text-align:center;">${p.matricula || '—'}</td>
                <td style="padding:4px 8px;">
                  ${p.assinatura_url
                    ? `<img src="${p.assinatura_url}" crossorigin="anonymous" style="height:36px;max-width:130px;object-fit:contain;display:block;"/>`
                    : '<span style="font-size:11px;color:#94a3b8;">Sem assinatura</span>'
                  }
                </td>
              </tr>`).join('')}
          </table>
        </div>` : ''}

        <!-- Fotos -->
        ${fotos.length > 0 ? `
        <div style="padding:12px 16px;">
          <p style="font-size:11px;font-weight:700;color:#374151;margin:0 0 8px 0;">FOTOS (${fotos.length})</p>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
            ${fotos.map((url, i) => `
              <img src="${url}" crossorigin="anonymous"
                style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;display:block;"/>
            `).join('')}
          </div>
        </div>` : ''}
      </div>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Registros Operacionais — DPL Construções</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#fff; padding:24px; color:#1e293b; }
    @media print {
      body { padding:0; }
      .no-print { display:none !important; }
      @page { margin:12mm; }
    }
  </style>
</head>
<body>
  <!-- Capa -->
  <div style="background:linear-gradient(135deg,#1e3a5f,#1d4ed8);color:#fff;padding:20px 24px;border-radius:14px;margin-bottom:24px;">
    <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">DPL Construções — Equatorial Energia</div>
    <div style="font-size:22px;font-weight:800;margin-bottom:2px;">📝 Registros Operacionais</div>
    <div style="font-size:13px;opacity:0.8;">${registros.length} registro(s) · Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</div>
  </div>

  ${blocos}

  <div style="border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;margin-top:24px;">
    <p style="font-size:11px;color:#94a3b8;">DPL Construções — Contrato Equatorial Energia 1021/2024</p>
    <p style="font-size:10px;color:#cbd5e1;margin-top:2px;">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
  </div>

  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button onclick="window.print()" style="padding:12px 32px;background:#1e3a5f;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">
      🖨️ Imprimir / Salvar PDF
    </button>
  </div>
</body>
</html>`

  const janela = window.open('', '_blank', 'width=900,height=900')
  if (!janela) { alert('Permita pop-ups para imprimir.'); return }
  janela.document.write(html)
  janela.document.close()

  // Aguarda imagens carregarem antes de imprimir
  janela.onload = () => {
    const imgs = janela.document.querySelectorAll('img[crossorigin]')
    if (imgs.length === 0) { setTimeout(() => janela.print(), 400); return }
    let carregadas = 0
    imgs.forEach(img => {
      const done = () => { carregadas++; if (carregadas === imgs.length) setTimeout(() => janela.print(), 400) }
      if (img.complete) done()
      else { img.onload = done; img.onerror = done }
    })
  }
}

// ── Imprime um único registro ─────────────────────────────────────────────────
function imprimirRegistro(r) { imprimirLote([r]) }

export default function RegistrosOperacionais({ usuarioLogado, onVoltar, onNovo }) {
  const [todos,     setTodos]     = useState([])   // todos os registros buscados
  const [exibidos,  setExibidos]  = useState([])   // após filtro local de participante
  const [loading,   setLoading]   = useState(true)
  const [detalhe,   setDetalhe]   = useState(null)
  const [filtros,   setFiltros]   = useState({
    dataIni: calcMesAtual().ini,
    dataFim: calcMesAtual().fim,
    tipo:    '',
  })
  // Filtro por participante (client-side)
  const [nomePartic,  setNomePartic]  = useState('')
  const [sugestoes,   setSugestoes]   = useState([])
  const [dropAberto,  setDropAberto]  = useState(false)
  const dropRef = useRef(null)

  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
  const isAdmin = ['ADMIN', 'SUPERV. OPERAÇÃO', 'SUPERV. CAMPO'].includes(usuarioLogado?.perfil)

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const fn = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const buscar = async () => {
    setLoading(true)
    try {
      const data = await listarRegistros(filtros, usuarioLogado)
      setTodos(data)
      aplicarFiltroParticipante(data, nomePartic)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { buscar() }, [])

  // Filtro local por nome do participante
  const aplicarFiltroParticipante = (lista, termo) => {
    if (!termo.trim()) { setExibidos(lista); return }
    const t = termo.trim().toLowerCase()
    setExibidos(lista.filter(r =>
      Array.isArray(r.participantes) &&
      r.participantes.some(p => p.nome?.toLowerCase().includes(t))
    ))
  }

  // Autocomplete de nomes de participantes a partir dos registros carregados
  const onDigitarParticipante = (v) => {
    setNomePartic(v)
    aplicarFiltroParticipante(todos, v)

    if (v.length >= 2) {
      const vistos = new Set()
      const sugs = []
      todos.forEach(r => {
        if (!Array.isArray(r.participantes)) return
        r.participantes.forEach(p => {
          if (p.nome?.toLowerCase().includes(v.toLowerCase()) && !vistos.has(p.nome)) {
            vistos.add(p.nome)
            sugs.push(p.nome)
          }
        })
      })
      setSugestoes(sugs.slice(0, 10))
      setDropAberto(sugs.length > 0)
    } else {
      setSugestoes([])
      setDropAberto(false)
    }
  }

  const selecionarParticipante = (nome) => {
    setNomePartic(nome)
    aplicarFiltroParticipante(todos, nome)
    setSugestoes([])
    setDropAberto(false)
  }

  const limparFiltroParticipante = () => {
    setNomePartic('')
    setExibidos(todos)
    setSugestoes([])
    setDropAberto(false)
  }

  const upd = (k, v) => setFiltros(f => ({ ...f, [k]: v }))

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e3a5f)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📝 Registros Operacionais</h1>
              <p style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
                {isAdmin ? 'Todos os registros' : `Seus registros — ${usuarioLogado?.nome}`}
              </p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{exibidos.length}</div>
              <div style={{ fontSize: 9, opacity: 0.85 }}>
                {nomePartic ? 'filtrados' : 'Total'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 80px' }}>

        {/* Botão novo */}
        <button onClick={onNovo} style={{
          width: '100%', padding: 14, borderRadius: 12, border: 'none',
          background: '#2563eb', color: '#fff', fontSize: 15, fontWeight: 700,
          cursor: 'pointer', marginBottom: 16,
        }}>
          + Novo Registro Operacional
        </button>

        {/* ── Filtros ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 12 }}>Filtros</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Data início</label>
              <input type="date" value={filtros.dataIni} onChange={e => upd('dataIni', e.target.value)}
                className="form-input" style={{ fontSize: 13, padding: '8px 10px' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Data fim</label>
              <input type="date" value={filtros.dataFim} onChange={e => upd('dataFim', e.target.value)}
                className="form-input" style={{ fontSize: 13, padding: '8px 10px' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Tipo</label>
              <select value={filtros.tipo} onChange={e => upd('tipo', e.target.value)}
                className="form-input" style={{ fontSize: 13, padding: '8px 10px' }}>
                <option value="">Todos</option>
                {Object.entries(TIPOS_REGISTRO).map(([k, t]) => (
                  <option key={k} value={k}>{t.emoji} {t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Filtro por nome do participante — com autocomplete */}
          <div ref={dropRef} style={{ position: 'relative', marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Nome do Participante / Empregado
            </label>
            <div style={{ position: 'relative' }}>
              <input
                value={nomePartic}
                onChange={e => onDigitarParticipante(e.target.value)}
                onFocus={() => sugestoes.length > 0 && setDropAberto(true)}
                placeholder="Digite para filtrar por participante..."
                className="form-input"
                style={{ fontSize: 13, padding: '8px 10px', paddingRight: nomePartic ? 36 : 10 }}
              />
              {nomePartic && (
                <button onClick={limparFiltroParticipante} style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: '#94a3b8',
                  fontSize: 16, cursor: 'pointer', lineHeight: 1,
                }}>✕</button>
              )}
            </div>

            {/* Dropdown de sugestões */}
            {dropAberto && sugestoes.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto',
              }}>
                {sugestoes.map((s, i) => (
                  <button key={i}
                    onMouseDown={() => selecionarParticipante(s)}
                    style={{
                      display: 'block', width: '100%', padding: '10px 14px',
                      textAlign: 'left', background: 'none', border: 'none',
                      borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none',
                      fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    👤 {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info filtro ativo */}
          {nomePartic && (
            <div style={{
              background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#1d4ed8',
            }}>
              🔍 Mostrando registros de: <strong>{nomePartic}</strong>
              {' '}· {exibidos.length} resultado(s)
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={buscar} style={{
              padding: '10px 24px', background: '#1e3a5f', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>🔍 Buscar</button>

            {/* Botão imprimir lote */}
            {exibidos.length > 0 && (
              <button onClick={() => imprimirLote(exibidos)} style={{
                padding: '10px 20px', background: '#7c3aed', color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                🖨️ Imprimir {exibidos.length} registro(s)
                {nomePartic && ` de ${nomePartic}`}
              </button>
            )}
          </div>
        </div>

        {/* ── Lista de registros ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p>Carregando registros...</p>
          </div>
        ) : exibidos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
            <p>Nenhum registro encontrado.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {exibidos.map(r => {
              const tc = TIPOS_REGISTRO[r.tipo] || {}
              const mc = MODALIDADES[r.modalidade] || {}
              return (
                <div key={r.id} style={{
                  background: '#fff', borderRadius: 14,
                  border: `1.5px solid ${tc.border || '#e2e8f0'}`,
                  padding: '14px 16px', cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                }}
                  onClick={() => setDetalhe(r)}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 18 }}>{tc.emoji}</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: tc.color || '#1e293b' }}>{tc.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: tc.bg, color: tc.color }}>
                          {mc.emoji} {mc.label}
                        </span>
                        {r.tipo === 'DISCIPLINAR' && r.tipo_medida && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fee2e2', color: '#dc2626' }}>
                            {TIPO_MEDIDA_LABEL[r.tipo_medida]}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.8, flexWrap: 'wrap' }}>
                        <span>👤 {r.fiscal}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>📅 {formatData(r.data_registro)} às {r.hora_registro}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>👥 {Array.isArray(r.participantes) ? r.participantes.length : 0} participante(s)</span>
                      </div>

                      {/* Destaque de participante filtrado */}
                      {nomePartic && Array.isArray(r.participantes) && (
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {r.participantes
                            .filter(p => p.nome?.toLowerCase().includes(nomePartic.toLowerCase()))
                            .map((p, i) => (
                              <span key={i} style={{
                                fontSize: 11, background: '#fef3c7', color: '#92400e',
                                padding: '2px 8px', borderRadius: 6, fontWeight: 600,
                              }}>
                                🔍 {p.nome}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 18, color: '#94a3b8', marginLeft: 8 }}>›</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modal detalhe ── */}
      {detalhe && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
        }} onClick={e => { if (e.target === e.currentTarget) setDetalhe(null) }}>
          <div style={{
            background: '#fff', borderRadius: '20px 20px 0 0',
            width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto',
            padding: '24px 20px 40px',
          }}>
            {(() => {
              const tc = TIPOS_REGISTRO[detalhe.tipo] || {}
              const mc = MODALIDADES[detalhe.modalidade] || {}
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 800 }}>{tc.emoji} {tc.label}</h3>
                    <button onClick={() => setDetalhe(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
                  </div>

                  {/* Card tipo */}
                  <div style={{ background: tc.bg, border: `2px solid ${tc.border}`, borderRadius: 14, padding: 16, textAlign: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 40, marginBottom: 6 }}>{tc.emoji}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: tc.color }}>{tc.label}</div>
                    <div style={{ fontSize: 13, color: tc.color, opacity: 0.85, marginTop: 4 }}>
                      {mc.emoji} {mc.label} · {Array.isArray(detalhe.participantes) ? detalhe.participantes.length : 0} participante(s)
                    </div>
                    {detalhe.tipo === 'DISCIPLINAR' && detalhe.tipo_medida && (
                      <div style={{ marginTop: 8, background: tc.color, color: '#fff', padding: '3px 12px', borderRadius: 8, display: 'inline-block', fontSize: 12, fontWeight: 700 }}>
                        {TIPO_MEDIDA_LABEL[detalhe.tipo_medida]}
                      </div>
                    )}
                  </div>

                  {/* Dados */}
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

                  {/* Pauta */}
                  {detalhe.pauta && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                        {detalhe.tipo === 'DISCIPLINAR' ? 'DESCRIÇÃO DA OCORRÊNCIA:' : 'PAUTA / CONTEÚDO:'}
                      </p>
                      <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>{detalhe.pauta}</p>
                    </div>
                  )}

                  {/* Participantes */}
                  {Array.isArray(detalhe.participantes) && detalhe.participantes.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                        ✅ Lista de Frequência ({detalhe.participantes.length})
                      </p>
                      {detalhe.participantes.map((p, i) => (
                        <div key={i} style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>{i+1}. {p.nome}</p>
                              {p.matricula && <p style={{ fontSize: 12, color: '#64748b' }}>Mat: {p.matricula}</p>}
                            </div>
                            {p.assinatura_url && (
                              <img src={p.assinatura_url} alt="assinatura" style={{
                                height: 40, maxWidth: 100, objectFit: 'contain',
                                borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0',
                              }} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Fotos */}
                  {Array.isArray(detalhe.fotos_urls) && detalhe.fotos_urls.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                        📷 Fotos ({detalhe.fotos_urls.length})
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                        {detalhe.fotos_urls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`Foto ${i+1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Botões */}
                  <button onClick={() => imprimirRegistro(detalhe)} style={{
                    width: '100%', padding: 13, borderRadius: 10, border: 'none',
                    background: '#1e3a5f', color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', marginBottom: 10,
                  }}>🖨️ Imprimir este registro (PDF)</button>

                  <button onClick={() => setDetalhe(null)} style={{
                    width: '100%', padding: 13, borderRadius: 10,
                    border: '1px solid #e2e8f0', background: '#f8fafc',
                    color: '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}>Fechar</button>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

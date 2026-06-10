import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { reabrirAuditoria } from '../lib/supabase.js'
import { CHECKLISTS, getItemsNaoConformes } from '../data/checklists.js'
import { getVersaoApp } from '../lib/auth.js'
import * as XLSX from 'xlsx'

const STATUS_COR = {
  'ATENDE':         { bg: '#dcfce7', color: '#15803d' },
  'ATENDE PARCIAL': { bg: '#fef3c7', color: '#92400e' },
  'NÃO ATENDE':     { bg: '#fee2e2', color: '#dc2626' },
}

// Estilo padrão de todos os campos do filtro — mesma altura, mesmo border, mesmo padding.
// Garante alinhamento perfeito entre inputs nativos (date, text, select) e MultiSelect.
const FIELD_HEIGHT = 38
const INPUT_STYLE = {
  height: FIELD_HEIGHT,
  fontSize: 13,
  padding: '0 10px',
  border: '1.5px solid #e2e8f0',
  borderRadius: 8,
  background: '#fff',
  color: '#1e293b',
  boxSizing: 'border-box',
  width: '100%',
  outline: 'none',
}
const LABEL_STYLE = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }

// Tipos de serviço puxados DINAMICAMENTE de CHECKLISTS.
// Qualquer novo tipo (EMERGENCIAL, etc.) aparece automaticamente nos filtros.
const getTipoEmoji = (tipo) => CHECKLISTS[tipo]?.emoji || '📋'
const getTipoLabel = (tipo) => CHECKLISTS[tipo]?.label || tipo

function calcMesAtual() {
  const hoje = new Date()
  const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0]
  const fim  = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]
  return { ini, fim }
}

// Calcula itens não conformes a partir dos dados salvos no banco
function calcNcItems(auditoria) {
  if (!auditoria?.respostas || !auditoria?.tipo_servico) return []
  return getItemsNaoConformes({
    tipoServico: auditoria.tipo_servico,
    produtivo:   auditoria.produtivo,
    respostas:   auditoria.respostas || {},
  })
}

// ─── MultiSelect — dropdown com checkboxes ──────────────────────────────────
// Usado pelos filtros que aceitam múltiplas escolhas:
// Tipo de Serviço, Supervisor de Campo, Supervisor Operacional.
function MultiSelect({ label, options, value, onChange, placeholder, formatOption }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Quando as opções mudam (ex: cascata sup_op → sup_campo),
  // remove valores que não estão mais disponíveis.
  useEffect(() => {
    const validos = value.filter(v => options.includes(v))
    if (validos.length !== value.length) onChange(validos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options])

  const toggle = (opt) => {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt))
    else onChange([...value, opt])
  }

  const limpar = (e) => { e.stopPropagation(); onChange([]) }

  const filtered = busca
    ? options.filter(o => o.toLowerCase().includes(busca.toLowerCase()))
    : options

  const display = formatOption || ((o) => o)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={LABEL_STYLE}>{label}</label>
      <div onClick={() => setAberto(!aberto)} style={{
        ...INPUT_STYLE,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        overflow: 'hidden',
      }}>
        <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {value.length === 0 ? (
            <span style={{ color: '#94a3b8' }}>{placeholder || 'Todos'}</span>
          ) : value.length <= 2 ? (
            <span style={{ color: '#1e293b' }}>{value.map(display).join(', ')}</span>
          ) : (
            <span style={{ color: '#1e293b' }}>{value.length} selecionados</span>
          )}
        </div>
        {value.length > 0 && (
          <button onClick={limpar} title="Limpar" style={{
            background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
            fontSize: 16, padding: 0, flexShrink: 0, lineHeight: 1,
          }}>×</button>
        )}
        <span style={{ color: '#94a3b8', fontSize: 11, flexShrink: 0 }}>{aberto ? '▲' : '▼'}</span>
      </div>

      {aberto && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 4,
          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 320, display: 'flex', flexDirection: 'column',
        }}>
          {options.length > 6 && (
            <div style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
              <input
                type="text" value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar..."
                autoFocus
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }}
              />
            </div>
          )}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                {options.length === 0 ? 'Nenhuma opção disponível' : 'Nenhum resultado'}
              </div>
            ) : filtered.map((o, i) => {
              const sel = value.includes(o)
              return (
                <label key={o} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
                  fontSize: 13, cursor: 'pointer',
                  background: sel ? '#eff6ff' : '#fff',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = sel ? '#dbeafe' : '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = sel ? '#eff6ff' : '#fff'}
                >
                  <input type="checkbox" checked={sel} onChange={() => toggle(o)} style={{ accentColor: '#1e3a5f' }} />
                  <span style={{ color: '#1e293b' }}>{display(o)}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// DropdownInput — autocomplete simples (usado pelo filtro de Prefixo)
function DropdownInput({ label, value, onChange, onSelect, suggestions, placeholder }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={LABEL_STYLE}>{label}</label>
      <input
        type="text" value={value}
        onChange={e => { onChange(e.target.value); setAberto(true) }}
        onFocus={() => suggestions.length > 0 && setAberto(true)}
        placeholder={placeholder}
        style={INPUT_STYLE}
      />
      {aberto && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => { onSelect(s); setAberto(false) }} style={{
              display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left',
              background: 'none', border: 'none',
              borderBottom: i < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none',
              fontSize: 13, color: '#1e293b', cursor: 'pointer',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── função de impressão ─────────────────────────────────────────────────────
function imprimirAuditoria(a, formatData, versaoApp = '') {
  const sc      = STATUS_COR[a.status] || { bg: '#f1f5f9', color: '#374151' }
  const ncItems = calcNcItems(a)

  const infoRow = (label, value) => value ? `
    <tr>
      <td style="padding:7px 10px;color:#64748b;font-size:13px;font-weight:600;white-space:nowrap;border-bottom:1px solid #f1f5f9;">${label}</td>
      <td style="padding:7px 10px;color:#1e293b;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9;">${value}</td>
    </tr>` : ''

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Auditoria ${a.prefixo} — OS ${a.os}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f4f8; padding: 24px; color: #1e293b; }
    @media print {
      body { background: #fff; padding: 0; }
      .no-print { display: none !important; }
      @page { margin: 15mm; }
    }
  </style>
</head>
<body>

  <div style="background:linear-gradient(135deg,#1e3a5f,#1d4ed8);color:#fff;padding:20px 24px;border-radius:14px;margin-bottom:16px;">
    <div style="font-size:11px;opacity:0.7;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px;">DPL Construções — Equatorial Energia</div>
    <div style="font-size:20px;font-weight:800;margin-bottom:2px;">📁 Auditoria Operacional de Campo</div>
    <div style="font-size:13px;opacity:0.8;">Contrato 1021/2024</div>
  </div>

  <div style="background:${sc.bg};border:2px solid ${sc.color}33;border-radius:14px;padding:20px;text-align:center;margin-bottom:16px;">
    <div style="font-size:52px;font-weight:900;color:${sc.color};line-height:1;">${Number(a.nota).toFixed(0)}</div>
    <div style="font-size:13px;color:${sc.color};font-weight:500;margin-bottom:4px;">pontos</div>
    <div style="font-size:22px;font-weight:800;color:${sc.color};">${a.status}</div>
    <div style="font-size:12px;color:${sc.color};opacity:0.85;margin-top:6px;">
      ${a.tipo_auditoria === 'DESEMPENHO' ? '📊 Desempenho Operacional' : '✅ Pós Serviço'} —
      ${a.tipo_servico} — ${a.produtivo ? 'Produtivo' : 'Improdutivo'}
    </div>
  </div>

  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:4px 0;margin-bottom:16px;overflow:hidden;">
    <div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">Dados da Auditoria</span>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${infoRow('Tipo Auditoria', a.tipo_auditoria === 'DESEMPENHO' ? '📊 Desempenho Operacional' : '✅ Pós Serviço')}
      ${infoRow('Fiscal',         a.fiscal)}
      ${infoRow('Matrícula',      a.matricula)}
      ${infoRow('Equipe',         a.prefixo)}
      ${infoRow('OS',             a.os)}
      ${infoRow('UC',             a.uc)}
      ${infoRow('Endereço',       a.endereco)}
      ${infoRow('Data / Hora',    `${formatData(a.data_auditoria)} às ${a.hora_auditoria}`)}
      ${a.lat ? infoRow('GPS', `${a.lat}, ${a.lng}`) : ''}
      ${infoRow('Eletricista 1',  a.nome_eletricista)}
      ${infoRow('Eletricista 2',  a.nome_eletricista2)}
    </table>
  </div>

  <!-- Não Conformidades -->
  ${ncItems.length > 0 ? `
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:16px;margin-bottom:16px;">
    <p style="font-size:12px;font-weight:700;color:#b91c1c;margin:0 0 10px 0;">❌ Itens Não Conformes (${ncItems.length})</p>
    ${ncItems.map((item, i) => `
      <div style="font-size:12px;color:#991b1b;padding:6px 0;${i < ncItems.length - 1 ? 'border-bottom:1px solid #fecaca;' : ''}line-height:1.5;">
        <strong>${i + 1}.</strong> ${item.p}
      </div>`).join('')}
  </div>` : ''}

  ${(a.feedback || a.observacoes) ? `
  <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:14px;padding:16px;margin-bottom:16px;">
    ${a.feedback ? `<p style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:4px;">FEEDBACK DO FISCAL:</p><p style="font-size:13px;color:#78350f;line-height:1.6;margin-bottom:${a.observacoes ? '12px' : '0'};">${a.feedback}</p>` : ''}
    ${a.observacoes ? `<p style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:4px;">OBSERVAÇÕES:</p><p style="font-size:13px;color:#78350f;line-height:1.6;margin:0;">${a.observacoes}</p>` : ''}
  </div>` : ''}

  ${a.fotos_urls?.length > 0 ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <p style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px;">📷 Registro Fotográfico (${a.fotos_urls.length})</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
      ${a.fotos_urls.map((url, i) => `<img src="${url}" alt="Foto ${i+1}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid #e2e8f0;display:block;" crossorigin="anonymous"/>`).join('')}
    </div>
  </div>` : ''}

  ${a.assinatura_url ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <p style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;">✍️ Assinatura — ${a.nome_eletricista || 'Eletricista 1'}</p>
    <img src="${a.assinatura_url}" alt="Assinatura 1" style="width:100%;border-radius:8px;border:1px solid #f1f5f9;background:#fafafa;display:block;" crossorigin="anonymous"/>
    <p style="font-size:10px;color:#94a3b8;text-align:center;margin-top:8px;">Registrado em ${formatData(a.data_auditoria)} às ${a.hora_auditoria}</p>
  </div>` : ''}

  ${a.assinatura2_url ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <p style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;">✍️ Assinatura — ${a.nome_eletricista2 || 'Eletricista 2'}</p>
    <img src="${a.assinatura2_url}" alt="Assinatura 2" style="width:100%;border-radius:8px;border:1px solid #f1f5f9;background:#fafafa;display:block;" crossorigin="anonymous"/>
    <p style="font-size:10px;color:#94a3b8;text-align:center;margin-top:8px;">Registrado em ${formatData(a.data_auditoria)} às ${a.hora_auditoria}</p>
  </div>` : ''}

  <div style="border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;margin-top:8px;">
    <p style="font-size:11px;color:#94a3b8;">DPL Construções — Contrato Equatorial Energia 1021/2024</p>
    <p style="font-size:10px;color:#cbd5e1;margin-top:2px;">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })} · <span style="color:#dc2626;">v${versaoApp}</span></p>
  </div>

  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button onclick="window.print()" style="padding:12px 32px;background:#1e3a5f;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">
      🖨️ Imprimir / Salvar PDF
    </button>
  </div>

</body>
</html>`

  const janela = window.open('', '_blank', 'width=700,height=900')
  if (!janela) { alert('Permita pop-ups para imprimir.'); return }
  janela.document.write(html)
  janela.document.close()
  janela.onload = () => { setTimeout(() => janela.print(), 600) }
}

export default function HistoricoAuditorias({ usuarioLogado, onVoltar }) {
  const [auditorias,   setAuditorias]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [exportando,   setExportando]   = useState(false)
  const [detalhe,      setDetalhe]      = useState(null)
  const [filtros,      setFiltros]      = useState({
    dataIni:      calcMesAtual().ini,
    dataFim:      calcMesAtual().fim,
    prefixo:      '',
    tipoServico:  [],   // multi-select (era string, agora array)
    status:       '',
    supCampo:     [],   // multi-select — NOVO (substitui o antigo "Fiscal")
    supOperacao:  [],   // multi-select — NOVO
  })
  const [totais,      setTotais]      = useState({ total: 0, atende: 0, parcial: 0, naoAtende: 0 })
  const [prefixoSugs, setPrefixoSugs] = useState([])

  // ─── Opções dos novos filtros (carregadas 1x na inicialização) ───
  const [supCampoOpcoes,    setSupCampoOpcoes]    = useState([])
  const [supOperacaoOpcoes, setSupOperacaoOpcoes] = useState([])
  // Relação: superv_operacao → Set(superv_campo) — pra cascata
  const [relSupOpToCampo,   setRelSupOpToCampo]   = useState({})
  // Mapa: prefixo → { supCampo, supOperacao } — pra enriquecer exportação Excel
  const [mapaPrefixoSup,    setMapaPrefixoSup]    = useState({})

  const [modalReabrir,      setModalReabrir]      = useState(false)
  const [fiscais,           setFiscais]           = useState([])
  const [fiscalSelecionado, setFiscalSelecionado] = useState('')
  const [reabrindo,         setReabrindo]         = useState(false)
  const [reabrirErro,       setReabrirErro]       = useState('')
  const [reabrirSucesso,    setReabrirSucesso]    = useState(false)

  const [versaoSistema, setVersaoSistema] = useState(getVersaoApp())
  const [capturando,    setCapturando]    = useState(false)
  const intervalRef = useRef(null)
  const isAdmin = usuarioLogado?.perfil === 'ADMIN'

  // ─── Cascata: opções de Sup. Campo filtradas pelos Sup. Operacionais selecionados ───
  const supCampoOpcoesFiltradas = useMemo(() => {
    if (filtros.supOperacao.length === 0) return supCampoOpcoes
    const set = new Set()
    filtros.supOperacao.forEach(supOp => {
      const filhos = relSupOpToCampo[supOp]
      if (filhos) filhos.forEach(s => set.add(s))
    })
    return [...set].sort()
  }, [filtros.supOperacao, supCampoOpcoes, relSupOpToCampo])

  // ─── Carregar opções dos supervisores na inicialização ───
  const carregarOpcoesSupervisores = async () => {
    try {
      // Pagina caso a tabela cresça muito (Supabase limita a 1000 por padrão)
      const todos = []
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('estrutura_equipes')
          .select('prefixo, superv_campo, superv_operacao')
          .range(from, from + PAGE - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        todos.push(...data)
        if (data.length < PAGE) break
        from += PAGE
      }

      const supCampoSet = new Set()
      const supOpSet    = new Set()
      const rel         = {}
      const mapaPref    = {}

      todos.forEach(r => {
        const sc = (r.superv_campo    || '').trim()
        const so = (r.superv_operacao || '').trim()
        const pf = (r.prefixo         || '').trim()
        if (sc) supCampoSet.add(sc)
        if (so) supOpSet.add(so)
        if (so && sc) {
          if (!rel[so]) rel[so] = new Set()
          rel[so].add(sc)
        }
        if (pf && !mapaPref[pf]) {
          mapaPref[pf] = { supCampo: sc, supOperacao: so }
        }
      })

      setSupCampoOpcoes([...supCampoSet].sort())
      setSupOperacaoOpcoes([...supOpSet].sort())
      setRelSupOpToCampo(rel)
      setMapaPrefixoSup(mapaPref)
    } catch (e) {
      console.error('Erro ao carregar supervisores:', e)
    }
  }

  const buscar = async () => {
    setLoading(true)
    try {
      // ─── 1) Se houver filtro por supervisor, descobre primeiro quais prefixos satisfazem ───
      let prefixosPermitidos = null
      if (filtros.supCampo.length > 0 || filtros.supOperacao.length > 0) {
        let qEstr = supabase.from('estrutura_equipes').select('prefixo')
        if (filtros.supCampo.length > 0)    qEstr = qEstr.in('superv_campo',    filtros.supCampo)
        if (filtros.supOperacao.length > 0) qEstr = qEstr.in('superv_operacao', filtros.supOperacao)
        const { data: estrData, error: errEstr } = await qEstr
        if (errEstr) throw errEstr
        prefixosPermitidos = [...new Set((estrData || []).map(r => r.prefixo).filter(Boolean))]
        // Se nenhum prefixo bate, já encerra
        if (prefixosPermitidos.length === 0) {
          setAuditorias([])
          setTotais({ total: 0, atende: 0, parcial: 0, naoAtende: 0 })
          setLoading(false)
          return
        }
      }

      // ─── 2) Query principal das auditorias ───
      let q = supabase
        .from('auditorias').select('*')
        .gte('data_auditoria', filtros.dataIni)
        .lte('data_auditoria', filtros.dataFim)
        .order('data_auditoria', { ascending: false })
        .order('hora_auditoria', { ascending: false })

      const podeVerTodos = usuarioLogado?.perfil === 'ADMIN' ||
                           usuarioLogado?.perfil === 'SUPERV. OPERAÇÃO' ||
                           usuarioLogado?.perfil === 'SUPERV. CAMPO'

      if (!podeVerTodos)                  q = q.eq('matricula', usuarioLogado.matricula)
      if (filtros.prefixo)                q = q.ilike('prefixo', `%${filtros.prefixo}%`)
      if (filtros.tipoServico.length > 0) q = q.in('tipo_servico', filtros.tipoServico)
      if (filtros.status)                 q = q.eq('status', filtros.status)
      if (prefixosPermitidos)             q = q.in('prefixo', prefixosPermitidos)

      const { data, error } = await q
      if (error) throw error

      setAuditorias(data || [])
      setTotais({
        total:     data.length,
        atende:    data.filter(a => a.status === 'ATENDE').length,
        parcial:   data.filter(a => a.status === 'ATENDE PARCIAL').length,
        naoAtende: data.filter(a => a.status === 'NÃO ATENDE').length,
      })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    carregarOpcoesSupervisores()
    buscar()
    setVersaoSistema(getVersaoApp())
  }, [])

  useEffect(() => {
    intervalRef.current = setInterval(() => { buscar() }, 20000)
    return () => clearInterval(intervalRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros])

  const upd = (k, v) => setFiltros(f => ({ ...f, [k]: v }))
  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const onPrefixoChange = async v => {
    upd('prefixo', v)
    if (v.length < 2) { setPrefixoSugs([]); return }
    const { data } = await supabase.from('estrutura_equipes').select('prefixo').ilike('prefixo', `%${v}%`).order('prefixo').limit(10)
    if (data) setPrefixoSugs([...new Set(data.map(r => r.prefixo))])
  }

  const abrirModalReabrir = async () => {
    setFiscalSelecionado(detalhe.fiscal || '')
    setReabrirErro('')
    setReabrirSucesso(false)
    const { data } = await supabase.from('usuarios').select('nome, login').eq('status', 'ATIVO').order('nome')
    setFiscais(data || [])
    setModalReabrir(true)
  }

  const confirmarReabrir = async () => {
    if (!fiscalSelecionado) { setReabrirErro('Selecione o fiscal.'); return }
    setReabrindo(true); setReabrirErro('')
    try {
      await reabrirAuditoria(detalhe.id, fiscalSelecionado, usuarioLogado.nome)
      setReabrirSucesso(true)
      setTimeout(() => { setModalReabrir(false); setDetalhe(null); setReabrirSucesso(false); buscar() }, 1800)
    } catch (e) { setReabrirErro(e.message) }
    finally { setReabrindo(false) }
  }

  const exportarExcel = async () => {
    if (auditorias.length === 0) { alert('Nenhuma auditoria para exportar. Faça uma busca primeiro.'); return }
    setExportando(true)
    try {
      const linhas = auditorias.map(a => {
        const sup = mapaPrefixoSup[a.prefixo] || {}
        return {
          'Data':                   formatData(a.data_auditoria),
          'Hora':                   a.hora_auditoria || '',
          'Fiscal (Sup. Campo)':    a.fiscal || '',
          'Matrícula':              a.matricula || '',
          'Equipe (Prefixo)':       a.prefixo || '',
          'Supervisor de Campo':    sup.supCampo || '',
          'Supervisor Operacional': sup.supOperacao || '',
          'OS':                     a.os || '',
          'UC':                     a.uc || '',
          'Tipo Auditoria':         a.tipo_auditoria === 'DESEMPENHO' ? 'Desempenho Operacional' : 'Pós Serviço',
          'Tipo Serviço':           a.tipo_servico || '',
          'Produtivo':              a.produtivo ? 'SIM' : 'NÃO',
          'Nota':                   Number(a.nota).toFixed(1),
          'Resultado':              a.status || '',
          'Endereço':               a.endereco || '',
          'Latitude':               a.lat || '',
          'Longitude':              a.lng || '',
          'Eletricista 1':          a.nome_eletricista || '',
          'Eletricista 2':          a.nome_eletricista2 || '',
          'Feedback Fiscal':        a.feedback || '',
          'Observações':            a.observacoes || '',
          'Qtd Fotos':              Array.isArray(a.fotos_urls) ? a.fotos_urls.length : 0,
        }
      })

      const ws = XLSX.utils.json_to_sheet(linhas)
      ws['!cols'] = [
        { wch: 12 }, { wch: 8  }, { wch: 30 }, { wch: 12 }, { wch: 16 },
        { wch: 22 }, { wch: 22 }, // Sup Campo + Sup Op
        { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 12 },
        { wch: 8  }, { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 12 },
        { wch: 30 }, { wch: 30 }, { wch: 40 }, { wch: 40 }, { wch: 10 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Auditorias')

      const resumo = [
        ['RELATÓRIO DE AUDITORIAS — DPL CONSTRUÇÕES'],
        ['Contrato Equatorial Energia 1021/2024'],
        [''],
        ['Período', `${formatData(filtros.dataIni)} a ${formatData(filtros.dataFim)}`],
        ['Gerado em', new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })],
        [''],
        ['FILTROS APLICADOS', ''],
        ['Prefixo',                filtros.prefixo || '(todos)'],
        ['Tipo de Serviço',        filtros.tipoServico.length > 0 ? filtros.tipoServico.join(', ') : '(todos)'],
        ['Supervisor de Campo',    filtros.supCampo.length    > 0 ? filtros.supCampo.join(', ')    : '(todos)'],
        ['Supervisor Operacional', filtros.supOperacao.length > 0 ? filtros.supOperacao.join(', ') : '(todos)'],
        ['Resultado',              filtros.status || '(todos)'],
        [''],
        ['TOTALIZADORES', ''],
        ['Total de Auditorias', totais.total],
        ['Atende (≥ 90)',       totais.atende],
        ['Atende Parcial (80–89)', totais.parcial],
        ['Não Atende (< 80)',   totais.naoAtende],
        [''],
        ['% Conformidade', totais.total > 0 ? `${((totais.atende / totais.total) * 100).toFixed(1)}%` : '0%'],
        ['Nota Média', auditorias.length > 0 ? (auditorias.reduce((acc, a) => acc + Number(a.nota), 0) / auditorias.length).toFixed(1) : '0'],
      ]
      const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
      wsResumo['!cols'] = [{ wch: 28 }, { wch: 40 }]
      XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo')

      XLSX.writeFile(wb, `Auditorias_DPL_${filtros.dataIni}_${filtros.dataFim}.xlsx`)
    } catch (e) {
      console.error('Erro ao exportar:', e)
      alert('Erro ao gerar Excel. Tente novamente.')
    } finally { setExportando(false) }
  }

  // Não conformidades do detalhe atual
  const detalheNcItems = detalhe ? calcNcItems(detalhe) : []

  // Opções pro filtro de Tipo Serviço (dinâmico de CHECKLISTS)
  const tiposServicoOpcoes = Object.keys(CHECKLISTS)

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      <div style={{ background: '#1e3a5f', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📁 Histórico de Auditorias</h1>
              <p style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>{isAdmin ? 'Todas as auditorias' : `Suas auditorias — ${usuarioLogado.nome}`}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'Total',      val: totais.total,     bg: 'rgba(255,255,255,0.15)' },
                { label: 'Atende',     val: totais.atende,    bg: 'rgba(22,163,74,0.4)'    },
                { label: 'Parcial',    val: totais.parcial,   bg: 'rgba(217,119,6,0.4)'    },
                { label: 'Não Atende', val: totais.naoAtende, bg: 'rgba(220,38,38,0.4)'    },
              ].map(t => (
                <div key={t.label} style={{ background: t.bg, borderRadius: 10, padding: '6px 12px', textAlign: 'center', minWidth: 56 }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{t.val}</div>
                  <div style={{ fontSize: 9, opacity: 0.85 }}>{t.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 80px' }}>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Filtros</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            <div>
              <label style={LABEL_STYLE}>Data início</label>
              <input type="date" value={filtros.dataIni} onChange={e => upd('dataIni', e.target.value)} style={INPUT_STYLE} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Data fim</label>
              <input type="date" value={filtros.dataFim} onChange={e => upd('dataFim', e.target.value)} style={INPUT_STYLE} />
            </div>

            {/* ─── NOVO: Supervisor Operacional (multi) ─── */}
            {isAdmin && (
              <MultiSelect
                label="Supervisor Operacional"
                options={supOperacaoOpcoes}
                value={filtros.supOperacao}
                onChange={v => upd('supOperacao', v)}
                placeholder="Todos"
              />
            )}

            {/* ─── NOVO: Supervisor de Campo (multi, com cascata) ─── */}
            {isAdmin && (
              <MultiSelect
                label="Supervisor de Campo"
                options={supCampoOpcoesFiltradas}
                value={filtros.supCampo}
                onChange={v => upd('supCampo', v)}
                placeholder={filtros.supOperacao.length > 0 ? `Subordinados (${supCampoOpcoesFiltradas.length})` : 'Todos'}
              />
            )}

            <DropdownInput label="Prefixo" value={filtros.prefixo} onChange={onPrefixoChange} onSelect={v => { upd('prefixo', v); setPrefixoSugs([]) }} suggestions={prefixoSugs} placeholder="Ex: PI-THE" />

            {/* ─── ATUALIZADO: Tipo Serviço dinâmico e multi ─── */}
            <MultiSelect
              label="Tipo Serviço"
              options={tiposServicoOpcoes}
              value={filtros.tipoServico}
              onChange={v => upd('tipoServico', v)}
              placeholder="Todos"
              formatOption={(t) => `${getTipoEmoji(t)} ${getTipoLabel(t)}`}
            />

            <div>
              <label style={LABEL_STYLE}>Resultado</label>
              <select value={filtros.status} onChange={e => upd('status', e.target.value)} style={INPUT_STYLE}>
                <option value="">Todos</option>
                <option value="ATENDE">Atende</option>
                <option value="ATENDE PARCIAL">Atende Parcial</option>
                <option value="NÃO ATENDE">Não Atende</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={buscar} style={{
              height: FIELD_HEIGHT, padding: '0 22px',
              background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>🔍 Buscar</button>
            <button onClick={exportarExcel} disabled={exportando || auditorias.length === 0} style={{
              height: FIELD_HEIGHT, padding: '0 22px',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
              cursor: auditorias.length === 0 ? 'not-allowed' : 'pointer',
              background: exportando || auditorias.length === 0 ? '#e2e8f0' : '#16a34a',
              color: exportando || auditorias.length === 0 ? '#94a3b8' : '#fff',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {exportando ? '⏳ Gerando...' : `📊 Exportar Excel (${auditorias.length})`}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p>Carregando auditorias...</p>
          </div>
        ) : auditorias.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <p>Nenhuma auditoria encontrada para os filtros selecionados.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {auditorias.map(a => {
              const sc = STATUS_COR[a.status] || { bg: '#f1f5f9', color: '#374151' }
              return (
                <div key={a.id} style={{
                  background: '#fff', borderRadius: 14,
                  border: `1.5px solid ${a.reaberta ? '#f59e0b' : a.status === 'ATENDE' ? '#86efac' : a.status === 'NÃO ATENDE' ? '#fca5a5' : '#fcd34d'}`,
                  padding: '14px 16px', cursor: 'pointer', transition: 'box-shadow 0.15s',
                }}
                  onClick={() => setDetalhe(a)}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 18 }}>{getTipoEmoji(a.tipo_servico)}</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{a.prefixo}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>{a.status}</span>
                        {a.reaberta && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef3c7', color: '#d97706' }}>🔓 Reaberta</span>}
                        <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 20 }}>{a.produtivo ? 'Produtivo' : 'Improdutivo'}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                        <span>👤 {a.fiscal}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>📅 {formatData(a.data_auditoria)} às {a.hora_auditoria}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>OS: <strong>{a.os}</strong></span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>UC: <strong>{a.uc}</strong></span>
                      </div>
                    </div>
                    <div style={{ minWidth: 52, height: 52, borderRadius: 12, background: sc.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: sc.color, lineHeight: 1 }}>{Number(a.nota).toFixed(0)}</span>
                      <span style={{ fontSize: 9, color: sc.color, opacity: 0.8 }}>pts</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── MODAL DETALHE ── */}
      {detalhe && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setDetalhe(null) }}
        >
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', padding: '24px 20px 40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>{getTipoEmoji(detalhe.tipo_servico)} {detalhe.prefixo}</h3>
              <button onClick={() => setDetalhe(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            {detalhe.reaberta && (
              <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e' }}>
                🔓 <strong>Auditoria reaberta</strong> por {detalhe.reaberta_por} — aguardando correção do fiscal <strong>{detalhe.reaberta_para}</strong>
              </div>
            )}

            {(() => {
              const sc = STATUS_COR[detalhe.status] || { bg: '#f1f5f9', color: '#374151' }
              return (
                <div style={{ background: sc.bg, border: `2px solid ${sc.color}22`, borderRadius: 14, padding: '16px', textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 44, fontWeight: 900, color: sc.color, lineHeight: 1 }}>{Number(detalhe.nota).toFixed(0)}</div>
                  <div style={{ fontSize: 11, color: sc.color }}>pontos</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: sc.color, marginTop: 4 }}>{detalhe.status}</div>
                </div>
              )
            })()}

            <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px', marginBottom: 14 }}>
              {[
                ['Tipo Auditoria', detalhe.tipo_auditoria === 'DESEMPENHO' ? '📊 Desempenho Op.' : '✅ Pós Serviço'],
                ['Tipo Serviço',   detalhe.tipo_servico + (detalhe.produtivo ? ' · Produtivo' : ' · Improdutivo')],
                ['Fiscal',         detalhe.fiscal],
                ['Matrícula',      detalhe.matricula],
                ['Equipe',         detalhe.prefixo],
                ['Sup. Campo',     mapaPrefixoSup[detalhe.prefixo]?.supCampo],
                ['Sup. Operacional', mapaPrefixoSup[detalhe.prefixo]?.supOperacao],
                ['OS',             detalhe.os],
                ['UC',             detalhe.uc],
                ['Endereço',       detalhe.endereco],
                ['Data / Hora',    `${formatData(detalhe.data_auditoria)} às ${detalhe.hora_auditoria}`],
                ['GPS',            detalhe.lat ? `${detalhe.lat}, ${detalhe.lng}` : null],
                ['Eletricista 1',  detalhe.nome_eletricista],
                ['Eletricista 2',  detalhe.nome_eletricista2],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <span style={{ color: '#94a3b8', fontWeight: 500 }}>{label}</span>
                  <span style={{ color: '#1e293b', fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{val}</span>
                </div>
              ))}
            </div>

            {/* ── NÃO CONFORMIDADES ── */}
            {detalheNcItems.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginBottom: 10 }}>❌ Itens Não Conformes ({detalheNcItems.length})</p>
                {detalheNcItems.map((item, i) => (
                  <div key={item.id} style={{ fontSize: 12, color: '#991b1b', padding: '5px 0', borderBottom: i < detalheNcItems.length - 1 ? '1px solid #fecaca' : 'none', lineHeight: 1.5 }}>
                    <strong>{i + 1}.</strong> {item.p}
                  </div>
                ))}
              </div>
            )}

            {(detalhe.feedback || detalhe.observacoes) && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                {detalhe.feedback && <>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>FEEDBACK DO FISCAL:</p>
                  <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.5, marginBottom: detalhe.observacoes ? 10 : 0 }}>{detalhe.feedback}</p>
                </>}
                {detalhe.observacoes && <>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>OBSERVAÇÕES:</p>
                  <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.5 }}>{detalhe.observacoes}</p>
                </>}
              </div>
            )}

            {detalhe.fotos_urls?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Fotos ({detalhe.fotos_urls.length})</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {detalhe.fotos_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={`Foto ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {detalhe.assinatura_url && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Assinatura — {detalhe.nome_eletricista || 'Eletricista 1'}</p>
                <img src={detalhe.assinatura_url} alt="Assinatura 1" style={{ width: '100%', borderRadius: 8, background: '#fafafa', border: '1px solid #f1f5f9' }} />
              </div>
            )}
            {detalhe.assinatura2_url && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Assinatura — {detalhe.nome_eletricista2 || 'Eletricista 2'}</p>
                <img src={detalhe.assinatura2_url} alt="Assinatura 2" style={{ width: '100%', borderRadius: 8, background: '#fafafa', border: '1px solid #f1f5f9' }} />
              </div>
            )}

            {isAdmin && !detalhe.reaberta && (
              <button onClick={abrirModalReabrir} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', marginBottom: 10, background: '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>🔓 Reabrir para Correção</button>
            )}

            <p style={{ textAlign: 'center', fontSize: 11, color: '#dc2626', margin: '0 0 10px', fontWeight: 600 }}>
              v{versaoSistema}
            </p>

            <button onClick={() => imprimirAuditoria(detalhe, formatData, versaoSistema)} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', marginBottom: 10, background: '#1e3a5f', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              🖨️ Imprimir / Salvar PDF
            </button>

            {/* Botão compartilhar no WhatsApp — gera imagem */}
            <button onClick={async () => {
              setCapturando(true)
              try {
                const html2canvas = (await import('html2canvas')).default
                const sc2 = STATUS_COR[detalhe.status] || { bg: '#f1f5f9', color: '#374151' }
                const ncItems = calcNcItems(detalhe)

                const infoRow = (label, value) => value ? `
                  <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;">
                    <span style="color:#94a3b8;font-weight:700;font-size:14px;min-width:110px;flex-shrink:0;">${label}</span>
                    <span style="color:#1e293b;font-weight:700;font-size:14px;text-align:right;flex:1;padding-left:10px;">${value}</span>
                  </div>` : ''

                const html = `
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:20px;box-sizing:border-box;width:640px;">
                    <div style="background:linear-gradient(135deg,#1e3a5f,#1d4ed8);color:#fff;padding:18px 22px;border-radius:16px;margin-bottom:16px;">
                      <div style="font-size:11px;opacity:0.7;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">DPL Construções — Equatorial Energia</div>
                      <div style="font-size:20px;font-weight:900;">📁 Auditoria Operacional de Campo</div>
                      <div style="font-size:13px;opacity:0.85;margin-top:2px;">Contrato 1021/2024</div>
                    </div>
                    <div style="background:${sc2.bg};border:3px solid ${sc2.color}44;border-radius:18px;padding:20px;text-align:center;margin-bottom:16px;">
                      <div style="font-size:52px;font-weight:900;color:${sc2.color};line-height:1;">${Number(detalhe.nota).toFixed(0)}</div>
                      <div style="font-size:13px;color:${sc2.color};font-weight:600;margin-bottom:4px;">pontos</div>
                      <div style="font-size:22px;font-weight:900;color:${sc2.color};">${detalhe.status}</div>
                      <div style="font-size:13px;color:${sc2.color};opacity:0.85;margin-top:6px;font-weight:700;">
                        ${detalhe.tipo_auditoria === 'DESEMPENHO' ? '📊 Desempenho Operacional' : '✅ Pós Serviço'} · ${detalhe.tipo_servico} · ${detalhe.produtivo ? 'Produtivo' : 'Improdutivo'}
                      </div>
                    </div>
                    <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
                      <p style="font-size:14px;font-weight:800;color:#374151;margin:0 0 10px 0;">Dados da Auditoria</p>
                      ${infoRow('Fiscal', detalhe.fiscal)}
                      ${infoRow('Matrícula', detalhe.matricula)}
                      ${infoRow('Equipe', detalhe.prefixo)}
                      ${infoRow('OS', detalhe.os)}
                      ${infoRow('UC', detalhe.uc)}
                      ${infoRow('Endereço', detalhe.endereco)}
                      ${infoRow('Data / Hora', formatData(detalhe.data_auditoria) + ' às ' + detalhe.hora_auditoria)}
                      ${detalhe.lat ? infoRow('GPS', detalhe.lat + ', ' + detalhe.lng) : ''}
                      ${infoRow('Eletricista 1', detalhe.nome_eletricista)}
                      ${infoRow('Eletricista 2', detalhe.nome_eletricista2)}
                    </div>
                    ${ncItems.length > 0 ? `
                    <div style="background:#fef2f2;border:2px solid #fecaca;border-radius:16px;padding:16px;margin-bottom:16px;">
                      <p style="font-size:14px;font-weight:800;color:#b91c1c;margin:0 0 10px 0;">❌ Itens Não Conformes (${ncItems.length})</p>
                      ${ncItems.map((item, i) => `<div style="font-size:13px;color:#991b1b;padding:6px 0;${i < ncItems.length - 1 ? 'border-bottom:1px solid #fecaca;' : ''}line-height:1.5;"><strong>${i+1}.</strong> ${item.p}</div>`).join('')}
                    </div>` : ''}
                    ${(detalhe.feedback || detalhe.observacoes) ? `
                    <div style="background:#fffbeb;border:2px solid #fcd34d;border-radius:16px;padding:16px;margin-bottom:16px;">
                      ${detalhe.feedback ? `<p style="font-size:12px;font-weight:800;color:#92400e;margin:0 0 4px;">FEEDBACK DO FISCAL:</p><p style="font-size:14px;color:#78350f;line-height:1.6;margin:0 0 ${detalhe.observacoes ? '12px' : '0'};">${detalhe.feedback}</p>` : ''}
                      ${detalhe.observacoes ? `<p style="font-size:12px;font-weight:800;color:#92400e;margin:0 0 4px;">OBSERVAÇÕES:</p><p style="font-size:14px;color:#78350f;line-height:1.6;margin:0;">${detalhe.observacoes}</p>` : ''}
                    </div>` : ''}
                    ${detalhe.fotos_urls?.length > 0 ? `
                    <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:14px;margin-bottom:16px;">
                      <p style="font-size:14px;font-weight:800;color:#374151;margin:0 0 10px 0;">📷 Registro Fotográfico (${detalhe.fotos_urls.length})</p>
                      <div style="display:grid;grid-template-columns:repeat(${Math.min(detalhe.fotos_urls.length, 3)},1fr);gap:8px;">
                        ${detalhe.fotos_urls.map(url => `<img src="${url}" crossorigin="anonymous" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;"/>`).join('')}
                      </div>
                    </div>` : ''}
                    ${detalhe.assinatura_url ? `
                    <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:14px;margin-bottom:16px;">
                      <p style="font-size:13px;font-weight:800;color:#374151;margin:0 0 8px;">✍️ Assinatura — ${detalhe.nome_eletricista || 'Eletricista 1'}</p>
                      <img src="${detalhe.assinatura_url}" crossorigin="anonymous" style="width:100%;border-radius:8px;border:1px solid #f1f5f9;background:#fafafa;"/>
                    </div>` : ''}
                    ${detalhe.assinatura2_url ? `
                    <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:14px;margin-bottom:16px;">
                      <p style="font-size:13px;font-weight:800;color:#374151;margin:0 0 8px;">✍️ Assinatura — ${detalhe.nome_eletricista2 || 'Eletricista 2'}</p>
                      <img src="${detalhe.assinatura2_url}" crossorigin="anonymous" style="width:100%;border-radius:8px;border:1px solid #f1f5f9;background:#fafafa;"/>
                    </div>` : ''}
                    <div style="border-top:2px solid #e2e8f0;padding-top:12px;text-align:center;">
                      <p style="font-size:13px;color:#94a3b8;margin:0;font-weight:700;">DPL Construções — Contrato Equatorial Energia 1021/2024</p>
                      <p style="font-size:12px;color:#cbd5e1;margin:4px 0 0;">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })} · <span style="color:#dc2626;font-weight:700;">v${versaoSistema}</span></p>
                    </div>
                  </div>`

                const div = document.createElement('div')
                div.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;'
                div.innerHTML = html
                document.body.appendChild(div)

                const canvas = await html2canvas(div.firstElementChild, {
                  scale: 8, useCORS: true, allowTaint: true,
                  backgroundColor: '#f0f4f8', logging: false, windowWidth: 680,
                })
                document.body.removeChild(div)

                const nomeArq = `Auditoria_${detalhe.prefixo}_${detalhe.data_auditoria}.jpg`.replace(/\s+/g, '_')
                if (navigator.share && navigator.canShare) {
                  canvas.toBlob(async blob => {
                    const file = new File([blob], nomeArq, { type: 'image/jpeg' })
                    if (navigator.canShare({ files: [file] })) {
                      await navigator.share({ files: [file], title: `Auditoria ${detalhe.prefixo}` })
                    } else {
                      const link = document.createElement('a'); link.download = nomeArq; link.href = canvas.toDataURL('image/jpeg', 0.95); link.click()
                    }
                  }, 'image/jpeg', 0.95)
                } else {
                  const link = document.createElement('a'); link.download = nomeArq; link.href = canvas.toDataURL('image/jpeg', 0.95); link.click()
                }
              } catch (err) {
                console.error(err); alert('Não foi possível gerar a imagem.')
              } finally {
                setCapturando(false)
              }
            }} disabled={capturando} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', marginBottom: 10, background: capturando ? '#64748b' : '#25d366', color: '#fff', fontSize: 14, fontWeight: 700, cursor: capturando ? 'not-allowed' : 'pointer' }}>
              {capturando ? '⏳ Gerando imagem...' : '📸 Compartilhar no WhatsApp'}
            </button>

            <button onClick={() => setDetalhe(null)} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Fechar</button>
          </div>
        </div>
      )}

      {/* ── MODAL REABRIR ── */}
      {modalReabrir && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px 20px', width: '100%', maxWidth: 400 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>🔓 Reabrir Auditoria</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 18 }}>A auditoria <strong>{detalhe?.prefixo}</strong> será devolvida ao fiscal para correção.</p>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Devolver para o fiscal:</label>
            <select value={fiscalSelecionado} onChange={e => setFiscalSelecionado(e.target.value)} className="form-input" style={{ marginBottom: 16, fontSize: 14 }}>
              <option value="">Selecione o fiscal...</option>
              {fiscais.map(f => <option key={f.login} value={f.login}>{f.nome} ({f.login})</option>)}
            </select>
            {reabrirErro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#b91c1c', marginBottom: 14 }}>❌ {reabrirErro}</div>}
            {reabrirSucesso && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#15803d', marginBottom: 14 }}>✅ Auditoria reaberta com sucesso!</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalReabrir(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarReabrir} disabled={reabrindo || reabrirSucesso} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: reabrindo ? '#94a3b8' : '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {reabrindo ? '⏳ Reabrindo...' : '🔓 Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

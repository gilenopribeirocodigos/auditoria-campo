import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { listarRegistros } from '../lib/registros.js'
import { getVersaoApp } from '../lib/auth.js'
import { listarAssinaturasColetadas, listarTokensRegistro, encerrarToken } from '../lib/assinaturas.js'
import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'

// ─── Padrão visual unificado dos campos de filtro ───
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

// ─── MultiSelect — dropdown com checkboxes (mesmo componente do Histórico) ───
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
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }}
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
                  <input type="checkbox" checked={sel} onChange={() => toggle(o)} style={{ accentColor: '#7c3aed' }} />
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

function imprimirRegistro(r, assinaturasOnline = [], versaoApp = '') {
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
    <p style="font-size:10px;color:#cbd5e1;margin-top:2px;">Gerado em ${new Date().toLocaleDateString('pt-BR',{dateStyle:'long'})} · <span style="color:#dc2626;">v${versaoApp}</span></p>
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

  // ─── Estado de filtros consolidado (todos os multi-select como array) ───
  const [filtros, setFiltros] = useState({
    dataIni:     calcMesAtual().ini,
    dataFim:     calcMesAtual().fim,
    tipo:        '',
    fiscais:     [],   // multi-select (Fiscal/Usuário)
    supCampo:    [],   // multi-select — NOVO
    supOperacao: [],   // multi-select — NOVO
  })

  const [tokensAtivos,  setTokensAtivos]  = useState({}) // { registroId: tokenData }
  const [encerrando,    setEncerrando]    = useState(null) // registroId sendo encerrado
  const [fiscaisLista,  setFiscaisLista]  = useState([]) // opções pro filtro Fiscal/Usuário

  // ─── Opções dos filtros novos (carregadas 1x na inicialização) ───
  const [supCampoOpcoes,    setSupCampoOpcoes]    = useState([])
  const [supOperacaoOpcoes, setSupOperacaoOpcoes] = useState([])
  const [relSupOpToCampo,   setRelSupOpToCampo]   = useState({})

  const [capturando,    setCapturando]    = useState(false)
  const [versaoSistema, setVersaoSistema] = useState(getVersaoApp())
  const intervalRef = useRef(null)

  // ─── Cascata: Sup. Campo filtrado pelos Sup. Operacionais selecionados ───
  const supCampoOpcoesFiltradas = useMemo(() => {
    if (filtros.supOperacao.length === 0) return supCampoOpcoes
    const set = new Set()
    filtros.supOperacao.forEach(supOp => {
      const filhos = relSupOpToCampo[supOp]
      if (filhos) filhos.forEach(s => set.add(s))
    })
    return [...set].sort()
  }, [filtros.supOperacao, supCampoOpcoes, relSupOpToCampo])

  // ─── Carrega opções de supervisores da estrutura_equipes ───
  const carregarOpcoesSupervisores = async () => {
    try {
      const todos = []
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('estrutura_equipes')
          .select('superv_campo, superv_operacao')
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
      todos.forEach(r => {
        const sc = (r.superv_campo    || '').trim()
        const so = (r.superv_operacao || '').trim()
        if (sc) supCampoSet.add(sc)
        if (so) supOpSet.add(so)
        if (so && sc) {
          if (!rel[so]) rel[so] = new Set()
          rel[so].add(sc)
        }
      })
      setSupCampoOpcoes([...supCampoSet].sort())
      setSupOperacaoOpcoes([...supOpSet].sort())
      setRelSupOpToCampo(rel)
    } catch (e) {
      console.error('Erro ao carregar supervisores:', e)
    }
  }

  const buscar = async () => {
    setLoading(true)
    try {
      // ─── 1) Se há filtros de supervisor, calcula a lista de fiscais elegíveis ───
      let fiscaisPermitidos = null
      if (filtros.supCampo.length > 0 || filtros.supOperacao.length > 0) {
        let qEstr = supabase.from('estrutura_equipes').select('superv_campo')
        if (filtros.supCampo.length > 0)    qEstr = qEstr.in('superv_campo',    filtros.supCampo)
        if (filtros.supOperacao.length > 0) qEstr = qEstr.in('superv_operacao', filtros.supOperacao)
        const { data: estrData, error: errEstr } = await qEstr
        if (errEstr) throw errEstr
        fiscaisPermitidos = [...new Set((estrData || []).map(r => r.superv_campo).filter(Boolean))]
        if (fiscaisPermitidos.length === 0) {
          setRegistros([])
          setTokensAtivos({})
          setLoading(false)
          return
        }
      }

      // ─── 2) Mescla com o filtro de Fiscal/Usuário direto (interseção se ambos ativos) ───
      let fiscaisFinal = filtros.fiscais
      if (fiscaisPermitidos !== null) {
        if (filtros.fiscais.length > 0) {
          fiscaisFinal = filtros.fiscais.filter(f => fiscaisPermitidos.includes(f))
          if (fiscaisFinal.length === 0) {
            setRegistros([])
            setTokensAtivos({})
            setLoading(false)
            return
          }
        } else {
          fiscaisFinal = fiscaisPermitidos
        }
      }

      // ─── 3) Chama a busca de registros com a lista final ───
      const data = await listarRegistros({ ...filtros, fiscais: fiscaisFinal }, usuarioLogado)
      setRegistros(data)

      // Busca tokens ativos para todos os registros de uma vez
      if (data.length > 0) {
        const { data: tokens } = await supabase
          .from('assinaturas_pendentes')
          .select('id, token, registro_id, status, expires_at')
          .eq('status', 'ABERTO')
          .gt('expires_at', new Date().toISOString())
          .in('registro_id', data.map(r => r.id))
        const mapa = {}
        for (const t of (tokens || [])) mapa[t.registro_id] = t
        setTokensAtivos(mapa)
      } else {
        setTokensAtivos({})
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    buscar()
    carregarOpcoesSupervisores()
    // Carrega lista de fiscais (usuários ativos exceto ADMIN)
    supabase.from('usuarios').select('nome').neq('perfil', 'ADMIN').eq('status', 'ATIVO').order('nome')
      .then(({ data }) => setFiscaisLista((data || []).map(u => u.nome)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Atualiza a cada 5 minutos E apenas se não houver modal de detalhe aberto
    intervalRef.current = setInterval(() => {
      if (!detalhe) buscar()
    }, 300000)
    return () => clearInterval(intervalRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalhe])

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

      <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', padding: '18px 20px', color: '#fff' }}>
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

        {/* ── FILTROS ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16 }}>
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
            <div>
              <label style={LABEL_STYLE}>Tipo</label>
              <select value={filtros.tipo} onChange={e => upd('tipo', e.target.value)} style={INPUT_STYLE}>
                <option value="">Todos</option>
                {Object.entries(TIPOS_REGISTRO).map(([k, t]) => (
                  <option key={k} value={k}>{t.emoji} {t.label}</option>
                ))}
              </select>
            </div>

            {/* ── NOVO: Supervisor Operacional ── */}
            {isAdmin && (
              <MultiSelect
                label="Supervisor Operacional"
                options={supOperacaoOpcoes}
                value={filtros.supOperacao}
                onChange={v => upd('supOperacao', v)}
                placeholder="Todos"
              />
            )}

            {/* ── NOVO: Supervisor de Campo (com cascata) ── */}
            {isAdmin && (
              <MultiSelect
                label="Supervisor de Campo"
                options={supCampoOpcoesFiltradas}
                value={filtros.supCampo}
                onChange={v => upd('supCampo', v)}
                placeholder={filtros.supOperacao.length > 0 ? `Subordinados (${supCampoOpcoesFiltradas.length})` : 'Todos'}
              />
            )}

            {/* ── Fiscal / Usuário (multi-select padronizado) ── */}
            <MultiSelect
              label="Fiscal / Usuário"
              options={fiscaisLista}
              value={filtros.fiscais}
              onChange={v => upd('fiscais', v)}
              placeholder="Todos"
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <button onClick={buscar} style={{
              height: FIELD_HEIGHT, padding: '0 22px',
              background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>🔍 Buscar</button>
          </div>
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
              const tokenAtivo = tokensAtivos[r.id]
              const expira = tokenAtivo ? new Date(tokenAtivo.expires_at) : null
              const minutosRestantes = expira ? Math.ceil((expira - new Date()) / 60000) : 0
              return (
                    <div key={r.id} style={{ background: '#fff', borderRadius: 14, border: tokenAtivo ? '1.5px solid #22c55e' : `1.5px solid ${tc.border || '#e2e8f0'}`, padding: '14px 16px', cursor: 'pointer' }}
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
                          {/* Badge de link ativo */}
                          {tokenAtivo && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}
                              onClick={e => e.stopPropagation()}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '3px 10px', borderRadius: 20, border: '1px solid #86efac', display: 'flex', alignItems: 'center', gap: 4 }}>
                                🔗 Link ativo · {minutosRestantes > 60 ? `${Math.floor(minutosRestantes/60)}h ${minutosRestantes%60}min` : `${minutosRestantes}min`}
                              </span>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (!window.confirm('Encerrar o link de assinatura deste registro?')) return
                                  setEncerrando(r.id)
                                  try {
                                    await encerrarToken(tokenAtivo.id)
                                    setTokensAtivos(prev => { const n = {...prev}; delete n[r.id]; return n })
                                  } catch { alert('Erro ao encerrar link.') }
                                  finally { setEncerrando(null) }
                                }}
                                disabled={encerrando === r.id}
                                style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '3px 10px', borderRadius: 20, border: '1px solid #fecaca', cursor: 'pointer' }}>
                                {encerrando === r.id ? '⏳ Encerrando...' : '🔒 Encerrar link'}
                              </button>
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

                              {/* Localização — presencial (salvo no JSON do participante) */}
                              {!p.isOnline && p.assinaturaFinal && (p.endereco_assinatura || p.lat) && (
                                <div style={{ marginTop: 5 }}>
                                  {p.endereco_assinatura && (
                                    <p style={{ fontSize: 11, color: '#15803d', margin: '0 0 2px', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                      <span style={{ flexShrink: 0 }}>📍</span>
                                      <span>{p.endereco_assinatura}</span>
                                    </p>
                                  )}
                                  {p.lat && p.lng && (
                                    <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                      🌐 {Number(p.lat).toFixed(7)}, {Number(p.lng).toFixed(7)}
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Localização — online (salvo em assinaturas_coletadas) */}
                              {p.isOnline && p.assinouOnline && (() => {
                                const assinOnlineData = assinOnline.find(
                                  a => a.nome?.trim().toLowerCase() === p.nome?.trim().toLowerCase()
                                )
                                return assinOnlineData ? (
                                  <div style={{ marginTop: 5 }}>
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

                              {/* Aguardando assinatura online */}
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

                  <p style={{ textAlign: 'center', fontSize: 11, color: '#dc2626', margin: '0 0 10px', fontWeight: 600 }}>
                    v{versaoSistema}
                  </p>

                  <button onClick={() => imprimirRegistro(detalhe, assinOnline, versaoSistema)} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#1e3a5f', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
                    🖨️ Imprimir / Salvar PDF
                  </button>

                  {/* Botão compartilhar no WhatsApp — gera imagem igual ao R6 */}
                  <button onClick={async () => {
                    setCapturando(true)
                    try {
                      const html2canvas = (await import('html2canvas')).default
                      const tc2 = TIPOS_REGISTRO[detalhe.tipo] || {}
                      const mc2 = MODALIDADES[detalhe.modalidade] || {}
                      const formatD = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
                      const participantes = detalhe.participantes || []
                      // Cruza participantes com assinaturas online (igual ao modal)
                      const participantesComAssinatura = participantes.map(p => {
                        const assinaturaOnline = assinOnline.find(
                          a => a.nome?.trim().toLowerCase() === p.nome?.trim().toLowerCase()
                        )
                        return {
                          ...p,
                          assinaturaFinal: p.assinatura_url || assinaturaOnline?.assinatura_url || null,
                          isOnline: p.modo === 'online' || (!!assinaturaOnline && !p.assinatura_url),
                          assinouOnline: !!assinaturaOnline,
                        }
                      })

                      const infoRow = (label, value) => value ? `
                        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#94a3b8;font-weight:700;font-size:14px;min-width:100px;flex-shrink:0;">${label}</span>
                          <span style="color:#1e293b;font-weight:700;font-size:14px;text-align:right;flex:1;padding-left:8px;">${value}</span>
                        </div>` : ''

                      const html = `
                        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:20px;box-sizing:border-box;width:640px;">
                          <div style="background:${tc2.bg || '#eff6ff'};border:3px solid ${tc2.border || '#bfdbfe'};border-radius:18px;padding:20px;text-align:center;margin-bottom:16px;">
                            <div style="font-size:52px;margin-bottom:10px;">${tc2.emoji || '📝'}</div>
                            <div style="font-size:26px;font-weight:900;color:${tc2.color || '#1d4ed8'};margin-bottom:6px;letter-spacing:-0.5px;">${tc2.label || detalhe.tipo}</div>
                            <div style="font-size:15px;color:${tc2.color || '#1d4ed8'};opacity:0.85;font-weight:700;">${mc2.emoji || ''} ${mc2.label || ''} · ${participantes.length} participante(s)</div>
                          </div>
                          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
                            <p style="font-size:14px;font-weight:800;color:#374151;margin:0 0 10px 0;">Dados do Registro</p>
                            ${infoRow('Fiscal', detalhe.fiscal)}
                            ${infoRow('Data / Hora', formatD(detalhe.data_registro) + ' às ' + detalhe.hora_registro)}
                            ${infoRow('Local', detalhe.endereco)}
                            ${infoRow('GPS', detalhe.lat ? detalhe.lat.toFixed(5) + ', ' + detalhe.lng.toFixed(5) : null)}
                            ${infoRow('Tema', detalhe.tema)}
                            ${infoRow('Carga Horária', detalhe.carga_horaria)}
                          </div>
                          ${detalhe.pauta ? `
                          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
                            <p style="font-size:14px;font-weight:800;color:#374151;margin:0 0 8px 0;">${detalhe.tipo === 'DISCIPLINAR' ? 'Descrição' : 'Pauta / Conteúdo'}</p>
                            <p style="font-size:14px;color:#475569;line-height:1.6;margin:0;">${detalhe.pauta}</p>
                          </div>` : ''}
                          ${detalhe.observacoes ? `
                          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
                            <p style="font-size:14px;font-weight:800;color:#374151;margin:0 0 8px 0;">Observações</p>
                            <p style="font-size:14px;color:#475569;line-height:1.6;margin:0;">${detalhe.observacoes}</p>
                          </div>` : ''}
                          <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:16px;padding:16px;margin-bottom:16px;">
                            <p style="font-size:16px;font-weight:800;color:#15803d;margin:0 0 12px 0;">✅ Lista de Frequência (${participantesComAssinatura.length})</p>
                            ${participantesComAssinatura.map((p, i) => `
                              <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;${i < participantes.length - 1 ? 'border-bottom:1px solid #bbf7d0;' : ''}">
                                <div>
                                  <span style="font-size:15px;font-weight:800;color:#15803d;">${i+1}. ${p.nome}</span>
                                  ${p.matricula ? `<span style="font-size:13px;color:#64748b;margin-left:8px;">Mat: ${p.matricula}</span>` : ''}
                                  ${p.modo === 'online' ? `<span style="font-size:11px;color:#1d4ed8;background:#dbeafe;padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:700;">🔗 online</span>` : ''}
                                </div>
                                ${p.assinaturaFinal ? `<img src="${p.assinaturaFinal}" crossorigin="anonymous" style="height:44px;max-width:110px;object-fit:contain;border-radius:6px;background:#fafafa;border:1px solid #e2e8f0;"/>` : p.isOnline ? '<span style="font-size:12px;color:#f59e0b;font-weight:600;">⏳ aguardando</span>' : ''}
                              </div>`).join('')}
                          </div>
                          ${Array.isArray(detalhe.fotos_urls) && detalhe.fotos_urls.length > 0 ? `
                          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:14px;margin-bottom:16px;">
                            <p style="font-size:14px;font-weight:800;color:#374151;margin:0 0 10px 0;">📷 Fotos (${detalhe.fotos_urls.length})</p>
                            <div style="display:grid;grid-template-columns:repeat(${Math.min((detalhe.fotos_urls||[]).length,3)},1fr);gap:8px;">
                              ${detalhe.fotos_urls.map(url => `<img src="${url}" crossorigin="anonymous" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;"/>`).join('')}
                            </div>
                          </div>` : ''}
                          <div style="border-top:2px solid #e2e8f0;padding-top:12px;text-align:center;">
                            <p style="font-size:13px;color:#94a3b8;margin:0;font-weight:700;">DPL Construções — Contrato Equatorial Energia 1021/2024</p>
                            <p style="font-size:12px;color:#cbd5e1;margin:4px 0 0 0;">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })} · <span style="color:#dc2626;font-weight:700;">v${versaoSistema}</span></p>
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

                      const nomeArq = `Registro_${detalhe.tipo}_${detalhe.data_registro}.jpg`.replace(/\s+/g, '_')
                      if (navigator.share && navigator.canShare) {
                        canvas.toBlob(async blob => {
                          const file = new File([blob], nomeArq, { type: 'image/jpeg' })
                          if (navigator.canShare({ files: [file] })) {
                            await navigator.share({ files: [file], title: tc2.label })
                          } else {
                            const link = document.createElement('a'); link.download = nomeArq; link.href = canvas.toDataURL('image/png'); link.click()
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
                  }} disabled={capturando} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: capturando ? '#64748b' : '#25d366', color: '#fff', fontSize: 14, fontWeight: 700, cursor: capturando ? 'not-allowed' : 'pointer', marginBottom: 10 }}>
                    {capturando ? '⏳ Gerando imagem...' : '📸 Compartilhar no WhatsApp'}
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

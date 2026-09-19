import { useState, useEffect, useRef, useMemo } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase.js'
import { reabrirAuditoria } from '../lib/supabase.js'
import { CHECKLISTS, CAT_META, getItemsNaoConformes, getStatus, getChecklist, getItemsAtivos, getItemsParaCalculo, isItemConforme, isDisqualified } from '../data/checklists.js'
import { getVersaoApp } from '../lib/auth.js'
import { numeroASDaAuditoria } from '../lib/numeroAS.js'
import { compartilharImagemNativo, compartilharPDFNativo, renderizarHtmlParaCanvas, descreverErro } from '../lib/compartilhar.js'
import * as XLSX from 'xlsx'
import {
  useFiltrosOperacionais,
  PainelFiltros,
  MultiSelect,
  FIELD_HEIGHT, LABEL_STYLE, INPUT_STYLE,
} from '../components/PainelFiltros.jsx'

const STATUS_COR = {
  'ATENDE':         { bg: '#dcfce7', color: '#15803d' },
  'ATENDE PARCIAL': { bg: '#fef3c7', color: '#92400e' },
  'NÃO ATENDE':     { bg: '#fee2e2', color: '#dc2626' },
}

// Tipos de serviço puxados DINAMICAMENTE de CHECKLISTS
const getTipoEmoji = (tipo) => CHECKLISTS[tipo]?.emoji || '📋'
const getTipoLabel = (tipo) => CHECKLISTS[tipo]?.label || tipo
const TIPO_AUDITORIA_LABEL = {
  DESEMPENHO: 'Desempenho Operacional',
  POS_SERVICO: 'Pós Serviço',
}
const getTipoAuditoriaLabel = (tipo) => TIPO_AUDITORIA_LABEL[tipo] || tipo

// Calcula itens não conformes a partir dos dados salvos
function calcNcItems(auditoria) {
  if (!auditoria?.respostas || !auditoria?.tipo_servico) return []
  return getItemsNaoConformes({
    tipoServico: auditoria.tipo_servico,
    produtivo:   auditoria.produtivo,
    respostas:   auditoria.respostas || {},
  })
}

// Recalcula conformes/não-conformes por categoria a partir dos dados salvos —
// mesma lógica de S6Resultado.jsx (catStats), só adaptando os nomes de campo
// do form em edição (tipoServico/produtivo) pros da linha salva no banco
// (tipo_servico/produtivo).
function calcStatsAuditoria(a) {
  const fa = { tipoServico: a?.tipo_servico, tipoAuditoria: a?.tipo_auditoria, produtivo: a?.produtivo, respostas: a?.respostas || {} }
  const cl = getChecklist(fa.tipoServico, fa.tipoAuditoria, fa.produtivo)
  const items = getItemsParaCalculo(getItemsAtivos(cl?.items || [], fa), fa.respostas)
  const sim = items.filter(i => isItemConforme(i, items, fa.respostas)).length
  const nao = items.length - sim
  const catStats = ['COMPORTAMENTO', 'QUALIDADE', 'DESEMPENHO'].map(cat => {
    const catItems = items.filter(i => i.cat === cat)
    const catSim   = catItems.filter(i => isItemConforme(i, items, fa.respostas)).length
    const pct      = catItems.length > 0 ? Math.round(catSim / catItems.length * 100) : 0
    return { cat, total: catItems.length, sim: catSim, pct }
  }).filter(c => c.total > 0)
  return { items, sim, nao, catStats, eliminado: isDisqualified(fa) }
}

// ─── conteúdo reaproveitável (impressão web + PDF nativo Android + imagem
// pro WhatsApp) — mesmo visual colorido/"bonito" de criarCanvasResumo em
// S6Resultado.jsx (cabeçalho com a cor do status, grid de conformes/não
// conformes/total, barras "Por Categoria"), sem marca de cliente/contrato —
// mesmo padrão de rodapé já usado em SESMT/Registros Operacionais.
function montarConteudoImpressaoAuditoria(a, formatData) {
  const st      = getStatus(Number(a.nota) || 0)
  const ncItems = calcNcItems(a)
  const { sim, nao, items, catStats, eliminado } = calcStatsAuditoria(a)
  const msgEliminado = a.tipo_servico === 'CORTE' ? '🚫 EQUIPE NÃO EXECUTOU O CORTE' : '🚫 EQUIPE NÃO EXECUTOU A ATIVIDADE'
  const labelTipoAuditoria = a.tipo_auditoria === 'DESEMPENHO' ? '📊 Desempenho Operacional' : a.tipo_auditoria === 'POS_SERVICO' ? '✅ Pós Serviço' : '—'

  const catColor = cat => ({
    COMPORTAMENTO: { bg: '#dbeafe', color: '#1d4ed8' },
    QUALIDADE:     { bg: '#dcfce7', color: '#15803d' },
    DESEMPENHO:    { bg: '#fef3c7', color: '#92400e' },
  }[cat] || { bg: '#f1f5f9', color: '#374151' })
  const barCor = pct => pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626'

  const infoRow = (label, value) => value ? `
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;">
      <span style="color:#64748b;font-weight:700;font-size:14px;min-width:110px;flex-shrink:0;">${label}</span>
      <span style="color:#1e293b;font-weight:700;font-size:14px;text-align:right;flex:1;padding-left:10px;">${value}</span>
    </div>` : ''

  return `
  ${eliminado ? `<div style="background:#dc2626;color:#fff;padding:10px 16px;border-radius:10px;margin-bottom:14px;font-size:14px;font-weight:800;text-align:center;letter-spacing:0.3px;">${msgEliminado}</div>` : ''}

  <div style="background:${st.bg};border:3px solid ${st.border};border-radius:18px;padding:22px;text-align:center;margin-bottom:16px;">
    <div style="font-size:44px;margin-bottom:6px;">${st.icon}</div>
    <div style="font-size:54px;font-weight:900;color:${st.color};line-height:1;">${Number(a.nota).toFixed(0)}</div>
    <div style="font-size:13px;color:${st.color};font-weight:600;margin-bottom:4px;">pontos</div>
    <div style="font-size:22px;font-weight:900;color:${st.color};margin-bottom:6px;">${st.label}</div>
    <div style="font-size:14px;color:${st.color};font-weight:800;line-height:1.4;">${labelTipoAuditoria} — ${CHECKLISTS[a.tipo_servico]?.label || a.tipo_servico} — ${a.produtivo ? 'Produtivo' : 'Improdutivo'}</div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">
    <div style="background:#dcfce7;border-radius:14px;padding:14px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#16a34a;">${sim}</div>
      <div style="font-size:12px;color:#16a34a;font-weight:700;">Conformes</div>
    </div>
    <div style="background:#fee2e2;border-radius:14px;padding:14px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#dc2626;">${nao}</div>
      <div style="font-size:12px;color:#dc2626;font-weight:700;">Não conf.</div>
    </div>
    <div style="background:#eff6ff;border-radius:14px;padding:14px;text-align:center;">
      <div style="font-size:28px;font-weight:900;color:#2563eb;">${items.length}</div>
      <div style="font-size:12px;color:#2563eb;font-weight:700;">Total itens</div>
    </div>
  </div>

  ${catStats.length > 0 ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <p style="font-size:14px;font-weight:900;color:#1e293b;margin:0 0 12px 0;">Por Categoria</p>
    ${catStats.map(c => {
      const cc = catColor(c.cat)
      return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
          <span style="background:${cc.bg};color:${cc.color};padding:3px 10px;border-radius:8px;font-size:11px;font-weight:800;">${CAT_META[c.cat].label}</span>
          <span style="font-size:13px;font-weight:800;color:#374151;">${c.sim}/${c.total} — ${c.pct}%</span>
        </div>
        <div style="background:#f1f5f9;border-radius:8px;height:12px;overflow:hidden;">
          <div style="width:${c.pct}%;height:12px;background:${barCor(c.pct)};border-radius:8px;"></div>
        </div>
      </div>`
    }).join('')}
  </div>` : ''}

  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <p style="font-size:14px;font-weight:900;color:#1e293b;margin:0 0 10px 0;">Dados da Auditoria</p>
    ${infoRow('No. AS',         a.numero_as)}
    ${infoRow('Tipo Auditoria', labelTipoAuditoria)}
    ${a.motivo_auditoria ? infoRow('Motivo da Auditoria', a.motivo_auditoria) : ''}
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
  </div>

  ${ncItems.length > 0 ? `
  <div style="background:#fff0f0;border:3px solid #dc2626;border-radius:16px;padding:18px;margin-bottom:16px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="font-size:20px;">❌</span>
      <p style="font-size:15px;font-weight:900;color:#b91c1c;margin:0;">Itens Não Conformes (${ncItems.length})</p>
    </div>
    ${ncItems.map((item, i) => `
      <div style="background:#fef2f2;border-left:5px solid #dc2626;border-radius:0 10px 10px 0;padding:10px 12px;margin-bottom:${i < ncItems.length - 1 ? '8px' : '0'};line-height:1.5;">
        <span style="font-size:13px;font-weight:900;color:#991b1b;">${i + 1}. </span>
        <span style="font-size:13px;font-weight:700;color:#991b1b;">${item.p}</span>
      </div>`).join('')}
  </div>` : ''}

  ${(a.feedback || a.observacoes) ? `
  <div style="background:#fffbeb;border:2px solid #fcd34d;border-radius:16px;padding:16px;margin-bottom:16px;">
    ${a.feedback ? `<p style="font-size:12px;font-weight:900;color:#92400e;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.5px;">Feedback do Fiscal:</p><p style="font-size:14px;color:#1e293b;font-weight:600;line-height:1.6;margin:0 0 ${a.observacoes ? '12px' : '0'} 0;">${a.feedback}</p>` : ''}
    ${a.observacoes ? `<p style="font-size:12px;font-weight:900;color:#92400e;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.5px;">Observações:</p><p style="font-size:14px;color:#1e293b;font-weight:600;line-height:1.6;margin:0;">${a.observacoes}</p>` : ''}
  </div>` : ''}

  ${a.fotos_urls?.length > 0 ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <p style="font-size:14px;font-weight:900;color:#1e293b;margin:0 0 10px 0;">📷 Registro Fotográfico (${a.fotos_urls.length})</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
      ${a.fotos_urls.map((url, i) => `<img src="${url}" alt="Foto ${i+1}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid #e2e8f0;display:block;" crossorigin="anonymous"/>`).join('')}
    </div>
  </div>` : ''}

  ${a.assinatura_url ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <p style="font-size:13px;font-weight:900;color:#1e293b;margin:0 0 8px 0;">Assinatura — ${a.nome_eletricista || 'Eletricista 1'}</p>
    <img src="${a.assinatura_url}" alt="Assinatura 1" style="width:100%;border-radius:8px;border:1px solid #f1f5f9;background:#fafafa;display:block;" crossorigin="anonymous"/>
    <p style="font-size:10px;color:#94a3b8;text-align:center;margin-top:8px;">Registrado em ${formatData(a.data_auditoria)} às ${a.hora_auditoria}</p>
  </div>` : ''}

  ${a.assinatura2_url ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <p style="font-size:13px;font-weight:900;color:#1e293b;margin:0 0 8px 0;">Assinatura — ${a.nome_eletricista2 || 'Eletricista 2'}</p>
    <img src="${a.assinatura2_url}" alt="Assinatura 2" style="width:100%;border-radius:8px;border:1px solid #f1f5f9;background:#fafafa;display:block;" crossorigin="anonymous"/>
    <p style="font-size:10px;color:#94a3b8;text-align:center;margin-top:8px;">Registrado em ${formatData(a.data_auditoria)} às ${a.hora_auditoria}</p>
  </div>` : ''}

  <div style="border-top:2px solid #e2e8f0;padding-top:14px;text-align:center;margin-top:8px;">
    <p style="font-size:13px;color:#64748b;margin:0;font-weight:700;">VérticeGP · Plataforma de Gestão Operacional</p>
    <p style="font-size:12px;color:#cbd5e1;margin:4px 0 0 0;">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
  </div>`
}

// Web: abre popup com a auditoria e chama print() nele — mantido igual.
function imprimirAuditoria(a, formatData) {
  const conteudo = montarConteudoImpressaoAuditoria(a, formatData)
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
  ${conteudo}
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

// App Android nativo: window.open()/window.print() não funcionam dentro do
// WebView — monta um PDF de verdade a partir do mesmo conteúdo e compartilha
// via folha nativa do Android.
async function gerarPDFAuditoria(a, formatData) {
  const conteudo = montarConteudoImpressaoAuditoria(a, formatData)
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;padding:24px;box-sizing:border-box;width:700px;color:#1e293b;">${conteudo}</div>`
  const canvas = await renderizarHtmlParaCanvas(html, {
    largura: 700, escala: 4, aguardarImagens: true, esperaExtraMs: 80, corFundo: '#fff',
  })
  const nomeArq = `Auditoria_${a.prefixo}_OS${a.os}_${a.data_auditoria}.pdf`.replace(/\s+/g, '_')
  await compartilharPDFNativo(canvas, nomeArq, { titulo: `Auditoria ${a.prefixo}` })
}

export default function HistoricoAuditorias({ usuarioLogado, onVoltar }) {
  // ─── Hook do painel: gerencia Período + Sup. Op + Sup. Campo + Prefixo ───
  const filtros = useFiltrosOperacionais({ inicializarMes: true, usuarioLogado })

  // ─── Filtros EXTRAS desta tela ───
  const [tipoServico,    setTipoServico]    = useState([]) // multi
  const [tipoAuditoria,  setTipoAuditoria]  = useState([]) // multi
  const [motivoAuditoria, setMotivoAuditoria] = useState([]) // multi
  const [numeroAS,       setNumeroAS]       = useState('')
  const [resultado,      setResultado]      = useState('') // single
  const [ncStatusFiltro, setNcStatusFiltro] = useState('') // single
  const [opcoesMotivoAuditoria, setOpcoesMotivoAuditoria] = useState([])

  const [auditorias, setAuditorias] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [exportando, setExportando] = useState(false)
  const [detalhe,    setDetalhe]    = useState(null)
  const [totais,     setTotais]     = useState({ total: 0, atende: 0, parcial: 0, naoAtende: 0 })

  const [modalReabrir,      setModalReabrir]      = useState(false)
  const [fiscais,           setFiscais]           = useState([])
  const [fiscalSelecionado, setFiscalSelecionado] = useState('')
  const [reabrindo,         setReabrindo]         = useState(false)
  const [reabrirErro,       setReabrirErro]       = useState('')
  const [reabrirSucesso,    setReabrirSucesso]    = useState(false)

  const [versaoSistema, setVersaoSistema] = useState(getVersaoApp())
  const [capturando,    setCapturando]    = useState(false)
  const [gerandoPDF,    setGerandoPDF]    = useState(false)
  const intervalRef = useRef(null)
  // 2026-09-19: impede buscas simultaneas e encerra espera apos 30s.
  const buscaEmAndamentoRef = useRef(false)
  const [erroBusca, setErroBusca] = useState('')

  // ─── Permissões do perfil ───
  // ADMIN sempre passa. Outros perfis controlados pela tabela perfis_permissoes
  // (chaves: historico_ver_todas e historico_reabrir)
  const isAdmin      = usuarioLogado?.perfil === 'ADMIN'
  const podeVerTodas = isAdmin || (usuarioLogado?.permissoes || []).includes('historico_ver_todas')
  const podeReabrir  = isAdmin || (usuarioLogado?.permissoes || []).includes('historico_reabrir')

  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const buscar = async () => {
    if (buscaEmAndamentoRef.current) return
    buscaEmAndamentoRef.current = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    setErroBusca('')
    setLoading(true)
    try {
      const { ini, fim } = filtros.getDatasQuery()
      if (!ini || !fim) {
        setAuditorias([])
        setTotais({ total: 0, atende: 0, parcial: 0, naoAtende: 0 })
        setLoading(false)
        return
      }

      // ── 1) Combina os filtros hierárquicos + SEGREGAÇÃO POR ESTRUTURA ──
      // O mapPrefixo do hook JÁ vem filtrado pelos prefixos permitidos do
      // usuário logado (cruzamento natural + processos liberados).
      // Aqui aplicamos os filtros do painel POR CIMA disso.
      const filtroHierarquicoAtivo =
        filtros.selRegional.length > 0 ||
        filtros.selSupOp.length    > 0 ||
        filtros.selSupCampo.length > 0 ||
        filtros.selPrefixos.length > 0

      let prefixosFiltrados = null
      if (filtroHierarquicoAtivo) {
        // Itera só sobre prefixos que o usuário JÁ pode ver (mapPrefixo segregado)
        const set = new Set()
        Object.entries(filtros.mapPrefixo).forEach(([pref, info]) => {
          if (filtros.selRegional.length > 0 && !filtros.selRegional.includes(info.regional)) return
          if (filtros.selSupOp.length    > 0 && !filtros.selSupOp.includes(info.op))       return
          if (filtros.selSupCampo.length > 0 && !filtros.selSupCampo.includes(info.campo)) return
          if (filtros.selPrefixos.length > 0 && !filtros.selPrefixos.includes(pref))       return
          set.add(pref)
        })
        prefixosFiltrados = [...set]
        if (prefixosFiltrados.length === 0) {
          setAuditorias([])
          setTotais({ total: 0, atende: 0, parcial: 0, naoAtende: 0 })
          setLoading(false)
          return
        }
      } else if (filtros.prefixosPermitidos) {
        // Sem filtros do painel, mas há segregação por estrutura → aplica
        prefixosFiltrados = filtros.prefixosPermitidos
        if (prefixosFiltrados.length === 0) {
          setAuditorias([])
          setTotais({ total: 0, atende: 0, parcial: 0, naoAtende: 0 })
          setLoading(false)
          return
        }
      }

      const podeVerTodos = podeVerTodas
      const buscaAS = numeroAS.trim().toUpperCase()

      // ── 2) Opções dinâmicas do filtro Motivo Auditoria ──
      let qOpcoesMotivo = supabase
        .from('auditorias')
        .select('motivo_auditoria')
        .gte('data_auditoria', ini).lte('data_auditoria', fim)

      if (!podeVerTodos)     qOpcoesMotivo = qOpcoesMotivo.eq('matricula', usuarioLogado.matricula)
      if (prefixosFiltrados) qOpcoesMotivo = qOpcoesMotivo.in('prefixo', prefixosFiltrados)

      const { data: motivosData, error: motivosError } = await qOpcoesMotivo.abortSignal(controller.signal)
      if (motivosError) throw motivosError
      setOpcoesMotivoAuditoria(
        [...new Set((motivosData || []).map(r => r.motivo_auditoria).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
      )

      // ── 3) Query principal ──
      let q = supabase
        .from('auditorias').select('*')
        .gte('data_auditoria', ini).lte('data_auditoria', fim)
        .order('data_auditoria', { ascending: false })
        .order('hora_auditoria', { ascending: false })

      if (!podeVerTodos)              q = q.eq('matricula', usuarioLogado.matricula)
      if (tipoServico.length > 0)     q = q.in('tipo_servico', tipoServico)
      if (tipoAuditoria.length > 0)   q = q.in('tipo_auditoria', tipoAuditoria)
      if (motivoAuditoria.length > 0) q = q.in('motivo_auditoria', motivoAuditoria)
      if (resultado)                  q = q.eq('status', resultado)
      if (ncStatusFiltro)             q = q.eq('nc_status', ncStatusFiltro)
      if (prefixosFiltrados)          q = q.in('prefixo', prefixosFiltrados)

      const { data, error } = await q.abortSignal(controller.signal)
      if (error) throw error

      const auditoriasNormalizadas = (data || [])
        .map(a => ({ ...a, numero_as: numeroASDaAuditoria(a) }))
        .filter(a => !buscaAS || String(a.numero_as || '').toUpperCase().includes(buscaAS))

      setAuditorias(auditoriasNormalizadas)
      setTotais({
        total:     auditoriasNormalizadas.length,
        atende:    auditoriasNormalizadas.filter(a => a.status === 'ATENDE').length,
        parcial:   auditoriasNormalizadas.filter(a => a.status === 'ATENDE PARCIAL').length,
        naoAtende: auditoriasNormalizadas.filter(a => a.status === 'NÃO ATENDE').length,
      })
    } catch (e) {
      console.error(e)
      setErroBusca(controller.signal.aborted ? 'A busca demorou mais de 30 segundos. Tente novamente com um periodo menor.' : 'Nao foi possivel carregar as auditorias. Tente novamente.')
    } finally {
      clearTimeout(timeout)
      buscaEmAndamentoRef.current = false
      setLoading(false)
    }
  }

  // Carrega na primeira renderização
  useEffect(() => {
    buscar()
    setVersaoSistema(getVersaoApp())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2026-09-19: atualiza a cada 5 min apenas com a tela visivel, reduzindo consultas repetidas.
  const buscarRef = useRef(buscar)
  useEffect(() => { buscarRef.current = buscar })
  useEffect(() => {
    intervalRef.current = setInterval(() => { if (document.visibilityState === 'visible') buscarRef.current() }, 300000)
    return () => clearInterval(intervalRef.current)
  }, [])

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

  const NC_STATUS_LABEL = { PENDENTE: '🟠 Pendente', TRATADA: '🟢 Tratada' }

  const exportarExcel = async () => {
    if (auditorias.length === 0) { alert('Nenhuma auditoria para exportar. Faça uma busca primeiro.'); return }
    setExportando(true)
    try {
      // ─── Busca as NCs das auditorias listadas (join manual em JS) ───
      const auditoriaIds = auditorias.map(a => a.id).filter(Boolean)
      let ncsPorAuditoria = {}
      let todasNcs = []
      if (auditoriaIds.length > 0) {
        const { data: ncsData } = await supabase
          .from('auditorias_nao_conformes')
          .select('*')
          .in('auditoria_id', auditoriaIds)
        todasNcs = ncsData || []
        todasNcs.forEach(nc => {
          if (!ncsPorAuditoria[nc.auditoria_id]) ncsPorAuditoria[nc.auditoria_id] = []
          ncsPorAuditoria[nc.auditoria_id].push(nc)
        })
      }

      const linhas = auditorias.map(a => {
        const sup = filtros.mapPrefixo[a.prefixo] || {}
        const ncsDaAuditoria = ncsPorAuditoria[a.id] || []
        return {
          'Data':                   formatData(a.data_auditoria),
          'Hora':                   a.hora_auditoria || '',
          'Fiscal (Sup. Campo)':    a.fiscal || '',
          'Matrícula':              a.matricula || '',
          'Equipe (Prefixo)':       a.prefixo || '',
          'Supervisor de Campo':    sup.campo || '',
          'Supervisor Operacional': sup.op || '',
          'No. AS':                 a.numero_as || '',
          'OS':                     a.os || '',
          'UC':                     a.uc || '',
          'Tipo Auditoria':         getTipoAuditoriaLabel(a.tipo_auditoria),
          'Motivo Auditoria':       a.motivo_auditoria || '',
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
          'NC Pendentes':           ncsDaAuditoria.filter(n => n.status_tratamento === 'PENDENTE').length,
          'NC Tratadas':            ncsDaAuditoria.filter(n => n.status_tratamento === 'TRATADA').length,
          'Status Tratamento NC':   a.nc_status ? (NC_STATUS_LABEL[a.nc_status] || a.nc_status) : (ncsDaAuditoria.length > 0 ? '' : 'Sem NC'),
        }
      })

      const ws = XLSX.utils.json_to_sheet(linhas)
      ws['!cols'] = [
        { wch: 12 }, { wch: 8  }, { wch: 30 }, { wch: 12 }, { wch: 16 },
        { wch: 22 }, { wch: 22 }, { wch: 24 },
        { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 30 }, { wch: 14 }, { wch: 12 },
        { wch: 8  }, { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 12 },
        { wch: 30 }, { wch: 30 }, { wch: 40 }, { wch: 40 }, { wch: 10 },
        { wch: 14 }, { wch: 14 }, { wch: 20 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Auditorias')

      // ─── Aba extra: 1 linha por item de não conformidade ───
      if (todasNcs.length > 0) {
        const linhasNc = todasNcs.map(nc => ({
          'No. AS':               nc.numero_as || '',
          'Fiscal':                nc.fiscal || '',
          'Prefixo':               nc.prefixo || '',
          'OS':                    nc.os || '',
          'UC':                    nc.uc || '',
          'Tipo Auditoria':        getTipoAuditoriaLabel(nc.tipo_auditoria),
          'Item Não Conforme':     nc.item_texto || '',
          'Status Tratamento':     NC_STATUS_LABEL[nc.status_tratamento] || nc.status_tratamento || '',
          'Observação Tratamento': nc.tratamento_observacao || '',
          'Tratado por':           nc.tratado_por || '',
          'Tratado em':            nc.tratado_em ? new Date(nc.tratado_em).toLocaleString('pt-BR') : '',
        }))
        const wsNc = XLSX.utils.json_to_sheet(linhasNc)
        wsNc['!cols'] = [
          { wch: 24 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
          { wch: 22 }, { wch: 40 }, { wch: 16 }, { wch: 40 }, { wch: 20 }, { wch: 18 },
        ]
        XLSX.utils.book_append_sheet(wb, wsNc, 'Não Conformidades')
      }

      const { ini, fim } = filtros.getDatasQuery()
      const resumo = [
        ['RELATÓRIO DE AUDITORIAS — DPL CONSTRUÇÕES'],
        ['Contrato Equatorial Energia 1021/2024'],
        [''],
        ['Período', `${formatData(ini)} a ${formatData(fim)}`],
        ['Gerado em', new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })],
        [''],
        ['FILTROS APLICADOS', ''],
        ['Regional',               filtros.selRegional.length > 0 ? filtros.selRegional.join(', ') : '(todas)'],
        ['Prefixo(s)',             filtros.selPrefixos.length > 0 ? filtros.selPrefixos.join(', ') : '(todos)'],
        ['Tipo de Serviço',        tipoServico.length > 0 ? tipoServico.join(', ') : '(todos)'],
        ['Tipo Auditoria',         tipoAuditoria.length > 0 ? tipoAuditoria.map(getTipoAuditoriaLabel).join(', ') : '(todos)'],
        ['Motivo Auditoria',       motivoAuditoria.length > 0 ? motivoAuditoria.join(', ') : '(todos)'],
        ['No. AS',                 numeroAS || '(todos)'],
        ['Supervisor de Campo',    filtros.selSupCampo.length > 0 ? filtros.selSupCampo.join(', ') : '(todos)'],
        ['Supervisor Operacional', filtros.selSupOp.length    > 0 ? filtros.selSupOp.join(', ')    : '(todos)'],
        ['Resultado',              resultado || '(todos)'],
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

      XLSX.writeFile(wb, `Auditorias_DPL_${ini}_${fim}.xlsx`)
    } catch (e) {
      console.error('Erro ao exportar:', e)
      alert('Erro ao gerar Excel. Tente novamente.')
    } finally { setExportando(false) }
  }

  const detalheNcItems = detalhe ? calcNcItems(detalhe) : []
  const tiposServicoOpcoes = Object.keys(CHECKLISTS)
  const tiposAuditoriaOpcoes = Object.keys(TIPO_AUDITORIA_LABEL)
  const motivosAuditoriaOpcoes = useMemo(
    () => [...new Set([...opcoesMotivoAuditoria, ...motivoAuditoria])].sort((a, b) => a.localeCompare(b)),
    [opcoesMotivoAuditoria, motivoAuditoria]
  )

  // ─── Filtros EXTRAS no painel: Tipo Serviço + Tipo Auditoria + Motivo + Resultado ───
  const extras = (
    <>
      <div>
        <label style={LABEL_STYLE}>No. AS</label>
        <input
          value={numeroAS}
          onChange={e => setNumeroAS(e.target.value.toUpperCase())}
          placeholder="AS-..."
          style={INPUT_STYLE}
        />
      </div>
      <div>
        <label style={LABEL_STYLE}>Tipo Serviço</label>
        <MultiSelect
          opcoes={tiposServicoOpcoes}
          selecionados={tipoServico}
          onChange={setTipoServico}
          placeholder="Todos"
          formatOption={(t) => `${getTipoEmoji(t)} ${getTipoLabel(t)}`}
        />
      </div>
      <div>
        <label style={LABEL_STYLE}>Tipo Auditoria</label>
        <MultiSelect
          opcoes={tiposAuditoriaOpcoes}
          selecionados={tipoAuditoria}
          onChange={setTipoAuditoria}
          placeholder="Todos"
          formatOption={getTipoAuditoriaLabel}
        />
      </div>
      <div>
        <label style={LABEL_STYLE}>Motivo Auditoria</label>
        <MultiSelect
          opcoes={motivosAuditoriaOpcoes}
          selecionados={motivoAuditoria}
          onChange={setMotivoAuditoria}
          placeholder="Todos"
          disabled={motivosAuditoriaOpcoes.length === 0}
        />
      </div>
      <div>
        <label style={LABEL_STYLE}>Resultado</label>
        <select value={resultado} onChange={e => setResultado(e.target.value)} style={{
          ...INPUT_STYLE, cursor: 'pointer', appearance: 'none',
          backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%2394a3b8\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32,
        }}>
          <option value="">Todos</option>
          <option value="ATENDE">Atende</option>
          <option value="ATENDE PARCIAL">Atende Parcial</option>
          <option value="NÃO ATENDE">Não Atende</option>
        </select>
      </div>
      <div>
        <label style={LABEL_STYLE}>Status Tratamento NC</label>
        <select value={ncStatusFiltro} onChange={e => setNcStatusFiltro(e.target.value)} style={{
          ...INPUT_STYLE, cursor: 'pointer', appearance: 'none',
          backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%2394a3b8\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32,
        }}>
          <option value="">Todos</option>
          <option value="PENDENTE">🟠 NC Pendente</option>
          <option value="TRATADA">🟢 NC Tratada</option>
        </select>
      </div>
    </>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      <div style={{ background: '#1e3a5f', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📁 Histórico de Auditorias</h1>
              <p style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
                {podeVerTodas ? 'Todas as auditorias' : `Suas auditorias — ${usuarioLogado.nome}`}
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

        {/* ═══ PAINEL DE FILTROS (componente reutilizável) ═══ */}
        <PainelFiltros
          filtros={filtros}
          titulo="🔍 Filtros"
          badge="auditorias"
          extras={extras}
        />

        {/* Ações */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={buscar} disabled={loading} style={{
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

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p>Carregando auditorias...</p>
          </div>
        ) : erroBusca ? (
          <div role="alert" style={{ padding: 24, color: '#b91c1c', background: '#fef2f2', borderRadius: 10 }}>{erroBusca}</div>
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
                        {a.nc_status === 'PENDENTE' && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef3c7', color: '#c2410c' }}>🟠 NC Pendente</span>}
                        {a.nc_status === 'TRATADA'  && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#15803d' }}>🟢 NC Tratada</span>}
                        <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 20 }}>{a.produtivo ? 'Produtivo' : 'Improdutivo'}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                        <span>👤 {a.fiscal}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>📅 {formatData(a.data_auditoria)} às {a.hora_auditoria}</span>
                        {a.numero_as && <>
                          <span style={{ margin: '0 8px' }}>·</span>
                          <span>No. AS: <strong>{a.numero_as}</strong></span>
                        </>}
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
                ['No. AS',         detalhe.numero_as],
                ['Tipo Auditoria', detalhe.tipo_auditoria === 'DESEMPENHO' ? '📊 Desempenho Op.' : '✅ Pós Serviço'],
                ['Tipo Serviço',   detalhe.tipo_servico + (detalhe.produtivo ? ' · Produtivo' : ' · Improdutivo')],
                ['Fiscal',         detalhe.fiscal],
                ['Matrícula',      detalhe.matricula],
                ['Equipe',         detalhe.prefixo],
                ['Sup. Campo',     filtros.mapPrefixo[detalhe.prefixo]?.campo],
                ['Sup. Operacional', filtros.mapPrefixo[detalhe.prefixo]?.op],
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

            {podeReabrir && !detalhe.reaberta && (
              <button onClick={abrirModalReabrir} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', marginBottom: 10, background: '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>🔓 Reabrir para Correção</button>
            )}

            <p style={{ textAlign: 'center', fontSize: 11, color: '#dc2626', margin: '0 0 10px', fontWeight: 600 }}>
              v{versaoSistema}
            </p>

            <button onClick={async () => {
              if (!Capacitor.isNativePlatform()) { imprimirAuditoria(detalhe, formatData); return }
              setGerandoPDF(true)
              try { await gerarPDFAuditoria(detalhe, formatData) }
              catch (err) { console.error('Erro ao gerar PDF:', err); alert('Não foi possível gerar o PDF: ' + descreverErro(err)) }
              finally { setGerandoPDF(false) }
            }} disabled={gerandoPDF} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', marginBottom: 10, background: gerandoPDF ? '#64748b' : '#1e3a5f', color: '#fff', fontSize: 14, fontWeight: 700, cursor: gerandoPDF ? 'not-allowed' : 'pointer' }}>
              {gerandoPDF ? '⏳ Gerando PDF...' : '🖨️ Imprimir / Salvar PDF'}
            </button>

            <button onClick={async () => {
              setCapturando(true)
              try {
                const conteudo = montarConteudoImpressaoAuditoria(detalhe, formatData)
                const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:20px;box-sizing:border-box;width:640px;">${conteudo}</div>`
                const canvas = await renderizarHtmlParaCanvas(html, {
                  largura: 640, escala: 6, aguardarImagens: true, esperaExtraMs: 80, corFundo: '#f0f4f8',
                })

                const nomeArq = `Auditoria_${detalhe.prefixo}_${detalhe.data_auditoria}.jpg`.replace(/\s+/g, '_')
                if (Capacitor.isNativePlatform()) {
                  await compartilharImagemNativo(canvas, nomeArq.replace(/\.jpg$/, '.png'), { titulo: `Auditoria ${detalhe.prefixo}` })
                } else if (navigator.share && navigator.canShare) {
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
                console.error(err); alert('Não foi possível gerar a imagem: ' + descreverErro(err))
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

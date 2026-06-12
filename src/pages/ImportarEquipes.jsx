import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

// ═══════════════════════════════════════════════════════════════════════
// 📌 SITUAÇÕES PERMITIDAS NA CARGA — EDITE AQUI PARA INCLUIR/REMOVER
// ─────────────────────────────────────────────────────────────────────
// Apenas eletricistas com `descr_situacao` nesta lista serão carregados
// na estrutura_equipes. Outras situações são silenciosamente ignoradas.
//
// IMPORTANTE: as alterações refletem automaticamente:
//   • na mensagem visual mostrada ao usuário no topo da tela
//   • no filtro de quais linhas do CSV são processadas
//   • na contagem do card "Ignoradas" do relatório final
//
// Para incluir nova situação, basta adicionar o valor em CAIXA ALTA:
//   ex: const SITUACOES_PERMITIDAS = ['ATIVO', 'RESERVA', 'AFASTADO']
//
// Eletricistas que mudarem de ATIVO/RESERVA para outra situação no CSV
// caem como "removidos" e vão pro historico_estrutura_equipes — não somem.
// ═══════════════════════════════════════════════════════════════════════
const SITUACOES_PERMITIDAS = ['ATIVO', 'RESERVA']
// ═══════════════════════════════════════════════════════════════════════

// ─── Helpers ──────────────────────────────────────────────────────────

function parseCsv(text) {
  const linhas = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  const [header, ...rows] = linhas
  const cols = header.split(';').map(c => c.trim().toLowerCase())
  console.log('🔍 [ImportarEquipes] Colunas detectadas no CSV:', cols)
  return {
    colunas: cols,
    rows: rows.map(row => {
      const vals = row.split(';')
      return cols.reduce((obj, col, i) => ({ ...obj, [col]: (vals[i] || '').trim() }), {})
    }),
  }
}

// ─── Detecção automática de encoding ──────────────────────────────────
// Tenta UTF-8 primeiro (com fatal:true → falha se houver byte inválido).
// Se falhar, faz fallback pra Windows-1252 (encoding padrão do Excel BR).
// Retorna { text, encoding } pra mostrar ao usuário qual foi detectado.
function decodeArrayBuffer(buffer) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return { text, encoding: 'UTF-8' }
  } catch {
    const text = new TextDecoder('windows-1252').decode(buffer)
    return { text, encoding: 'Windows-1252 (Excel BR)' }
  }
}

// Colunas obrigatórias/esperadas pra validar o CSV
const COLUNAS_ESPERADAS = [
  'regional', 'polo', 'base', 'prefixo', 'matricula', 'colaborador',
  'descr_situacao', 'placas', 'tipo_equipe', 'processo_equipe',
  'superv_campo', 'superv_operacao', 'coordenador',
]

const norm = s => (s || '').trim()
const hojeISO   = () => new Date().toISOString().split('T')[0]
const formatBR  = d => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

// Verifica se a situação do eletricista está na lista permitida
const situacaoPermitida = s => SITUACOES_PERMITIDAS.includes(norm(s).toUpperCase())

// Campos que, se mudarem, caracterizam "movimentação"
const CAMPOS_CONFIG = [
  'regional', 'polo', 'base', 'prefixo', 'placas',
  'tipo_equipe', 'processo_equipe',
  'superv_campo', 'superv_operacao',
  'coordenador', 'descr_situacao',
]

function configMudou(atual, novo) {
  return CAMPOS_CONFIG.some(c => norm(atual[c]) !== norm(novo[c]))
}

// Monta uma linha pra estrutura_equipes
function montarRegistro(r, idEletricista, timestamp) {
  return {
    id_eletricista:  idEletricista,
    regional:        r.regional        || '',
    polo:            r.polo            || '',
    base:            r.base            || '',
    prefixo:         r.prefixo         || '',
    matricula:       r.matricula       || '',
    colaborador:     r.colaborador     || '',
    descr_situacao:  r.descr_situacao  || '',
    placas:          r.placas          || '',
    tipo_equipe:     r.tipo_equipe     || '',
    processo_equipe: r.processo_equipe || '',
    superv_campo:    r.superv_campo    || '',
    superv_operacao: r.superv_operacao || '',
    coordenador:     r.coordenador     || '',
    carregado_em:    timestamp,
  }
}

// Monta uma linha pra historico_estrutura_equipes
function montarHistorico(linhaAtual, dataHoje, motivo) {
  return {
    id_eletricista:  linhaAtual.id_eletricista,
    regional:        linhaAtual.regional,
    polo:            linhaAtual.polo,
    base:            linhaAtual.base,
    prefixo:         linhaAtual.prefixo,
    matricula:       linhaAtual.matricula,
    colaborador:     linhaAtual.colaborador,
    descr_situacao:  linhaAtual.descr_situacao,
    placas:          linhaAtual.placas,
    tipo_equipe:     linhaAtual.tipo_equipe,
    processo_equipe: linhaAtual.processo_equipe,
    superv_campo:    linhaAtual.superv_campo,
    superv_operacao: linhaAtual.superv_operacao,
    coordenador:     linhaAtual.coordenador,
    vigencia_inicio: linhaAtual.carregado_em ? linhaAtual.carregado_em.split('T')[0] : null,
    vigencia_fim:    dataHoje,
    motivo_saida:    motivo,
  }
}

// ─── Componente ───────────────────────────────────────────────────────

export default function ImportarEquipes({ onVoltar }) {
  const [arquivo,        setArquivo]        = useState(null)
  const [preview,        setPreview]        = useState([])
  const [colunasCsv,     setColunasCsv]     = useState([])  // colunas detectadas no CSV
  const [encoding,       setEncoding]       = useState('')  // encoding detectado
  const [status,         setStatus]         = useState('idle')
  const [msg,            setMsg]            = useState('')
  const [progresso,      setProgresso]      = useState(0)
  const [etapa,          setEtapa]          = useState('')
  const [relatorio,      setRelatorio]      = useState(null)
  const [duplicadas,     setDuplicadas]     = useState([])
  const [abertos,        setAbertos]        = useState({})

  const toggleAberto = k => setAbertos(a => ({ ...a, [k]: !a[k] }))

  const onFile = e => {
    const file = e.target.files[0]
    if (!file) return
    setArquivo(file)
    setStatus('idle')
    setMsg('')
    setRelatorio(null)
    setDuplicadas([])
    setColunasCsv([])
    setEncoding('')
    const reader = new FileReader()
    reader.onload = ev => {
      // Detecta encoding (UTF-8 → Windows-1252 fallback)
      const { text, encoding: enc } = decodeArrayBuffer(ev.target.result)
      setEncoding(enc)
      console.log(`📝 [ImportarEquipes] Encoding detectado: ${enc}`)
      const { colunas, rows } = parseCsv(text)
      setColunasCsv(colunas)
      setPreview(rows.slice(0, 5))
    }
    reader.readAsArrayBuffer(file)
  }

  const importar = async () => {
    if (!arquivo) return
    if (!window.confirm(
      `Confirma a importação?\n\nO sistema vai:\n` +
      `• Identificar novos eletricistas\n` +
      `• Detectar quem voltou ao quadro\n` +
      `• Salvar movimentações no histórico\n` +
      `• Atualizar a estrutura atual\n\n` +
      `Eletricistas que sumirem do CSV vão pro histórico.`
    )) return

    setStatus('loading')
    setMsg('')
    setProgresso(0)
    setEtapa('')
    setRelatorio(null)
    setDuplicadas([])

    try {
      // ─── 1. LER CSV ─────────────────────────────────────────────────
      setEtapa('📂 Lendo arquivo...')
      const buffer = await arquivo.arrayBuffer()
      const { text, encoding: enc } = decodeArrayBuffer(buffer)
      setEncoding(enc)
      const { colunas, rows } = parseCsv(text)
      setColunasCsv(colunas)
      setProgresso(10)

      // ─── 2. FILTRAR LINHAS-FANTASMA E SITUAÇÕES NÃO PERMITIDAS ──────
      setEtapa('🔍 Validando dados...')
      const ignoradas = []
      const validas   = []
      for (const r of rows) {
        if (!norm(r.matricula) || !norm(r.colaborador)) {
          // Vagas em aberto (sem matrícula ou colaborador)
          ignoradas.push({
            ...r,
            _motivo: !norm(r.matricula) ? 'sem matrícula (vaga em aberto)' : 'sem colaborador',
          })
        } else if (!situacaoPermitida(r.descr_situacao)) {
          // Situação não está na lista permitida (ATIVO/RESERVA por padrão)
          ignoradas.push({
            ...r,
            _motivo: `situação "${r.descr_situacao || 'em branco'}" não permitida`,
          })
        } else {
          validas.push(r)
        }
      }

      if (validas.length === 0) {
        throw new Error(
          `Nenhuma linha válida no CSV. Verifique se as linhas têm matrícula, ` +
          `colaborador e situação dentro das permitidas (${SITUACOES_PERMITIDAS.join(' ou ')}).`
        )
      }
      setProgresso(20)

      // ─── 3. DETECTAR DUPLICAÇÃO DE MATRÍCULA NO CSV ─────────────────
      const matriculasCount = {}
      const matriculaNomes  = {}
      for (const r of validas) {
        matriculasCount[r.matricula] = (matriculasCount[r.matricula] || 0) + 1
        if (!matriculaNomes[r.matricula]) matriculaNomes[r.matricula] = new Set()
        matriculaNomes[r.matricula].add(r.colaborador)
      }
      const dups = Object.entries(matriculasCount)
        .filter(([, c]) => c > 1)
        .map(([m, c]) => ({
          matricula: m,
          quantidade: c,
          nomes: Array.from(matriculaNomes[m]),
        }))

      if (dups.length > 0) {
        setDuplicadas(dups)
        throw new Error(
          `${dups.length} matrícula(s) duplicada(s) no CSV. ` +
          `Cada eletricista deve aparecer apenas uma vez. ` +
          `Corrija o arquivo e tente novamente.`
        )
      }
      setProgresso(25)

      // ─── 4. BUSCAR ESTADO ATUAL ────────────────────────────────────
      setEtapa('📊 Comparando com a base atual...')

      const { data: atualData, error: errAtual } = await supabase
        .from('estrutura_equipes').select('*')
      if (errAtual) throw errAtual

      const { data: mestreData, error: errMestre } = await supabase
        .from('eletricistas_cadastro').select('id_eletricista, matricula, nome')
      if (errMestre) throw errMestre

      const { data: histData, error: errHist } = await supabase
        .from('historico_estrutura_equipes').select('matricula')
      if (errHist) throw errHist

      const atualMap     = new Map((atualData  || []).map(a => [a.matricula, a]))
      const mestreMap    = new Map((mestreData || []).map(m => [m.matricula, m]))
      const historicoSet = new Set((histData   || []).map(h => h.matricula))
      setProgresso(35)

      // ─── 5. CLASSIFICAR ────────────────────────────────────────────
      const novos         = []  // entram pela 1ª vez no sistema
      const voltaram      = []  // já existiam no mestre/histórico, voltam pra estrutura
      const mantidos      = []  // mesma configuração, nada mudou
      const movimentados  = []  // mudou prefixo/superv/etc

      for (const r of validas) {
        const noAtual   = atualMap.get(r.matricula)
        const noMestre  = mestreMap.get(r.matricula)
        const noHist    = historicoSet.has(r.matricula)

        if (noAtual) {
          // já está ativo na estrutura
          if (configMudou(noAtual, r)) {
            movimentados.push({ atual: noAtual, novo: r, idEletricista: noMestre?.id_eletricista })
          } else {
            mantidos.push({ atual: noAtual, novo: r, idEletricista: noMestre?.id_eletricista })
          }
        } else {
          // não está ativo
          if (noMestre || noHist) {
            voltaram.push({ novo: r, idEletricista: noMestre?.id_eletricista })
          } else {
            novos.push({ novo: r })
          }
        }
      }

      // Quem está no atual mas NÃO está no CSV → removido
      const matriculasCsv = new Set(validas.map(r => r.matricula))
      const removidos = (atualData || []).filter(a =>
        a.matricula && !matriculasCsv.has(a.matricula)
      )
      setProgresso(45)

      // ─── 6. UPSERT NO MESTRE ───────────────────────────────────────
      setEtapa('💾 Atualizando cadastro mestre...')
      const agora = new Date().toISOString()

      const upsertPayload = validas.map(r => ({
        matricula:     r.matricula,
        nome:          r.colaborador,
        atualizado_em: agora,
      }))

      // upsert em lotes de 100
      for (let i = 0; i < upsertPayload.length; i += 100) {
        const lote = upsertPayload.slice(i, i + 100)
        const { error } = await supabase
          .from('eletricistas_cadastro')
          .upsert(lote, { onConflict: 'matricula' })
        if (error) throw error
      }
      setProgresso(55)

      // Busca todos os IDs (mestre atualizado) → mapa por matrícula
      const matriculas = validas.map(r => r.matricula)
      const idsAtuais = []
      // Busca em lotes de 200 (limite de URL)
      for (let i = 0; i < matriculas.length; i += 200) {
        const lote = matriculas.slice(i, i + 200)
        const { data, error } = await supabase
          .from('eletricistas_cadastro')
          .select('id_eletricista, matricula')
          .in('matricula', lote)
        if (error) throw error
        idsAtuais.push(...(data || []))
      }
      const idMap = new Map(idsAtuais.map(i => [i.matricula, i.id_eletricista]))
      setProgresso(60)

      // ─── 7. INSERIR NO HISTÓRICO ───────────────────────────────────
      setEtapa('📜 Salvando histórico...')
      const dataHoje = hojeISO()
      const linhasHistorico = []

      movimentados.forEach(m => {
        linhasHistorico.push(montarHistorico(
          m.atual, dataHoje,
          `Alteração de configuração na carga de ${formatBR(dataHoje)}`
        ))
      })

      removidos.forEach(r => {
        linhasHistorico.push(montarHistorico(
          r, dataHoje,
          `Removido da estrutura na carga de ${formatBR(dataHoje)}`
        ))
      })

      // Filtra histórico: só insere se tiver id_eletricista (segurança)
      const linhasHistoricoValidas = linhasHistorico.filter(h => h.id_eletricista)

      if (linhasHistoricoValidas.length > 0) {
        for (let i = 0; i < linhasHistoricoValidas.length; i += 100) {
          const lote = linhasHistoricoValidas.slice(i, i + 100)
          const { error } = await supabase
            .from('historico_estrutura_equipes').insert(lote)
          if (error) throw error
        }
      }
      setProgresso(70)

      // ─── 8. LIMPAR ESTRUTURA_EQUIPES ───────────────────────────────
      setEtapa('🧹 Limpando estrutura atual...')
      const { error: errDelete } = await supabase
        .from('estrutura_equipes').delete().neq('id', 0)
      if (errDelete) throw errDelete
      setProgresso(75)

      // ─── 9. INSERIR NOVA ESTRUTURA ─────────────────────────────────
      setEtapa('📥 Carregando nova estrutura...')
      const novaEstrutura = []

      novos.forEach(n => {
        const id = idMap.get(n.novo.matricula)
        if (id) novaEstrutura.push(montarRegistro(n.novo, id, agora))
      })
      voltaram.forEach(v => {
        const id = idMap.get(v.novo.matricula)
        if (id) novaEstrutura.push(montarRegistro(v.novo, id, agora))
      })
      mantidos.forEach(m => {
        const id = idMap.get(m.novo.matricula)
        if (id) novaEstrutura.push(montarRegistro(m.novo, id, agora))
      })
      movimentados.forEach(m => {
        const id = idMap.get(m.novo.matricula)
        if (id) novaEstrutura.push(montarRegistro(m.novo, id, agora))
      })

      const TOTAL_LOTE = 100
      for (let i = 0; i < novaEstrutura.length; i += TOTAL_LOTE) {
        const lote = novaEstrutura.slice(i, i + TOTAL_LOTE)
        const { error } = await supabase
          .from('estrutura_equipes').insert(lote)
        if (error) throw error
        setProgresso(75 + Math.round(((i + TOTAL_LOTE) / novaEstrutura.length) * 25))
      }
      setProgresso(100)
      setEtapa('✅ Concluído!')

      // ─── 10. RELATÓRIO ─────────────────────────────────────────────
      setRelatorio({
        novos:         novos.map(n => ({ matricula: n.novo.matricula, nome: n.novo.colaborador, prefixo: n.novo.prefixo })),
        voltaram:      voltaram.map(v => ({ matricula: v.novo.matricula, nome: v.novo.colaborador, prefixo: v.novo.prefixo })),
        mantidos:      mantidos.map(m => ({ matricula: m.novo.matricula, nome: m.novo.colaborador, prefixo: m.novo.prefixo })),
        movimentados:  movimentados.map(m => ({
          matricula: m.novo.matricula,
          nome:      m.novo.colaborador,
          prefixo_antigo: m.atual.prefixo,
          prefixo_novo:   m.novo.prefixo,
        })),
        removidos:     removidos.map(r => ({ matricula: r.matricula, nome: r.colaborador, prefixo: r.prefixo })),
        ignoradas:     ignoradas.map(i => ({
          prefixo:   i.prefixo   || '—',
          matricula: i.matricula || '—',
          nome:      i.colaborador || '—',
          motivo:    i._motivo,
        })),
        total:         novaEstrutura.length,
      })

      setStatus('success')
      setMsg(`✅ Importação concluída! ${novaEstrutura.length} eletricistas na estrutura atual.`)

    } catch (err) {
      setStatus('error')
      setMsg('❌ ' + (err.message || String(err)))
      setEtapa('')
    }
  }

  // ─── Cards do relatório ─────────────────────────────────────────────
  const CARDS = relatorio ? [
    { key: 'novos',        emoji: '✨', label: 'Novos',         lista: relatorio.novos,        cor: '#15803d', bg: '#dcfce7', borda: '#86efac',
      desc: 'Entraram no sistema pela 1ª vez' },
    { key: 'voltaram',     emoji: '🔄', label: 'Voltaram',      lista: relatorio.voltaram,     cor: '#1e40af', bg: '#dbeafe', borda: '#93c5fd',
      desc: 'Estavam no histórico, voltaram à estrutura' },
    { key: 'mantidos',     emoji: '➡️', label: 'Mantidos',      lista: relatorio.mantidos,     cor: '#64748b', bg: '#f1f5f9', borda: '#cbd5e1',
      desc: 'Mesma configuração, sem alterações' },
    { key: 'movimentados', emoji: '🔀', label: 'Movimentados', lista: relatorio.movimentados, cor: '#b45309', bg: '#fef3c7', borda: '#fcd34d',
      desc: 'Mudaram prefixo, supervisor, base ou outros campos' },
    { key: 'removidos',    emoji: '📤', label: 'Removidos',     lista: relatorio.removidos,    cor: '#b91c1c', bg: '#fee2e2', borda: '#fca5a5',
      desc: 'Saíram da estrutura, foram pro histórico' },
    { key: 'ignoradas',    emoji: '⏭️', label: 'Ignoradas',     lista: relatorio.ignoradas,    cor: '#475569', bg: '#f8fafc', borda: '#e2e8f0',
      desc: 'Vagas em aberto ou situação não permitida' },
  ] : []

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* Header */}
      <div style={{ background: '#0f766e', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>
            ← Voltar para Home
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>📥 Importar Estrutura de Equipes</h1>
          <p style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
            Carga inteligente com rastreabilidade de movimentações
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px 60px' }}>

        {/* Banner — situações permitidas (dinâmico a partir de SITUACOES_PERMITIDAS) */}
        <div style={{
          background: '#eff6ff', border: '1.5px solid #93c5fd',
          borderRadius: 12, padding: '12px 16px', marginBottom: 16,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>ℹ️</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>
              Situações aceitas nesta carga
            </p>
            <p style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 1.5 }}>
              Apenas eletricistas com <strong>descr_situacao</strong> igual a{' '}
              {SITUACOES_PERMITIDAS.map((s, i) => (
                <span key={s}>
                  <span style={{
                    background: '#dbeafe', color: '#1e40af', padding: '1px 8px',
                    borderRadius: 6, fontWeight: 700, fontSize: 11, margin: '0 2px',
                  }}>{s}</span>
                  {i < SITUACOES_PERMITIDAS.length - 1 && (i === SITUACOES_PERMITIDAS.length - 2 ? ' ou ' : ', ')}
                </span>
              ))}
              {' '}serão carregados. Outras situações serão ignoradas silenciosamente
              (você verá quantas no relatório final).
            </p>
          </div>
        </div>

        {/* Como funciona */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>💡 Como funciona</p>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
            Cada eletricista tem um <strong>ID permanente</strong> vinculado pela matrícula. Quando você faz uma nova carga:
            <ul style={{ marginTop: 8, paddingLeft: 20 }}>
              <li><strong>Novos</strong> ganham um ID na 1ª aparição</li>
              <li><strong>Quem voltou</strong> reusa o ID antigo (rastreabilidade preservada)</li>
              <li><strong>Quem sumiu</strong> do CSV vai pro histórico</li>
              <li><strong>Movimentações</strong> (prefixo/supervisor/etc) viram snapshots no histórico</li>
              <li><strong>Linhas sem matrícula</strong> (vagas em aberto) são ignoradas</li>
            </ul>
          </div>
        </div>

        {/* Zona de upload */}
        <label style={{ cursor: 'pointer', display: 'block' }}>
          <input type="file" accept=".csv" onChange={onFile} style={{ display: 'none' }} />
          <div style={{
            border: '2px dashed #99f6e4', borderRadius: 14, padding: 28,
            textAlign: 'center', background: arquivo ? '#f0fdfa' : '#fff',
            marginBottom: 16, transition: 'all 0.2s',
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📂</div>
            <p style={{ color: '#0f766e', fontWeight: 700, fontSize: 15 }}>
              {arquivo ? arquivo.name : 'Clique para selecionar o arquivo CSV'}
            </p>
            <p style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
              Formato: separado por ponto-e-vírgula (;) — UTF-8 ou Windows-1252 (auto)
            </p>
          </div>
        </label>

        {/* DIAGNÓSTICO DE COLUNAS DO CSV */}
        {colunasCsv.length > 0 && !relatorio && (() => {
          const detectadas = new Set(colunasCsv)
          const faltando   = COLUNAS_ESPERADAS.filter(c => !detectadas.has(c))
          const extras     = colunasCsv.filter(c => !COLUNAS_ESPERADAS.includes(c))
          const tudoOk     = faltando.length === 0

          return (
            <div style={{
              background: tudoOk ? '#f0fdf4' : '#fef3c7',
              border: `1.5px solid ${tudoOk ? '#86efac' : '#fcd34d'}`,
              borderRadius: 12, padding: '12px 16px', marginBottom: 16,
            }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: tudoOk ? '#15803d' : '#b45309', marginBottom: 8 }}>
                {tudoOk ? '✅ Colunas do CSV — Todas detectadas' : '⚠️ Colunas do CSV — Faltando ou diferentes!'}
              </p>

              {encoding && (
                <div style={{ marginBottom: 10 }}>
                  <span style={{
                    fontSize: 10, padding: '3px 10px', borderRadius: 12, fontWeight: 700,
                    background: '#dbeafe', color: '#1e3a8a',
                  }}>
                    📝 Encoding detectado: {encoding}
                  </span>
                </div>
              )}

              <p style={{ fontSize: 11, color: '#374151', marginBottom: 6, fontWeight: 600 }}>
                Colunas no seu arquivo ({colunasCsv.length}):
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {colunasCsv.map(c => (
                  <span key={c} style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 700,
                    background: COLUNAS_ESPERADAS.includes(c) ? '#dcfce7' : '#e0e7ff',
                    color:      COLUNAS_ESPERADAS.includes(c) ? '#15803d' : '#3730a3',
                  }}>
                    {COLUNAS_ESPERADAS.includes(c) ? '✓' : 'ℹ️'} {c}
                  </span>
                ))}
              </div>

              {faltando.length > 0 && (
                <div style={{ marginTop: 8, padding: 10, background: '#fee2e2', borderRadius: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#b91c1c', marginBottom: 4 }}>
                    ❌ Colunas esperadas que NÃO foram encontradas:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {faltando.map(c => (
                      <span key={c} style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 700,
                        background: '#fecaca', color: '#7f1d1d',
                      }}>
                        ✗ {c}
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: 10, color: '#7f1d1d', marginTop: 6, lineHeight: 1.5 }}>
                    Essas colunas serão importadas como vazio. Verifique se o nome no
                    cabeçalho do CSV bate exatamente (sem espaços, hífens ou acentos).
                  </p>
                </div>
              )}

              {extras.length > 0 && (
                <p style={{ fontSize: 10, color: '#475569', marginTop: 6 }}>
                  ℹ️ Colunas extras no CSV (não serão usadas): {extras.join(', ')}
                </p>
              )}
            </div>
          )
        })()}

        {/* Preview */}
        {preview.length > 0 && !relatorio && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
              👁️ Preview (5 primeiros registros):
            </p>
            {preview.map((r, i) => (
              <div key={i} style={{
                fontSize: 11, color: '#475569', padding: '6px 0',
                borderBottom: i < preview.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}>
                <strong>{r.prefixo}</strong> · {r.matricula} · {r.colaborador} · {r.base} · {r.descr_situacao}
                {r.processo_equipe && (
                  <span style={{ color: '#0f766e', fontWeight: 700 }}> · ⚙️ {r.processo_equipe}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Duplicação no CSV */}
        {duplicadas.length > 0 && (
          <div style={{
            background: '#fef2f2', border: '1.5px solid #fca5a5',
            borderRadius: 12, padding: 14, marginBottom: 16,
          }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#b91c1c', marginBottom: 10 }}>
              ⚠️ Matrículas duplicadas no CSV ({duplicadas.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {duplicadas.map((d, i) => (
                <div key={i} style={{
                  background: '#fff', borderRadius: 8, padding: '8px 12px',
                  fontSize: 12, color: '#7f1d1d',
                }}>
                  <strong>Matrícula {d.matricula}</strong> — {d.quantidade}x · Nome(s): {d.nomes.join(' / ')}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#991b1b', marginTop: 10 }}>
              Corrija o arquivo (cada eletricista deve aparecer apenas uma vez) e tente novamente.
            </p>
          </div>
        )}

        {/* Progresso */}
        {status === 'loading' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: 600 }}>{etapa}</p>
            <div style={{ background: '#e2e8f0', borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: 8, borderRadius: 4, background: '#0f766e', width: `${progresso}%`, transition: 'width 0.3s' }} />
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>{progresso}%</p>
          </div>
        )}

        {/* Mensagem resultado */}
        {msg && (
          <div style={{
            background: status === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${status === 'success' ? '#86efac' : '#fecaca'}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 16,
            fontSize: 14, fontWeight: 600,
            color: status === 'success' ? '#15803d' : '#b91c1c',
          }}>
            {msg}
          </div>
        )}

        {/* RELATÓRIO */}
        {relatorio && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>
              📊 Relatório da carga
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {CARDS.map(c => (
                <div key={c.key}
                  onClick={() => c.lista.length > 0 && toggleAberto(c.key)}
                  style={{
                    background: c.bg, border: `1.5px solid ${c.borda}`,
                    borderRadius: 12, padding: 12,
                    cursor: c.lista.length > 0 ? 'pointer' : 'default',
                    opacity: c.lista.length > 0 ? 1 : 0.6,
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <span style={{ fontSize: 22 }}>{c.emoji}</span>
                    <span style={{ fontSize: 22, fontWeight: 900, color: c.cor, lineHeight: 1 }}>
                      {c.lista.length}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: c.cor }}>{c.label}</p>
                  <p style={{ fontSize: 10, color: c.cor, opacity: 0.75, marginTop: 2 }}>
                    {c.desc}
                  </p>
                  {c.lista.length > 0 && (
                    <p style={{ fontSize: 10, color: c.cor, opacity: 0.6, marginTop: 6, fontWeight: 700 }}>
                      {abertos[c.key] ? '▲ Recolher' : '▼ Ver detalhes'}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Listas expansíveis */}
            {CARDS.filter(c => abertos[c.key] && c.lista.length > 0).map(c => (
              <div key={c.key + '-detail'} style={{
                marginTop: 12,
                background: '#fff', border: `1.5px solid ${c.borda}`,
                borderRadius: 12, overflow: 'hidden',
              }}>
                <div style={{ background: c.bg, padding: '8px 14px', borderBottom: `1px solid ${c.borda}` }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: c.cor }}>
                    {c.emoji} {c.label} ({c.lista.length})
                  </p>
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {c.lista.map((item, i) => (
                    <div key={i} style={{
                      padding: '8px 14px', fontSize: 12, color: '#475569',
                      borderBottom: i < c.lista.length - 1 ? '1px solid #f1f5f9' : 'none',
                      background: i % 2 === 0 ? '#fff' : '#fafbfc',
                    }}>
                      {c.key === 'movimentados' ? (
                        <>
                          <strong>{item.matricula}</strong> · {item.nome}
                          <span style={{ color: '#94a3b8' }}> · {item.prefixo_antigo} </span>
                          <span style={{ color: c.cor }}>→ {item.prefixo_novo}</span>
                        </>
                      ) : c.key === 'ignoradas' ? (
                        <>
                          <strong>{item.prefixo}</strong>
                          {item.matricula !== '—' && <span> · {item.matricula}</span>}
                          {item.nome !== '—'      && <span> · {item.nome}</span>}
                          <span style={{ color: '#94a3b8' }}> · {item.motivo}</span>
                        </>
                      ) : (
                        <>
                          <strong>{item.matricula}</strong> · {item.nome}
                          <span style={{ color: '#94a3b8' }}> · {item.prefixo}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{
              marginTop: 14, background: '#0f766e', color: '#fff',
              borderRadius: 10, padding: '10px 14px',
              fontSize: 13, fontWeight: 700, textAlign: 'center',
            }}>
              ✅ Total na estrutura atual: <span style={{ fontSize: 18 }}>{relatorio.total}</span> eletricista(s)
            </div>
          </div>
        )}

        {/* Botão importar */}
        {arquivo && status !== 'loading' && (
          <button onClick={importar} style={{
            width: '100%', padding: 14, borderRadius: 12, border: 'none',
            background: '#0f766e', color: '#fff', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', marginBottom: 10,
          }}>
            {relatorio ? '🔄 Nova Importação' : '📥 Importar Agora'}
          </button>
        )}

        {/* Info */}
        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe',
          borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#1e40af',
        }}>
          ℹ️ A importação <strong>não apaga histórico</strong>: alterações geram snapshots em <code>historico_estrutura_equipes</code>.
          Cada eletricista mantém seu ID permanente vinculado pela matrícula.
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import * as XLSX from 'xlsx'

const STATUS_COR = {
  'ATENDE':         { bg: '#dcfce7', color: '#15803d' },
  'ATENDE PARCIAL': { bg: '#fef3c7', color: '#92400e' },
  'NÃO ATENDE':     { bg: '#fee2e2', color: '#dc2626' },
}

const TIPO_SERVICO_EMOJI = { CORTE: '✂️', ANEXO: '🔌', RELIGA: '⚡' }

function calcMesAtual() {
  const hoje = new Date()
  const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0]
  const fim  = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]
  return { ini, fim }
}

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
      <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type="text" value={value}
        onChange={e => { onChange(e.target.value); setAberto(true) }}
        onFocus={() => suggestions.length > 0 && setAberto(true)}
        placeholder={placeholder}
        className="form-input"
        style={{ fontSize: 13, padding: '8px 10px' }}
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

export default function HistoricoAuditorias({ usuarioLogado, onVoltar }) {
  const [auditorias,   setAuditorias]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [exportando,   setExportando]   = useState(false)
  const [detalhe,      setDetalhe]      = useState(null)
  const [filtros,      setFiltros]      = useState({
    dataIni:     calcMesAtual().ini,
    dataFim:     calcMesAtual().fim,
    fiscal:      '',
    prefixo:     '',
    tipoServico: '',
    status:      '',
  })
  const [totais,      setTotais]      = useState({ total: 0, atende: 0, parcial: 0, naoAtende: 0 })
  const [fiscalSugs,  setFiscalSugs]  = useState([])
  const [prefixoSugs, setPrefixoSugs] = useState([])

  const isAdmin = usuarioLogado?.perfil === 'ADMIN' ||
                  usuarioLogado?.perfil === 'SUPERV. OPERAÇÃO' ||
                  usuarioLogado?.perfil === 'SUPERV. CAMPO'

  const buscar = async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('auditorias').select('*')
        .gte('data_auditoria', filtros.dataIni)
        .lte('data_auditoria', filtros.dataFim)
        .order('data_auditoria', { ascending: false })
        .order('hora_auditoria', { ascending: false })

      if (!isAdmin) q = q.eq('matricula', usuarioLogado.matricula)
      if (filtros.fiscal)      q = q.ilike('fiscal',      `%${filtros.fiscal}%`)
      if (filtros.prefixo)     q = q.ilike('prefixo',     `%${filtros.prefixo}%`)
      if (filtros.tipoServico) q = q.eq('tipo_servico',   filtros.tipoServico)
      if (filtros.status)      q = q.eq('status',         filtros.status)

      const { data, error } = await q
      if (error) throw error

      setAuditorias(data || [])
      setTotais({
        total:     data.length,
        atende:    data.filter(a => a.status === 'ATENDE').length,
        parcial:   data.filter(a => a.status === 'ATENDE PARCIAL').length,
        naoAtende: data.filter(a => a.status === 'NÃO ATENDE').length,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { buscar() }, [])

  const upd = (k, v) => setFiltros(f => ({ ...f, [k]: v }))
  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const onFiscalChange = async v => {
    upd('fiscal', v)
    if (v.length < 2) { setFiscalSugs([]); return }
    const { data } = await supabase
      .from('auditorias').select('fiscal')
      .ilike('fiscal', `%${v}%`).limit(8)
    if (data) setFiscalSugs([...new Set(data.map(r => r.fiscal).filter(Boolean))])
  }

  const onPrefixoChange = async v => {
    upd('prefixo', v)
    if (v.length < 2) { setPrefixoSugs([]); return }
    const { data } = await supabase
      .from('estrutura_equipes').select('prefixo')
      .ilike('prefixo', `%${v}%`).order('prefixo').limit(10)
    if (data) setPrefixoSugs([...new Set(data.map(r => r.prefixo))])
  }

  // ============================================================
  // EXPORTAR EXCEL
  // ============================================================
  const exportarExcel = async () => {
    if (auditorias.length === 0) { alert('Nenhuma auditoria para exportar. Faça uma busca primeiro.'); return }
    setExportando(true)
    try {
      // Monta as linhas do Excel
      const linhas = auditorias.map(a => ({
        'Data':              formatData(a.data_auditoria),
        'Hora':              a.hora_auditoria || '',
        'Fiscal':            a.fiscal || '',
        'Matrícula':         a.matricula || '',
        'Equipe (Prefixo)':  a.prefixo || '',
        'OS':                a.os || '',
        'UC':                a.uc || '',
        'Tipo Auditoria':    a.tipo_auditoria === 'DESEMPENHO' ? 'Desempenho Operacional' : 'Pós Serviço',
        'Tipo Serviço':      a.tipo_servico || '',
        'Produtivo':         a.produtivo ? 'SIM' : 'NÃO',
        'Nota':              Number(a.nota).toFixed(1),
        'Resultado':         a.status || '',
        'Endereço':          a.endereco || '',
        'Latitude':          a.lat || '',
        'Longitude':         a.lng || '',
        'Eletricista 1':     a.nome_eletricista || '',
        'Eletricista 2':     a.nome_eletricista2 || '',
        'Feedback Fiscal':   a.feedback || '',
        'Observações':       a.observacoes || '',
        'Qtd Fotos':         Array.isArray(a.fotos_urls) ? a.fotos_urls.length : 0,
      }))

      // Cria planilha
      const ws = XLSX.utils.json_to_sheet(linhas)

      // Largura das colunas
      ws['!cols'] = [
        { wch: 12 }, { wch: 8  }, { wch: 30 }, { wch: 12 }, { wch: 16 },
        { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 12 },
        { wch: 8  }, { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 12 },
        { wch: 30 }, { wch: 30 }, { wch: 40 }, { wch: 40 }, { wch: 10 },
      ]

      // Cria workbook com aba principal + aba de totais
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Auditorias')

      // Aba de resumo
      const resumo = [
        ['RELATÓRIO DE AUDITORIAS — DPL CONSTRUÇÕES'],
        ['Contrato Equatorial Energia 1021/2024'],
        [''],
        ['Período', `${formatData(filtros.dataIni)} a ${formatData(filtros.dataFim)}`],
        ['Gerado em', new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })],
        [''],
        ['TOTALIZADORES', ''],
        ['Total de Auditorias', totais.total],
        ['Atende (≥ 90)',       totais.atende],
        ['Atende Parcial (80–89)', totais.parcial],
        ['Não Atende (< 80)',   totais.naoAtende],
        [''],
        ['% Conformidade', totais.total > 0
          ? `${((totais.atende / totais.total) * 100).toFixed(1)}%`
          : '0%'],
        ['Nota Média', auditorias.length > 0
          ? (auditorias.reduce((acc, a) => acc + Number(a.nota), 0) / auditorias.length).toFixed(1)
          : '0'],
      ]
      const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
      wsResumo['!cols'] = [{ wch: 28 }, { wch: 30 }]
      XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo')

      // Nome do arquivo
      const nomeArquivo = `Auditorias_DPL_${filtros.dataIni}_${filtros.dataFim}.xlsx`
      XLSX.writeFile(wb, nomeArquivo)
    } catch (e) {
      console.error('Erro ao exportar:', e)
      alert('Erro ao gerar Excel. Tente novamente.')
    } finally {
      setExportando(false)
    }
  }

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
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📁 Histórico de Auditorias</h1>
              <p style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
                {isAdmin ? 'Todas as auditorias' : `Suas auditorias — ${usuarioLogado.nome}`}
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

        {/* FILTROS */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            Filtros
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
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
            {isAdmin && (
              <DropdownInput
                label="Fiscal"
                value={filtros.fiscal}
                onChange={onFiscalChange}
                onSelect={v => { upd('fiscal', v); setFiscalSugs([]) }}
                suggestions={fiscalSugs}
                placeholder="Digite o nome..."
              />
            )}
            <DropdownInput
              label="Prefixo"
              value={filtros.prefixo}
              onChange={onPrefixoChange}
              onSelect={v => { upd('prefixo', v); setPrefixoSugs([]) }}
              suggestions={prefixoSugs}
              placeholder="Ex: PI-THE"
            />
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Tipo Serviço</label>
              <select value={filtros.tipoServico} onChange={e => upd('tipoServico', e.target.value)}
                className="form-input" style={{ fontSize: 13, padding: '8px 10px' }}>
                <option value="">Todos</option>
                <option value="CORTE">Corte/Recorte</option>
                <option value="ANEXO">Anexo</option>
                <option value="RELIGA">Religa</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Resultado</label>
              <select value={filtros.status} onChange={e => upd('status', e.target.value)}
                className="form-input" style={{ fontSize: 13, padding: '8px 10px' }}>
                <option value="">Todos</option>
                <option value="ATENDE">Atende</option>
                <option value="ATENDE PARCIAL">Atende Parcial</option>
                <option value="NÃO ATENDE">Não Atende</option>
              </select>
            </div>
          </div>

          {/* Botões de ação */}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={buscar} style={{
              padding: '10px 24px', background: '#1e3a5f', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              🔍 Buscar
            </button>
            <button
              onClick={exportarExcel}
              disabled={exportando || auditorias.length === 0}
              style={{
                padding: '10px 24px', border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 700, cursor: auditorias.length === 0 ? 'not-allowed' : 'pointer',
                background: exportando || auditorias.length === 0 ? '#e2e8f0' : '#16a34a',
                color: exportando || auditorias.length === 0 ? '#94a3b8' : '#fff',
              }}
            >
              {exportando ? '⏳ Gerando...' : `📊 Exportar Excel (${auditorias.length})`}
            </button>
          </div>
        </div>

        {/* LISTA */}
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
                  border: `1.5px solid ${a.status === 'ATENDE' ? '#86efac' : a.status === 'NÃO ATENDE' ? '#fca5a5' : '#fcd34d'}`,
                  padding: '14px 16px', cursor: 'pointer', transition: 'box-shadow 0.15s',
                }}
                  onClick={() => setDetalhe(a)}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 18 }}>{TIPO_SERVICO_EMOJI[a.tipo_servico] || '📋'}</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{a.prefixo}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                          {a.status}
                        </span>
                        <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 20 }}>
                          {a.produtivo ? 'Produtivo' : 'Improdutivo'}
                        </span>
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
                    <div style={{
                      minWidth: 52, height: 52, borderRadius: 12,
                      background: sc.bg, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', marginLeft: 12,
                    }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: sc.color, lineHeight: 1 }}>
                        {Number(a.nota).toFixed(0)}
                      </span>
                      <span style={{ fontSize: 9, color: sc.color, opacity: 0.8 }}>pts</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODAL DETALHE */}
      {detalhe && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
        }}
          onClick={e => { if (e.target === e.currentTarget) setDetalhe(null) }}
        >
          <div style={{
            background: '#fff', borderRadius: '20px 20px 0 0',
            width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto',
            padding: '24px 20px 40px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>
                {TIPO_SERVICO_EMOJI[detalhe.tipo_servico]} {detalhe.prefixo}
              </h3>
              <button onClick={() => setDetalhe(null)} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b',
              }}>×</button>
            </div>

            {(() => {
              const sc = STATUS_COR[detalhe.status] || { bg: '#f1f5f9', color: '#374151' }
              return (
                <div style={{
                  background: sc.bg, border: `2px solid ${sc.color}22`,
                  borderRadius: 14, padding: '16px', textAlign: 'center', marginBottom: 16,
                }}>
                  <div style={{ fontSize: 44, fontWeight: 900, color: sc.color, lineHeight: 1 }}>
                    {Number(detalhe.nota).toFixed(0)}
                  </div>
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
                <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  Fotos ({detalhe.fotos_urls.length})
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {detalhe.fotos_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={`Foto ${i + 1}`}
                        style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {detalhe.assinatura_url && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  Assinatura — {detalhe.nome_eletricista || 'Eletricista 1'}
                </p>
                <img src={detalhe.assinatura_url} alt="Assinatura 1"
                  style={{ width: '100%', borderRadius: 8, background: '#fafafa', border: '1px solid #f1f5f9' }} />
              </div>
            )}
            {detalhe.assinatura2_url && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  Assinatura — {detalhe.nome_eletricista2 || 'Eletricista 2'}
                </p>
                <img src={detalhe.assinatura2_url} alt="Assinatura 2"
                  style={{ width: '100%', borderRadius: 8, background: '#fafafa', border: '1px solid #f1f5f9' }} />
              </div>
            )}

            <button onClick={() => setDetalhe(null)} style={{
              width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0',
              background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8,
            }}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

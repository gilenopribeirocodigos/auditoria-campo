import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function mesLabel(mesAno) {
  const [ano, mes] = mesAno.split('-')
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${nomes[parseInt(mes) - 1]}/${ano}`
}

function barColor(pct) {
  if (pct >= 100) return '#16a34a'
  if (pct >= 70)  return '#d97706'
  return '#dc2626'
}

function conceito(notaMedia) {
  if (notaMedia === '—' || notaMedia === null) return null
  const n = parseFloat(notaMedia)
  if (n >= 90) return { label: 'Excelente', emoji: '🏆', bg: '#dcfce7', color: '#15803d' }
  if (n >= 80) return { label: 'Bom',       emoji: '✅', bg: '#dbeafe', color: '#1d4ed8' }
  if (n >= 70) return { label: 'Regular',   emoji: '⚠️', bg: '#fef3c7', color: '#92400e' }
  return             { label: 'Crítico',    emoji: '❌', bg: '#fee2e2', color: '#dc2626' }
}

// Calcula dias úteis (seg-sex) em um mês
function diasUteisMes(mesAno) {
  const [ano, mes] = mesAno.split('-').map(Number)
  const diasNoMes = new Date(ano, mes, 0).getDate()
  let uteis = 0
  for (let d = 1; d <= diasNoMes; d++) {
    const dia = new Date(ano, mes - 1, d).getDay()
    if (dia !== 0 && dia !== 6) uteis++
  }
  return uteis
}

// Hoje no formato YYYY-MM-DD
function hoje() {
  return new Date().toISOString().split('T')[0]
}

export default function Metas({ usuarioLogado, onVoltar }) {
  const [mesAno,        setMesAno]        = useState(mesAtual())
  const [fiscais,       setFiscais]       = useState([])
  const [metas,         setMetas]         = useState([])
  const [realizadas,    setRealizadas]    = useState([])
  const [realizadasHoje,setRealizadasHoje]= useState([])
  const [loading,       setLoading]       = useState(true)
  const [salvando,      setSalvando]      = useState(false)
  const [editMetas,     setEditMetas]     = useState({})
  const [modoEditar,    setModoEditar]    = useState(false)
  const [msgSalvo,      setMsgSalvo]      = useState('')
  const [erroSalvo,     setErroSalvo]     = useState('')
  const [abaAtiva,      setAbaAtiva]      = useState('hoje') // 'hoje' | 'mes'

  const carregar = async () => {
    setLoading(true)
    try {
      const { data: fData } = await supabase
        .from('usuarios').select('nome, login, matricula')
        .in('status', ['ATIVO', 'RESERVA']).order('nome')
      setFiscais(fData || [])

      const { data: mData, error: mErr } = await supabase
        .from('metas_fiscal').select('*').eq('mes_ano', mesAno)
      if (mErr) throw mErr
      setMetas(mData || [])

      const [ano, mes] = mesAno.split('-')
      const ini = `${ano}-${mes}-01`
      const fim = new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0]

      const { data: aData } = await supabase
        .from('auditorias').select('fiscal, status, nota, data_auditoria')
        .gte('data_auditoria', ini).lte('data_auditoria', fim)
      setRealizadas(aData || [])

      // Auditorias de hoje
      const { data: hData } = await supabase
        .from('auditorias').select('fiscal, status, nota, data_auditoria')
        .eq('data_auditoria', hoje())
      setRealizadasHoje(hData || [])

      const mapaEdit = {}
      if (fData) fData.forEach(f => {
        const meta = mData?.find(m => m.fiscal_login === f.login)
        mapaEdit[f.login] = meta?.meta ?? 20
      })
      setEditMetas(mapaEdit)
    } catch (e) {
      console.error('Erro ao carregar metas:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [mesAno])

  const salvarMetas = async () => {
    setSalvando(true)
    setMsgSalvo('')
    setErroSalvo('')
    try {
      const { error: delErr } = await supabase
        .from('metas_fiscal').delete().eq('mes_ano', mesAno)
      if (delErr) throw delErr

      const inserir = Object.entries(editMetas)
        .filter(([, v]) => parseInt(v) > 0)
        .map(([fiscal_login, meta]) => ({ fiscal_login, mes_ano: mesAno, meta: parseInt(meta) }))

      if (inserir.length > 0) {
        const { error: insErr } = await supabase.from('metas_fiscal').insert(inserir)
        if (insErr) throw insErr
      }

      setMsgSalvo('✅ Metas salvas com sucesso!')
      setModoEditar(false)
      await carregar()
      setTimeout(() => setMsgSalvo(''), 3000)
    } catch (e) {
      console.error('Erro ao salvar metas:', e)
      setErroSalvo('❌ Erro ao salvar: ' + e.message)
    } finally {
      setSalvando(false)
    }
  }

  const diasUteis   = diasUteisMes(mesAno)
  const diaAtual    = hoje()

  const dadosFiscais = fiscais.map(f => {
    const metaObj    = metas.find(m => m.fiscal_login === f.login)
    const meta       = metaObj?.meta ?? 0
    const metaDia    = meta > 0 ? Math.ceil(meta / diasUteis) : 0
    const auds       = realizadas.filter(a => a.fiscal === f.nome)
    const audsHoje   = realizadasHoje.filter(a => a.fiscal === f.nome)
    const total      = auds.length
    const totalHoje  = audsHoje.length
    const atende     = auds.filter(a => a.status === 'ATENDE').length
    const parcial    = auds.filter(a => a.status === 'ATENDE PARCIAL').length
    const nao        = auds.filter(a => a.status === 'NÃO ATENDE').length
    const atendeHoje = audsHoje.filter(a => a.status === 'ATENDE').length
    const notaMedia  = auds.length > 0
      ? (auds.reduce((acc, a) => acc + Number(a.nota), 0) / auds.length).toFixed(1)
      : '—'
    const notaHoje   = audsHoje.length > 0
      ? (audsHoje.reduce((acc, a) => acc + Number(a.nota), 0) / audsHoje.length).toFixed(1)
      : '—'
    const pct        = meta > 0 ? Math.round((total / meta) * 100) : 0
    const pctHoje    = metaDia > 0 ? Math.round((totalHoje / metaDia) * 100) : 0
    const faltam     = Math.max(0, meta - total)
    const faltamHoje = Math.max(0, metaDia - totalHoje)
    return { ...f, meta, metaDia, total, totalHoje, atende, parcial, nao, atendeHoje, notaMedia, notaHoje, pct, pctHoje, faltam, faltamHoje }
  }).filter(f => f.meta > 0 || f.total > 0 || f.totalHoje > 0)

  const totalMeta      = dadosFiscais.reduce((a, f) => a + f.meta, 0)
  const totalFeito     = dadosFiscais.reduce((a, f) => a + f.total, 0)
  const totalFaltam    = dadosFiscais.reduce((a, f) => a + f.faltam, 0)
  const pctGeral       = totalMeta > 0 ? Math.round((totalFeito / totalMeta) * 100) : 0
  const totalMetaHoje  = dadosFiscais.reduce((a, f) => a + f.metaDia, 0)
  const totalFeitoHoje = dadosFiscais.reduce((a, f) => a + f.totalHoje, 0)
  const pctGeralHoje   = totalMetaHoje > 0 ? Math.round((totalFeitoHoje / totalMetaHoje) * 100) : 0

  const mesesOpcoes = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - 3 + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const dataHojeFormatada = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #065f46, #059669)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>🎯 Metas por Fiscal</h1>
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>Cadastro e acompanhamento de metas</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {abaAtiva === 'hoje' ? [
                { label: 'Meta Hoje',  val: totalMetaHoje,  bg: 'rgba(255,255,255,0.15)' },
                { label: 'Feitas Hoje',val: totalFeitoHoje, bg: 'rgba(255,255,255,0.25)' },
                { label: `${pctGeralHoje}%`, val: '✓', bg: pctGeralHoje >= 100 ? 'rgba(22,163,74,0.5)' : 'rgba(217,119,6,0.4)' },
              ] : [
                { label: 'Meta Total', val: totalMeta,   bg: 'rgba(255,255,255,0.15)' },
                { label: 'Realizadas', val: totalFeito,  bg: 'rgba(255,255,255,0.25)' },
                { label: 'Faltam',     val: totalFaltam, bg: 'rgba(220,38,38,0.4)'   },
                { label: `${pctGeral}%`, val: '✓',       bg: pctGeral >= 100 ? 'rgba(22,163,74,0.5)' : 'rgba(217,119,6,0.4)' },
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

        {/* ABAS */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {[
            { id: 'hoje', label: '📅 Meta do Dia' },
            { id: 'mes',  label: '📊 Meta do Mês' },
          ].map(a => (
            <button key={a.id} onClick={() => { setAbaAtiva(a.id); setModoEditar(false) }} style={{
              flex: 1, padding: '13px', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 700,
              background: abaAtiva === a.id ? '#059669' : '#fff',
              color:      abaAtiva === a.id ? '#fff'    : '#64748b',
              transition: 'all 0.2s',
            }}>{a.label}</button>
          ))}
        </div>

        {/* ===================== ABA: HOJE ===================== */}
        {abaAtiva === 'hoje' && (
          <>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Progresso de Hoje</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, textTransform: 'capitalize' }}>{dataHojeFormatada}</p>
                </div>
                <span style={{ fontSize: 18, fontWeight: 900, color: barColor(pctGeralHoje) }}>
                  {totalFeitoHoje}/{totalMetaHoje} ({pctGeralHoje}%)
                </span>
              </div>
              <div style={{ background: '#f1f5f9', borderRadius: 6, height: 12, overflow: 'hidden' }}>
                <div style={{
                  height: 12, borderRadius: 6, width: `${Math.min(pctGeralHoje, 100)}%`,
                  background: barColor(pctGeralHoje), transition: 'width 0.5s',
                }} />
              </div>
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                Meta diária calculada com base em {diasUteis} dias úteis em {mesLabel(mesAno)}
              </p>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <p>Carregando...</p>
              </div>
            ) : dadosFiscais.filter(f => f.meta > 0).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                <p>Nenhuma meta cadastrada para {mesLabel(mesAno)}.</p>
                <p style={{ fontSize: 12, marginTop: 8 }}>Vá para a aba <strong>Meta do Mês</strong> para cadastrar.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dadosFiscais.filter(f => f.meta > 0).sort((a, b) => b.pctHoje - a.pctHoje).map(f => (
                  <div key={f.login} style={{
                    background: '#fff', borderRadius: 14,
                    border: `1.5px solid ${f.pctHoje >= 100 ? '#86efac' : f.totalHoje > 0 ? '#fcd34d' : '#fca5a5'}`,
                    padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>{f.nome}</p>
                        <p style={{ fontSize: 11, color: '#94a3b8' }}>{f.login}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: barColor(f.pctHoje), lineHeight: 1 }}>
                          {f.pctHoje}%
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {f.totalHoje}/{f.metaDia} hoje
                        </div>
                      </div>
                    </div>

                    <div style={{ background: '#f1f5f9', borderRadius: 6, height: 10, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{
                        height: 10, borderRadius: 6,
                        width: `${Math.min(f.pctHoje, 100)}%`,
                        background: barColor(f.pctHoje), transition: 'width 0.5s',
                      }} />
                    </div>

                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                      <span>📋 Meta dia: <strong>{f.metaDia}</strong></span>
                      <span>✅ Feitas: <strong style={{ color: '#15803d' }}>{f.totalHoje}</strong></span>
                      {f.notaHoje !== '—' && <span>📊 Nota: <strong>{f.notaHoje}</strong></span>}
                      {f.faltamHoje > 0
                        ? <span style={{ color: '#dc2626', fontWeight: 700 }}>⏳ Faltam {f.faltamHoje}</span>
                        : <span style={{ color: '#15803d', fontWeight: 700 }}>🏆 Meta do dia atingida!</span>
                      }
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ===================== ABA: MÊS ===================== */}
        {abaAtiva === 'mes' && (
          <>
            {/* Seletor de mês + botões */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                  MÊS DE REFERÊNCIA
                </label>
                <select value={mesAno} onChange={e => { setMesAno(e.target.value); setModoEditar(false) }}
                  className="form-input" style={{ fontSize: 14, padding: '9px 14px', fontWeight: 700 }}>
                  {mesesOpcoes.map(m => (
                    <option key={m} value={m}>{mesLabel(m)}{m === mesAtual() ? ' (atual)' : ''}</option>
                  ))}
                </select>
              </div>

              {!modoEditar ? (
                <button onClick={() => setModoEditar(true)} style={{
                  marginTop: 20, padding: '10px 20px', background: '#059669', color: '#fff',
                  border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>✏️ Editar Metas</button>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                  <button onClick={salvarMetas} disabled={salvando} style={{
                    padding: '10px 20px', background: salvando ? '#64748b' : '#059669', color: '#fff',
                    border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>
                    {salvando ? '⏳ Salvando...' : '💾 Salvar Metas'}
                  </button>
                  <button onClick={() => { setModoEditar(false); carregar() }} style={{
                    padding: '10px 16px', background: '#f1f5f9', color: '#374151',
                    border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>Cancelar</button>
                </div>
              )}

              {msgSalvo  && <p style={{ marginTop: 20, fontSize: 13, fontWeight: 700, color: '#15803d' }}>{msgSalvo}</p>}
              {erroSalvo && <p style={{ marginTop: 20, fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{erroSalvo}</p>}
            </div>

            {/* Barra geral */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Progresso Geral — {mesLabel(mesAno)}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: barColor(pctGeral) }}>
                  {totalFeito}/{totalMeta} ({pctGeral}%)
                </span>
              </div>
              <div style={{ background: '#f1f5f9', borderRadius: 6, height: 12, overflow: 'hidden' }}>
                <div style={{
                  height: 12, borderRadius: 6, width: `${Math.min(pctGeral, 100)}%`,
                  background: barColor(pctGeral), transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                <span>✅ Atende: <strong>{realizadas.filter(a => a.status === 'ATENDE').length}</strong></span>
                <span>⚠️ Parcial: <strong>{realizadas.filter(a => a.status === 'ATENDE PARCIAL').length}</strong></span>
                <span>❌ Não Atende: <strong>{realizadas.filter(a => a.status === 'NÃO ATENDE').length}</strong></span>
                <span>📊 Nota Média: <strong>
                  {realizadas.length > 0
                    ? (realizadas.reduce((a, r) => a + Number(r.nota), 0) / realizadas.length).toFixed(1)
                    : '—'}
                </strong></span>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <p>Carregando metas...</p>
              </div>
            ) : (
              <>
                {/* Modo editar */}
                {modoEditar && (
                  <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #059669', padding: '16px', marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#065f46', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      ✏️ Definindo metas para {mesLabel(mesAno)}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {fiscais.map(f => (
                        <div key={f.login} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                            {f.nome}
                            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{f.login}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ fontSize: 12, color: '#64748b' }}>Meta:</label>
                            <input
                              type="number" min="0" max="999"
                              value={editMetas[f.login] ?? 20}
                              onChange={e => setEditMetas(prev => ({ ...prev, [f.login]: e.target.value }))}
                              style={{
                                width: 70, padding: '7px 10px', borderRadius: 8,
                                border: '1.5px solid #059669', fontSize: 15, fontWeight: 700,
                                textAlign: 'center', color: '#065f46',
                              }}
                            />
                            <span style={{ fontSize: 12, color: '#64748b' }}>auditorias</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cards mensais */}
                {dadosFiscais.length === 0 && !modoEditar ? (
                  <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                    <p style={{ marginBottom: 8 }}>Nenhuma meta cadastrada para {mesLabel(mesAno)}.</p>
                    <p style={{ fontSize: 12 }}>Clique em <strong>Editar Metas</strong> para definir as metas dos fiscais.</p>
                  </div>
                ) : !modoEditar && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {dadosFiscais.sort((a, b) => b.pct - a.pct).map(f => {
                      const c = conceito(f.notaMedia)
                      return (
                        <div key={f.login} style={{
                          background: '#fff', borderRadius: 14,
                          border: `1.5px solid ${f.pct >= 100 ? '#86efac' : f.pct >= 70 ? '#fcd34d' : '#fca5a5'}`,
                          padding: '16px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{f.nome}</span>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>{f.login}</span>
                              </div>
                              {c && (
                                <div style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  background: c.bg, color: c.color,
                                  padding: '3px 10px', borderRadius: 20,
                                  fontSize: 12, fontWeight: 700,
                                }}>
                                  {c.emoji} {c.label}
                                  <span style={{ fontWeight: 400, opacity: 0.8, marginLeft: 2 }}>· nota {f.notaMedia}</span>
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right', marginLeft: 12 }}>
                              <div style={{ fontSize: 22, fontWeight: 900, color: barColor(f.pct), lineHeight: 1 }}>
                                {f.pct}%
                              </div>
                              <div style={{ fontSize: 10, color: '#64748b' }}>
                                {f.total}/{f.meta} auditorias
                              </div>
                            </div>
                          </div>

                          <div style={{ background: '#f1f5f9', borderRadius: 6, height: 10, overflow: 'hidden', marginBottom: 10 }}>
                            <div style={{
                              height: 10, borderRadius: 6,
                              width: `${Math.min(f.pct, 100)}%`,
                              background: barColor(f.pct), transition: 'width 0.5s',
                            }} />
                          </div>

                          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                            <span style={{ color: '#15803d', fontWeight: 600 }}>✅ {f.atende} Atende</span>
                            <span style={{ color: '#d97706', fontWeight: 600 }}>⚠️ {f.parcial} Parcial</span>
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>❌ {f.nao} Não Atende</span>
                            {f.faltam > 0 && (
                              <span style={{ color: '#dc2626', fontWeight: 700 }}>⏳ Faltam {f.faltam}</span>
                            )}
                            {f.pct >= 100 && (
                              <span style={{ color: '#15803d', fontWeight: 700 }}>🏆 Meta atingida!</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

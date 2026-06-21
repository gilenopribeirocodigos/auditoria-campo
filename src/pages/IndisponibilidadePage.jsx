import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

// ── Autocomplete de Prefixo ───────────────────────────────────────────────────
// Digita para filtrar a lista existente, mas só aceita seleção da lista.
function PrefixoSelect({ value, onChange, prefixos, placeholder = 'Digite para filtrar...' }) {
  const [filtro,  setFiltro]  = useState(value || '')
  const [aberto,  setAberto]  = useState(false)
  const ref = useRef(null)

  // Sincroniza quando o pai limpa/muda o valor
  useEffect(() => { setFiltro(value || '') }, [value])

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const opcoesFiltradas = prefixos.filter(p =>
    !filtro || p.toLowerCase().includes(filtro.toLowerCase())
  )

  const selecionar = (p) => {
    onChange(p)
    setFiltro(p)
    setAberto(false)
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <input
        className="form-input"
        value={filtro}
        onChange={e => { setFiltro(e.target.value); setAberto(true) }}
        onFocus={() => setAberto(true)}
        placeholder={placeholder}
        autoComplete="off"
        style={{ paddingRight: 32 }}
      />
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>
        🔍
      </span>
      {aberto && opcoesFiltradas.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 220, overflowY: 'auto',
        }}>
          {opcoesFiltradas.map((p, i) => (
            <button key={p} onMouseDown={() => selecionar(p)} style={{
              display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left',
              background: p === value ? '#eff6ff' : 'none', border: 'none', cursor: 'pointer',
              borderBottom: i < opcoesFiltradas.length - 1 ? '1px solid #f1f5f9' : 'none',
              fontSize: 13, fontFamily: '"Courier New", monospace', fontWeight: 600, color: '#1e293b',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
              onMouseLeave={e => e.currentTarget.style.background = p === value ? '#eff6ff' : 'none'}
            >{p}</button>
          ))}
        </div>
      )}
      {aberto && filtro && opcoesFiltradas.length === 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: '#fff', border: '1.5px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#dc2626' }}>
          ❌ Nenhum prefixo encontrado para "{filtro}"
        </div>
      )}
    </div>
  )
}

export default function IndisponibilidadePage({ usuarioLogado, onVoltar }) {
  const hoje = new Date().toISOString().split('T')[0]
  const [data,              setData]              = useState(hoje)
  const [eletricistas,      setEletricistas]      = useState([])
  const [motivos,           setMotivos]           = useState([])
  const [prefixos,          setPrefixos]          = useState([])
  const [loading,           setLoading]           = useState(false)
  const [salvando,          setSalvando]          = useState(false)
  const [erro,              setErro]              = useState('')
  const [sucesso,           setSucesso]           = useState('')
  const [registros,         setRegistros]         = useState({})
  const [abaAtiva,          setAbaAtiva]          = useState('frequencia')

  // Remanejamento
  const [buscaReman,        setBuscaReman]        = useState('')
  const [resultadosReman,   setResultadosReman]   = useState([])
  const [buscandoReman,     setBuscandoReman]     = useState(false)

  // Indisponibilidade (aba 3)
  const [ausentesHoje,      setAusentesHoje]      = useState([])
  const [formIndisp,        setFormIndisp]        = useState({ eletricista_id: '', prefixo: '', tipo: 'total', motivo_id: '', obs: '' })
  const [salvandoIndisp,    setSalvandoIndisp]    = useState(false)
  const [indispRegistradas, setIndispRegistradas] = useState([])

  const isSupervisor    = usuarioLogado?.perfil !== 'ADMIN'
  const supervisorCampo = usuarioLogado?.nome

  // ─── Carrega dados ────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    setRegistros({})

    try {
      const { data: motivosData } = await supabase
        .from('motivos_indisponibilidade').select('id, descricao').eq('ativo', true).order('descricao')
      setMotivos(motivosData || [])

      const { data: jaRegistrados } = await supabase
        .from('equipes_dia').select('eletricista_id, id_indisponibilidade').eq('data', data)
      const idsRegistrados = new Set((jaRegistrados || []).map(p => p.eletricista_id))

      let query = supabase.from('estrutura_equipes')
        .select('id, colaborador, matricula, prefixo, superv_campo, base')
        .in('descr_situacao', ['ATIVO', 'RESERVA']).order('colaborador')
      if (isSupervisor && supervisorCampo) query = query.eq('superv_campo', supervisorCampo)

      const { data: todosElet } = await query
      setEletricistas((todosElet || []).filter(e => !idsRegistrados.has(e.id)))

      const prefixosUnicos = [...new Set((todosElet || []).map(e => e.prefixo).filter(Boolean))].sort()
      setPrefixos(prefixosUnicos)

      // Ausentes do dia para aba 3
      const motivoPresente = (motivosData || []).find(m => m.descricao.toUpperCase() === 'PRESENTE')
      const ausentes = (jaRegistrados || []).filter(r => r.id_indisponibilidade !== motivoPresente?.id)
      const idsAusentes = ausentes.map(r => r.eletricista_id)

      if (idsAusentes.length > 0) {
        const { data: eletAusentes } = await supabase.from('estrutura_equipes')
          .select('id, colaborador, matricula, prefixo').in('id', idsAusentes).order('colaborador')
        setAusentesHoje(eletAusentes || [])
      } else {
        setAusentesHoje([])
      }

      const { data: indispHoje } = await supabase.from('indisponibilidades')
        .select('id, eletricista_id, prefixo, tipo_indisponibilidade, motivo_id, observacao, motivos_indisponibilidade(descricao)')
        .eq('data', data)
      setIndispRegistradas(indispHoje || [])

    } catch (e) {
      setErro('Erro ao carregar dados: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [data, supervisorCampo, isSupervisor])

  useEffect(() => { carregar() }, [carregar])

  const upd = (eletId, campo, valor) =>
    setRegistros(prev => ({ ...prev, [eletId]: { ...prev[eletId], [campo]: valor } }))

  const setStatus = (eletId, status, prefixoPadrao) =>
    setRegistros(prev => ({
      ...prev,
      [eletId]: { ...prev[eletId], status, prefixo: prev[eletId]?.prefixo || prefixoPadrao || '' },
    }))

  // ─── Salvar Frequência ────────────────────────────────────────────────────
  const salvarFrequencia = async () => {
    const marcados = Object.entries(registros).filter(([, r]) => r.status)
    if (!marcados.length) { setErro('Nenhum eletricista marcado.'); return }
    if (marcados.some(([, r]) => r.status === 'presente' && !r.prefixo)) { setErro('Selecione o prefixo para todos os Presentes.'); return }
    if (marcados.some(([, r]) => r.status === 'ausente'  && !r.motivo_id)) { setErro('Selecione o motivo para todos os Ausentes.'); return }

    setSalvando(true); setErro(''); setSucesso('')
    try {
      const eletMap = {}; eletricistas.forEach(e => { eletMap[e.id] = e })
      const motivoPresente = motivos.find(m => m.descricao.toUpperCase() === 'PRESENTE')
      if (!motivoPresente) throw new Error('Motivo "PRESENTE" não encontrado.')

      const linhas = marcados.map(([id, r]) => {
        const elet = eletMap[id] || {}
        const isP  = r.status === 'presente'
        return {
          eletricista_id:       Number(id),
          prefixo:              isP ? r.prefixo : (elet.prefixo || ''),
          data,
          supervisor_registro:  supervisorCampo || 'Administrador',
          usuario_registro:     usuarioLogado?.login || 'admin',
          id_indisponibilidade: isP ? motivoPresente.id : Number(r.motivo_id),
          observacoes:          r.obs || null,
        }
      })

      const { error } = await supabase.from('equipes_dia').upsert(linhas, { onConflict: 'eletricista_id,data' })
      if (error) throw error

      const totalP = marcados.filter(([, r]) => r.status === 'presente').length
      const totalA = marcados.filter(([, r]) => r.status === 'ausente').length
      setSucesso(`✅ ${totalP} presente(s) e ${totalA} ausente(s) registrado(s)!`)
      await carregar()
    } catch (e) { setErro('Erro ao salvar: ' + e.message) }
    finally { setSalvando(false) }
  }

  // ─── Remanejamento ────────────────────────────────────────────────────────
  const buscarRemanejamento = async (texto) => {
    setBuscaReman(texto)
    if (texto.length < 3) { setResultadosReman([]); return }
    setBuscandoReman(true)
    const { data: jaReg } = await supabase.from('equipes_dia').select('eletricista_id').eq('data', data)
    const idsReg     = new Set((jaReg || []).map(r => r.eletricista_id))
    const idsNaLista = new Set(eletricistas.map(e => e.id))
    const { data: res } = await supabase.from('estrutura_equipes')
      .select('id, colaborador, matricula, prefixo, superv_campo')
      .ilike('colaborador', `%${texto}%`).in('descr_situacao', ['ATIVO', 'RESERVA']).limit(10)
    setResultadosReman((res || []).filter(e => !idsNaLista.has(e.id) && !idsReg.has(e.id)))
    setBuscandoReman(false)
  }

  const confirmarRemanejamento = async (elet) => {
    setSalvando(true)
    try {
      await supabase.from('remanejamentos').upsert({
        eletricista_id: elet.id, supervisor_origem: elet.superv_campo,
        supervisor_destino: supervisorCampo || 'Administrador',
        data, temporario: true, usuario_registro: usuarioLogado?.login || 'admin',
      }, { onConflict: 'eletricista_id,data' })
      setEletricistas(prev => [...prev, elet])
      setResultadosReman([]); setBuscaReman('')
      setSucesso(`✅ ${elet.colaborador} adicionado à lista de frequência.`)
    } catch (e) { setErro('Erro no remanejamento: ' + e.message) }
    finally { setSalvando(false) }
  }

  // ─── Indisponibilidade ────────────────────────────────────────────────────
  const onEletristaIndispChange = (eletristaId) => {
    const elet = ausentesHoje.find(e => String(e.id) === String(eletristaId))
    setFormIndisp(f => ({ ...f, eletricista_id: eletristaId, prefixo: elet?.prefixo || '' }))
  }

  const salvarIndisponibilidade = async () => {
    if (!formIndisp.eletricista_id) { setErro('Selecione um eletricista.'); return }
    if (!formIndisp.motivo_id)      { setErro('Selecione o motivo.'); return }
    if (!formIndisp.prefixo)        { setErro('Informe o prefixo da equipe.'); return }
    setSalvandoIndisp(true); setErro(''); setSucesso('')
    try {
      const elet = ausentesHoje.find(e => String(e.id) === String(formIndisp.eletricista_id))
      const { error } = await supabase.from('indisponibilidades').upsert({
        data, eletricista_id: Number(formIndisp.eletricista_id),
        matricula: elet?.matricula || null, prefixo: formIndisp.prefixo,
        tipo_indisponibilidade: formIndisp.tipo, motivo_id: Number(formIndisp.motivo_id),
        observacao: formIndisp.obs || null, usuario_registro: usuarioLogado?.login || 'admin',
      }, { onConflict: 'eletricista_id,data' })
      if (error) throw error
      setSucesso(`✅ Indisponibilidade de ${elet?.colaborador} registrada!`)
      setFormIndisp({ eletricista_id: '', prefixo: '', tipo: 'total', motivo_id: '', obs: '' })
      await carregar()
    } catch (e) { setErro('Erro ao registrar: ' + e.message) }
    finally { setSalvandoIndisp(false) }
  }

  const totalPresentes = Object.values(registros).filter(r => r.status === 'presente').length
  const totalAusentes  = Object.values(registros).filter(r => r.status === 'ausente').length
  const totalMarcados  = totalPresentes + totalAusentes

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📋 Registrar Indisponibilidade</h1>
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>
                {isSupervisor ? `Supervisor: ${supervisorCampo}` : 'Administrador — todas as equipes'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'NA LISTA',  val: eletricistas.length, cor: '#93c5fd' },
                { label: 'PRESENTES', val: totalPresentes,       cor: '#86efac' },
                { label: 'AUSENTES',  val: totalAusentes,        cor: '#fca5a5' },
              ].map(({ label, val, cor }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 12px', textAlign: 'center', minWidth: 60 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: cor }}>{val}</div>
                  <div style={{ fontSize: 9, opacity: 0.85 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 80px' }}>

        {/* ── Filtro de data no padrão VérticeGP ── */}
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
          padding: '16px 20px', marginBottom: 16,
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            📅 Data do Registro
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="form-input"
              style={{ maxWidth: 200, fontWeight: 700, fontSize: 15 }}
            />
            {data === hoje
              ? <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>✅ Hoje</span>
              : <span style={{ fontSize: 12, color: '#d97706', fontWeight: 700 }}>⚠️ Data retroativa</span>
            }
          </div>
        </div>

        {/* ── Abas ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { id: 'frequencia',    emoji: '📋', label: 'Frequência da Equipe' },
            { id: 'remanejamento', emoji: '🔄', label: 'Remanejar Eletricista' },
            { id: 'indisponivel',  emoji: '⚠️', label: 'Indisponível' },
          ].map(aba => (
            <button key={aba.id} onClick={() => { setAbaAtiva(aba.id); setErro(''); setSucesso('') }} style={{
              padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              background: abaAtiva === aba.id ? '#1e3a5f' : '#e2e8f0',
              color:      abaAtiva === aba.id ? '#fff'    : '#374151',
            }}>{aba.emoji} {aba.label}</button>
          ))}
        </div>

        {/* ── Alertas ── */}
        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>
            ❌ {erro}
            <button onClick={() => setErro('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 16 }}>×</button>
          </div>
        )}
        {sucesso && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
            {sucesso}
            <button onClick={() => setSucesso('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#15803d', fontSize: 16 }}>×</button>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ABA 1: FREQUÊNCIA
        ══════════════════════════════════════════════ */}
        {abaAtiva === 'frequencia' && (
          <>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>⏳ Carregando eletricistas...</div>
            ) : eletricistas.length === 0 ? (
              <div style={{ background: '#f0fdf4', borderRadius: 14, border: '1px solid #86efac', padding: 30, textAlign: 'center', color: '#15803d' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <p style={{ fontWeight: 700 }}>Todos os eletricistas já foram registrados para esta data!</p>
              </div>
            ) : (
              <>
                {/* Legenda */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '5px 12px' }}>
                    ✓ PRESENTE — veio trabalhar
                  </div>
                  <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '5px 12px' }}>
                    ✗ AUSENTE — não veio (selecione motivo)
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {eletricistas.map(elet => {
                    const reg       = registros[elet.id] || {}
                    const isPresente = reg.status === 'presente'
                    const isAusente  = reg.status === 'ausente'

                    // ── Cores do card por status ──
                    let cardBg     = '#fff'
                    let cardBorder = '#e2e8f0'
                    if (isPresente) { cardBg = '#f0fdf4'; cardBorder = '#16a34a' }
                    if (isAusente)  { cardBg = '#fef2f2'; cardBorder = '#dc2626' }

                    return (
                      <div key={elet.id} style={{
                        background: cardBg, borderRadius: 14,
                        border: `2px solid ${cardBorder}`,
                        padding: '14px 16px',
                        transition: 'all 0.2s',
                      }}>
                        {/* Nome + botões */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {/* Ícone de status */}
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                              background: isPresente ? '#16a34a' : isAusente ? '#dc2626' : '#e2e8f0',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 16, transition: 'background 0.2s',
                            }}>
                              {isPresente ? '✓' : isAusente ? '✗' : '?'}
                            </div>
                            <div>
                              <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{elet.colaborador}</p>
                              <p style={{ fontSize: 11, color: '#64748b' }}>
                                Mat: {elet.matricula} · {elet.prefixo || '—'} · {elet.base || '—'}
                              </p>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => setStatus(elet.id, isPresente ? null : 'presente', elet.prefixo)}
                              style={{
                                padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                                border: '2px solid #16a34a',
                                background: isPresente ? '#16a34a' : '#fff',
                                color:      isPresente ? '#fff'    : '#16a34a',
                                transition: 'all 0.15s',
                              }}>✓ Presente</button>
                            <button
                              onClick={() => setStatus(elet.id, isAusente ? null : 'ausente')}
                              style={{
                                padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                                border: '2px solid #dc2626',
                                background: isAusente ? '#dc2626' : '#fff',
                                color:      isAusente ? '#fff'    : '#dc2626',
                                transition: 'all 0.15s',
                              }}>✗ Ausente</button>
                          </div>
                        </div>

                        {/* Campos extras — PRESENTE */}
                        {isPresente && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid #bbf7d0' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Prefixo da Equipe *</label>
                              <PrefixoSelect
                                value={reg.prefixo || ''}
                                onChange={v => upd(elet.id, 'prefixo', v)}
                                prefixos={prefixos}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Observação (opcional)</label>
                              <input className="form-input" value={reg.obs || ''} onChange={e => upd(elet.id, 'obs', e.target.value)} placeholder="Ex: equipe extra" />
                            </div>
                          </div>
                        )}

                        {/* Campos extras — AUSENTE */}
                        {isAusente && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid #fecaca' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Motivo da Ausência *</label>
                              <select className="form-input" value={reg.motivo_id || ''} onChange={e => upd(elet.id, 'motivo_id', e.target.value)}>
                                <option value="">Selecione...</option>
                                {motivos.filter(m => m.descricao.toUpperCase() !== 'PRESENTE').map(m => (
                                  <option key={m.id} value={m.id}>{m.descricao}</option>
                                ))}
                              </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Observação (opcional)</label>
                              <input className="form-input" value={reg.obs || ''} onChange={e => upd(elet.id, 'obs', e.target.value)} placeholder="Detalhe se necessário" />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Botão salvar fixo na base */}
                {totalMarcados > 0 && (
                  <div style={{
                    position: 'sticky', bottom: 16, background: '#fff', borderRadius: 14,
                    border: '1.5px solid #bfdbfe', padding: '14px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                  }}>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {totalPresentes > 0 && (
                        <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 700 }}>✅ {totalPresentes} presente(s)</span>
                      )}
                      {totalAusentes > 0 && (
                        <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 700 }}>❌ {totalAusentes} ausente(s)</span>
                      )}
                    </div>
                    <button onClick={salvarFrequencia} disabled={salvando} className="btn-primary"
                      style={{ background: salvando ? '#64748b' : '#1e3a5f', minWidth: 160, marginBottom: 0 }}>
                      {salvando ? '⏳ Salvando...' : `💾 Salvar ${totalMarcados} Registro(s)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════
            ABA 2: REMANEJAMENTO
        ══════════════════════════════════════════════ */}
        {abaAtiva === 'remanejamento' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>🔄 Remanejar Eletricista</p>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Adicione um eletricista de outro supervisor à sua lista de frequência de hoje.
            </p>
            <div style={{ position: 'relative' }}>
              <label className="form-label">Buscar eletricista pelo nome</label>
              <input className="form-input" value={buscaReman} onChange={e => buscarRemanejamento(e.target.value)} placeholder="Digite ao menos 3 letras..." />
              {buscandoReman && <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>⏳ Buscando...</p>}
              {resultadosReman.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 300, overflowY: 'auto' }}>
                  {resultadosReman.map(e => (
                    <div key={e.id} style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{e.colaborador}</p>
                        <p style={{ fontSize: 11, color: '#64748b' }}>Mat: {e.matricula} · Sup: {e.superv_campo}</p>
                      </div>
                      <button onClick={() => confirmarRemanejamento(e)} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#1e3a5f', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                        Adicionar
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {buscaReman.length >= 3 && !buscandoReman && resultadosReman.length === 0 && (
                <p style={{ fontSize: 12, color: '#dc2626', marginTop: 6, fontWeight: 600 }}>❌ Nenhum disponível encontrado.</p>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ABA 3: INDISPONÍVEL
        ══════════════════════════════════════════════ */}
        {abaAtiva === 'indisponivel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #fed7aa', padding: '20px' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#9a3412', marginBottom: 4 }}>⚠️ Registrar Indisponibilidade de Equipe</p>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
                Selecione um eletricista <strong>ausente</strong> e registre qual equipe/prefixo ficou parado e o motivo.
                Este registro é feito manualmente após a frequência.
              </p>

              {ausentesHoje.length === 0 ? (
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '20px', textAlign: 'center', color: '#64748b' }}>
                  <p style={{ fontWeight: 700 }}>Nenhum eletricista ausente registrado para esta data.</p>
                  <p style={{ fontSize: 12, marginTop: 6 }}>Registre as ausências na aba "Frequência da Equipe" primeiro.</p>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Eletricista *</label>
                    <select className="form-input" value={formIndisp.eletricista_id} onChange={e => onEletristaIndispChange(e.target.value)}>
                      <option value="">— Selecione o eletricista ausente —</option>
                      {ausentesHoje.map(e => (
                        <option key={e.id} value={e.id}>{e.colaborador} (Mat: {e.matricula})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Prefixo da Equipe *
                      <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400, marginLeft: 6 }}>preenchido automaticamente — editável</span>
                    </label>
                    <PrefixoSelect
                      value={formIndisp.prefixo}
                      onChange={v => setFormIndisp(f => ({ ...f, prefixo: v }))}
                      prefixos={prefixos}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group">
                      <label className="form-label">Tipo de Indisponibilidade *</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[
                          { val: 'parcial', label: '⏱ Parcial', sub: 'Apenas um turno' },
                          { val: 'total',   label: '🚫 Total',   sub: 'O dia inteiro'   },
                        ].map(t => (
                          <button key={t.val} onClick={() => setFormIndisp(f => ({ ...f, tipo: t.val }))} style={{
                            flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                            border: `2px solid ${formIndisp.tipo === t.val ? '#1e3a5f' : '#e2e8f0'}`,
                            background: formIndisp.tipo === t.val ? '#eff6ff' : '#fff', textAlign: 'center',
                          }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: formIndisp.tipo === t.val ? '#1e3a5f' : '#374151' }}>{t.label}</p>
                            <p style={{ fontSize: 10, color: '#64748b' }}>{t.sub}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Motivo *</label>
                      <select className="form-input" value={formIndisp.motivo_id} onChange={e => setFormIndisp(f => ({ ...f, motivo_id: e.target.value }))}>
                        <option value="">— Selecione —</option>
                        {motivos.filter(m => m.descricao.toUpperCase() !== 'PRESENTE').map(m => (
                          <option key={m.id} value={m.id}>{m.descricao}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Observações (opcional)</label>
                    <textarea className="form-textarea" rows={3} value={formIndisp.obs}
                      onChange={e => setFormIndisp(f => ({ ...f, obs: e.target.value }))}
                      placeholder="Informações adicionais..." />
                  </div>

                  <button onClick={salvarIndisponibilidade} disabled={salvandoIndisp} className="btn-primary"
                    style={{ background: salvandoIndisp ? '#64748b' : '#c2410c' }}>
                    {salvandoIndisp ? '⏳ Salvando...' : '⚠️ Registrar Indisponibilidade'}
                  </button>
                </>
              )}
            </div>

            {/* Registradas hoje */}
            {indispRegistradas.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>
                  📋 Registradas hoje ({indispRegistradas.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {indispRegistradas.map(r => {
                    const elet = ausentesHoje.find(e => e.id === r.eletricista_id)
                    return (
                      <div key={r.id} style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#9a3412' }}>
                              {elet?.colaborador || `Eletricista #${r.eletricista_id}`}
                            </p>
                            <p style={{ fontSize: 11, color: '#64748b' }}>
                              Prefixo: {r.prefixo} · {r.tipo_indisponibilidade?.toUpperCase()} · {r.motivos_indisponibilidade?.descricao || '—'}
                            </p>
                            {r.observacao && <p style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>💬 {r.observacao}</p>}
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, alignSelf: 'flex-start',
                            background: r.tipo_indisponibilidade === 'total' ? '#fee2e2' : '#fef3c7',
                            color:      r.tipo_indisponibilidade === 'total' ? '#dc2626' : '#d97706',
                          }}>
                            {r.tipo_indisponibilidade?.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

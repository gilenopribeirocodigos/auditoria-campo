import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

// ════════════════════════════════════════════════════════════════════════════
// Registrar Indisponibilidade — VérticeGP
// ────────────────────────────────────────────────────────────────────────────
// 3 abas / fluxos SEPARADOS:
//
// 1. FREQUÊNCIA — marca cada eletricista como PRESENTE ou AUSENTE no dia.
//    Tudo vai para `equipes_dia`.
//    Presente  → id_indisponibilidade = id do motivo "PRESENTE"
//    Ausente   → id_indisponibilidade = id do motivo de ausência escolhido
//
// 2. REMANEJAR — adiciona eletricista de outro supervisor à lista do dia.
//    Grava em `remanejamentos` e adiciona à lista de frequência.
//
// 3. INDISPONÍVEL — processo SEPARADO e MANUAL feito depois da frequência.
//    O supervisor escolhe um eletricista que foi marcado como AUSENTE e
//    registra qual equipe/prefixo ficou parado (tipo + motivo).
//    Vai para a tabela `indisponibilidades`.
//    NÃO é alimentado automaticamente — o usuário faz manualmente.
// ════════════════════════════════════════════════════════════════════════════

export default function IndisponibilidadePage({ usuarioLogado, onVoltar }) {
  const hoje = new Date().toISOString().split('T')[0]
  const [data,            setData]            = useState(hoje)
  const [eletricistas,    setEletricistas]    = useState([])
  const [motivos,         setMotivos]         = useState([])
  const [prefixos,        setPrefixos]        = useState([])
  const [loading,         setLoading]         = useState(false)
  const [salvando,        setSalvando]        = useState(false)
  const [erro,            setErro]            = useState('')
  const [sucesso,         setSucesso]         = useState('')
  const [registros,       setRegistros]       = useState({})
  const [abaAtiva,        setAbaAtiva]        = useState('frequencia')

  // ── Remanejamento ──
  const [buscaReman,      setBuscaReman]      = useState('')
  const [resultadosReman, setResultadosReman] = useState([])
  const [buscandoReman,   setBuscandoReman]   = useState(false)

  // ── Indisponibilidade (aba 3) ──
  const [ausentesHoje,    setAusentesHoje]    = useState([])  // eletricistas ausentes do dia
  const [formIndisp,      setFormIndisp]      = useState({
    eletricista_id: '', prefixo: '', tipo: 'total', motivo_id: '', obs: '',
  })
  const [salvandoIndisp,  setSalvandoIndisp]  = useState(false)
  const [indispRegistradas, setIndispRegistradas] = useState([]) // já registradas no dia

  const isSupervisor   = usuarioLogado?.perfil !== 'ADMIN'
  const supervisorCampo = usuarioLogado?.nome

  // ─── Carrega dados ao mudar a data ───────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    setRegistros({})

    try {
      // Motivos
      const { data: motivosData } = await supabase
        .from('motivos_indisponibilidade')
        .select('id, descricao')
        .eq('ativo', true)
        .order('descricao')
      setMotivos(motivosData || [])

      // IDs já registrados na data em equipes_dia
      const { data: jaRegistrados } = await supabase
        .from('equipes_dia')
        .select('eletricista_id, id_indisponibilidade')
        .eq('data', data)

      const idsRegistrados = new Set((jaRegistrados || []).map(p => p.eletricista_id))

      // Eletricistas disponíveis (ainda não registrados)
      let query = supabase
        .from('estrutura_equipes')
        .select('id, colaborador, matricula, prefixo, superv_campo, base')
        .in('descr_situacao', ['ATIVO', 'RESERVA'])
        .order('colaborador')

      if (isSupervisor && supervisorCampo) {
        query = query.eq('superv_campo', supervisorCampo)
      }

      const { data: todosElet } = await query
      const disponiveis = (todosElet || []).filter(e => !idsRegistrados.has(e.id))
      setEletricistas(disponiveis)

      const prefixosUnicos = [...new Set((todosElet || []).map(e => e.prefixo).filter(Boolean))].sort()
      setPrefixos(prefixosUnicos)

      // Ausentes do dia (para a aba Indisponível)
      const motivoPresente = (motivosData || []).find(m => m.descricao.toUpperCase() === 'PRESENTE')
      const ausentes = (jaRegistrados || []).filter(r => r.id_indisponibilidade !== motivoPresente?.id)
      const idsAusentes = ausentes.map(r => r.eletricista_id)

      if (idsAusentes.length > 0) {
        const { data: eletAusentes } = await supabase
          .from('estrutura_equipes')
          .select('id, colaborador, matricula, prefixo')
          .in('id', idsAusentes)
          .order('colaborador')
        setAusentesHoje(eletAusentes || [])
      } else {
        setAusentesHoje([])
      }

      // Indisponibilidades já registradas no dia
      const { data: indispHoje } = await supabase
        .from('indisponibilidades')
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

  const upd = (eletId, campo, valor) => {
    setRegistros(prev => ({ ...prev, [eletId]: { ...prev[eletId], [campo]: valor } }))
  }

  const setStatus = (eletId, status, prefixoPadrao) => {
    setRegistros(prev => ({
      ...prev,
      [eletId]: { ...prev[eletId], status, prefixo: prev[eletId]?.prefixo || prefixoPadrao || '' },
    }))
  }

  // ─── Salvar Frequência ────────────────────────────────────────────────────
  const salvarFrequencia = async () => {
    const marcados = Object.entries(registros).filter(([, r]) => r.status)
    if (marcados.length === 0) {
      setErro('Nenhum eletricista marcado.')
      return
    }
    if (marcados.some(([, r]) => r.status === 'presente' && !r.prefixo)) {
      setErro('Selecione o prefixo para todos os eletricistas Presentes.')
      return
    }
    if (marcados.some(([, r]) => r.status === 'ausente' && !r.motivo_id)) {
      setErro('Selecione o motivo para todos os eletricistas Ausentes.')
      return
    }

    setSalvando(true)
    setErro('')
    setSucesso('')

    try {
      const eletMap = {}
      eletricistas.forEach(e => { eletMap[e.id] = e })

      const motivoPresente = motivos.find(m => m.descricao.toUpperCase() === 'PRESENTE')
      if (!motivoPresente) throw new Error('Motivo "PRESENTE" não encontrado.')

      // Tudo vai para equipes_dia
      const linhas = marcados.map(([id, r]) => {
        const elet = eletMap[id] || {}
        const isPresente = r.status === 'presente'
        return {
          eletricista_id:       Number(id),
          prefixo:              isPresente ? r.prefixo : (elet.prefixo || ''),
          data,
          supervisor_registro:  supervisorCampo || 'Administrador',
          usuario_registro:     usuarioLogado?.login || 'admin',
          id_indisponibilidade: isPresente ? motivoPresente.id : Number(r.motivo_id),
          observacoes:          r.obs || null,
        }
      })

      const { error } = await supabase
        .from('equipes_dia')
        .upsert(linhas, { onConflict: 'eletricista_id,data' })
      if (error) throw error

      const totalP = marcados.filter(([, r]) => r.status === 'presente').length
      const totalA = marcados.filter(([, r]) => r.status === 'ausente').length
      setSucesso(`✅ ${totalP} presente(s) e ${totalA} ausente(s) registrado(s)!`)
      await carregar()
    } catch (e) {
      setErro('Erro ao salvar: ' + e.message)
    } finally {
      setSalvando(false)
    }
  }

  // ─── Remanejamento ────────────────────────────────────────────────────────
  const buscarRemanejamento = async (texto) => {
    setBuscaReman(texto)
    if (texto.length < 3) { setResultadosReman([]); return }
    setBuscandoReman(true)
    const { data: jaReg } = await supabase.from('equipes_dia').select('eletricista_id').eq('data', data)
    const idsReg = new Set((jaReg || []).map(r => r.eletricista_id))
    const idsNaLista = new Set(eletricistas.map(e => e.id))
    const { data: res } = await supabase
      .from('estrutura_equipes')
      .select('id, colaborador, matricula, prefixo, superv_campo')
      .ilike('colaborador', `%${texto}%`)
      .in('descr_situacao', ['ATIVO', 'RESERVA'])
      .limit(10)
    setResultadosReman((res || []).filter(e => !idsNaLista.has(e.id) && !idsReg.has(e.id)))
    setBuscandoReman(false)
  }

  const confirmarRemanejamento = async (elet) => {
    setSalvando(true)
    try {
      await supabase.from('remanejamentos').upsert({
        eletricista_id:    elet.id,
        supervisor_origem: elet.superv_campo,
        supervisor_destino: supervisorCampo || 'Administrador',
        data, temporario: true,
        usuario_registro: usuarioLogado?.login || 'admin',
      }, { onConflict: 'eletricista_id,data' })
      setEletricistas(prev => [...prev, elet])
      setResultadosReman([])
      setBuscaReman('')
      setSucesso(`✅ ${elet.colaborador} adicionado à lista de frequência.`)
    } catch (e) {
      setErro('Erro no remanejamento: ' + e.message)
    } finally {
      setSalvando(false)
    }
  }

  // ─── Salvar Indisponibilidade (aba 3) ─────────────────────────────────────
  const onEletristaIndispChange = (eletristaId) => {
    const elet = ausentesHoje.find(e => String(e.id) === String(eletristaId))
    setFormIndisp(f => ({
      ...f,
      eletricista_id: eletristaId,
      prefixo:        elet?.prefixo || '',
    }))
  }

  const salvarIndisponibilidade = async () => {
    if (!formIndisp.eletricista_id) { setErro('Selecione um eletricista.'); return }
    if (!formIndisp.motivo_id)      { setErro('Selecione o motivo.'); return }
    if (!formIndisp.prefixo)        { setErro('Informe o prefixo da equipe.'); return }

    setSalvandoIndisp(true)
    setErro('')
    setSucesso('')

    try {
      const elet = ausentesHoje.find(e => String(e.id) === String(formIndisp.eletricista_id))
      const { error } = await supabase.from('indisponibilidades').upsert({
        data,
        eletricista_id:        Number(formIndisp.eletricista_id),
        matricula:             elet?.matricula || null,
        prefixo:               formIndisp.prefixo,
        tipo_indisponibilidade: formIndisp.tipo,
        motivo_id:             Number(formIndisp.motivo_id),
        observacao:            formIndisp.obs || null,
        usuario_registro:      usuarioLogado?.login || 'admin',
      }, { onConflict: 'eletricista_id,data' })
      if (error) throw error

      setSucesso(`✅ Indisponibilidade de ${elet?.colaborador} registrada!`)
      setFormIndisp({ eletricista_id: '', prefixo: '', tipo: 'total', motivo_id: '', obs: '' })
      await carregar()
    } catch (e) {
      setErro('Erro ao registrar: ' + e.message)
    } finally {
      setSalvandoIndisp(false)
    }
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

        {/* ── Data ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>
            📅 Data do Registro
          </label>
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            className="form-input" style={{ maxWidth: 220 }} />
          {data !== hoje && (
            <p style={{ fontSize: 11, color: '#d97706', marginTop: 6, fontWeight: 600 }}>
              ⚠️ Registrando para data diferente de hoje ({hoje}).
            </p>
          )}
        </div>

        {/* ── Abas ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'frequencia',    emoji: '📋', label: 'Frequência da Equipe' },
            { id: 'remanejamento', emoji: '🔄', label: 'Remanejar Eletricista' },
            { id: 'indisponivel',  emoji: '⚠️', label: 'Indisponível' },
          ].map(aba => (
            <button key={aba.id} onClick={() => { setAbaAtiva(aba.id); setErro(''); setSucesso('') }} style={{
              padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
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
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 30, textAlign: 'center', color: '#64748b' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <p style={{ fontWeight: 700 }}>Todos os eletricistas já foram registrados nesta data!</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, background: '#fff', border: '1px solid #16a34a', borderRadius: 8, padding: '4px 10px' }}>
                    ✓ PRESENTE — marque para quem veio trabalhar
                  </div>
                  <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, background: '#fff', border: '1px solid #dc2626', borderRadius: 8, padding: '4px 10px' }}>
                    ✗ AUSENTE — marque para quem faltou (selecione motivo)
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {eletricistas.map(elet => {
                    const reg = registros[elet.id] || {}
                    const isPresente = reg.status === 'presente'
                    const isAusente  = reg.status === 'ausente'

                    return (
                      <div key={elet.id} style={{
                        background: '#fff', borderRadius: 14,
                        border: `1.5px solid ${isPresente ? '#86efac' : isAusente ? '#fca5a5' : '#e2e8f0'}`,
                        padding: '14px 16px', transition: 'border-color 0.2s',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (isPresente || isAusente) ? 12 : 0, flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{elet.colaborador}</p>
                            <p style={{ fontSize: 11, color: '#64748b' }}>
                              Mat: {elet.matricula} · Prefixo: {elet.prefixo || '—'} · {elet.base || '—'}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setStatus(elet.id, isPresente ? null : 'presente', elet.prefixo)} style={{
                              padding: '8px 14px', borderRadius: 8, border: `1.5px solid #16a34a`, cursor: 'pointer',
                              fontSize: 13, fontWeight: 700,
                              background: isPresente ? '#16a34a' : '#f0fdf4',
                              color:      isPresente ? '#fff'    : '#16a34a',
                            }}>✓ Presente</button>
                            <button onClick={() => setStatus(elet.id, isAusente ? null : 'ausente', elet.prefixo)} style={{
                              padding: '8px 14px', borderRadius: 8, border: `1.5px solid #dc2626`, cursor: 'pointer',
                              fontSize: 13, fontWeight: 700,
                              background: isAusente ? '#dc2626' : '#fef2f2',
                              color:      isAusente ? '#fff'    : '#dc2626',
                            }}>✗ Ausente</button>
                          </div>
                        </div>

                        {isPresente && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Prefixo da Equipe *</label>
                              <select className="form-input" value={reg.prefixo || ''} onChange={e => upd(elet.id, 'prefixo', e.target.value)}>
                                <option value="">Selecione...</option>
                                {prefixos.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Observação (opcional)</label>
                              <input className="form-input" value={reg.obs || ''} onChange={e => upd(elet.id, 'obs', e.target.value)} placeholder="Ex: equipe extra" />
                            </div>
                          </div>
                        )}

                        {isAusente && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
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

                {totalMarcados > 0 && (
                  <div style={{
                    position: 'sticky', bottom: 16, background: '#fff', borderRadius: 14,
                    border: '1.5px solid #bfdbfe', padding: '14px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                  }}>
                    <p style={{ fontSize: 13, color: '#1e293b', fontWeight: 700 }}>
                      {totalPresentes > 0 && `✅ ${totalPresentes} presente(s)`}
                      {totalPresentes > 0 && totalAusentes > 0 && ' · '}
                      {totalAusentes  > 0 && `❌ ${totalAusentes} ausente(s)`}
                    </p>
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
              <input className="form-input" value={buscaReman} onChange={e => buscarRemanejamento(e.target.value)}
                placeholder="Digite ao menos 3 letras do nome..." />
              {buscandoReman && <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>⏳ Buscando...</p>}
              {resultadosReman.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 300, overflowY: 'auto',
                }}>
                  {resultadosReman.map(e => (
                    <div key={e.id} style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{e.colaborador}</p>
                        <p style={{ fontSize: 11, color: '#64748b' }}>Mat: {e.matricula} · Supervisor: {e.superv_campo}</p>
                      </div>
                      <button onClick={() => confirmarRemanejamento(e)} style={{
                        padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: '#1e3a5f', color: '#fff', fontSize: 12, fontWeight: 700,
                      }}>Adicionar</button>
                    </div>
                  ))}
                </div>
              )}
              {buscaReman.length >= 3 && !buscandoReman && resultadosReman.length === 0 && (
                <p style={{ fontSize: 12, color: '#dc2626', marginTop: 6, fontWeight: 600 }}>
                  ❌ Nenhum eletricista disponível encontrado.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ABA 3: INDISPONÍVEL
        ══════════════════════════════════════════════ */}
        {abaAtiva === 'indisponivel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Formulário de registro */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #fed7aa', padding: '20px' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#9a3412', marginBottom: 4 }}>⚠️ Registrar Indisponibilidade de Equipe</p>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
                Selecione um eletricista ausente e registre qual equipe/prefixo ficou parado e o motivo.
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
                    <select className="form-input" value={formIndisp.eletricista_id}
                      onChange={e => onEletristaIndispChange(e.target.value)}>
                      <option value="">— Selecione o eletricista ausente —</option>
                      {ausentesHoje.map(e => (
                        <option key={e.id} value={e.id}>{e.colaborador} (Mat: {e.matricula})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Prefixo da Equipe * <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>(preenchido automaticamente, editável)</span></label>
                    <input className="form-input" value={formIndisp.prefixo}
                      onChange={e => setFormIndisp(f => ({ ...f, prefixo: e.target.value }))}
                      placeholder="Ex: PI-THE-C001M" />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group">
                      <label className="form-label">Tipo de Indisponibilidade *</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[
                          { val: 'parcial', label: '⏱ Parcial', sub: 'Apenas um turno' },
                          { val: 'total',   label: '🚫 Total',   sub: 'O dia inteiro' },
                        ].map(t => (
                          <button key={t.val} onClick={() => setFormIndisp(f => ({ ...f, tipo: t.val }))} style={{
                            flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                            border: `2px solid ${formIndisp.tipo === t.val ? '#1e3a5f' : '#e2e8f0'}`,
                            background: formIndisp.tipo === t.val ? '#eff6ff' : '#fff',
                            textAlign: 'center',
                          }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: formIndisp.tipo === t.val ? '#1e3a5f' : '#374151' }}>{t.label}</p>
                            <p style={{ fontSize: 10, color: '#64748b' }}>{t.sub}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Motivo *</label>
                      <select className="form-input" value={formIndisp.motivo_id}
                        onChange={e => setFormIndisp(f => ({ ...f, motivo_id: e.target.value }))}>
                        <option value="">— Selecione —</option>
                        {motivos.filter(m => m.descricao.toUpperCase() !== 'PRESENTE').map(m => (
                          <option key={m.id} value={m.id}>{m.descricao}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Observações (opcional)</label>
                    <textarea className="form-textarea" rows={3}
                      value={formIndisp.obs}
                      onChange={e => setFormIndisp(f => ({ ...f, obs: e.target.value }))}
                      placeholder="Informações adicionais sobre a indisponibilidade..." />
                  </div>

                  <button onClick={salvarIndisponibilidade} disabled={salvandoIndisp} className="btn-primary"
                    style={{ background: salvandoIndisp ? '#64748b' : '#c2410c' }}>
                    {salvandoIndisp ? '⏳ Salvando...' : '⚠️ Registrar Indisponibilidade'}
                  </button>
                </>
              )}
            </div>

            {/* Lista de indisponibilidades já registradas no dia */}
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
                            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                            background: r.tipo_indisponibilidade === 'total' ? '#fee2e2' : '#fef3c7',
                            color: r.tipo_indisponibilidade === 'total' ? '#dc2626' : '#d97706',
                            alignSelf: 'flex-start',
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

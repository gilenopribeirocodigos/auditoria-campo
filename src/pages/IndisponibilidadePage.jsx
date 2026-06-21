import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

// ════════════════════════════════════════════════════════════════════════════
// Registrar Indisponibilidade — VérticeGP
// ────────────────────────────────────────────────────────────────────────────
// Fluxo:
//  1. Fiscal/supervisor seleciona a DATA
//  2. Sistema carrega eletricistas do supervisor que ainda não foram registrados
//  3. Para cada eletricista: marcar PRESENTE (com prefixo) ou AUSENTE (com motivo)
//  4. Eletricistas ausentes registrados em `indisponibilidades`
//  5. Eletricistas presentes registrados em `equipes_dia`
//  6. Suporte a remanejamento: trazer eletricista de outro supervisor
// ════════════════════════════════════════════════════════════════════════════

export default function IndisponibilidadePage({ usuarioLogado, onVoltar }) {
  const hoje = new Date().toISOString().split('T')[0]
  const [data,            setData]            = useState(hoje)
  const [eletricistas,    setEletricistas]    = useState([])   // não registrados ainda
  const [motivos,         setMotivos]         = useState([])
  const [prefixos,        setPrefixos]        = useState([])
  const [loading,         setLoading]         = useState(false)
  const [salvando,        setSalvando]        = useState(false)
  const [erro,            setErro]            = useState('')
  const [sucesso,         setSucesso]         = useState('')

  // Estado de cada eletricista na lista
  // { [eletricista_id]: { status: 'presente'|'ausente'|null, prefixo, motivo_id, obs } }
  const [registros,       setRegistros]       = useState({})

  // Busca de eletricista para remanejamento
  const [buscaReman,      setBuscaReman]      = useState('')
  const [resultadosReman, setResultadosReman] = useState([])
  const [buscandoReman,   setBuscandoReman]   = useState(false)
  const [abaAtiva,        setAbaAtiva]        = useState('frequencia') // 'frequencia' | 'remanejamento'

  const isSupervisor = usuarioLogado?.perfil !== 'ADMIN'
  const supervisorCampo = usuarioLogado?.nome  // usado pra filtrar equipe

  // ─── Carrega dados ao mudar a data ─────────────────────────────────────────
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

      // IDs já registrados na data — tudo fica em equipes_dia (presentes E ausentes)
      const { data: jaRegistrados } = await supabase
        .from('equipes_dia')
        .select('eletricista_id')
        .eq('data', data)

      const idsRegistrados = new Set((jaRegistrados || []).map(p => p.eletricista_id))

      // Eletricistas do supervisor que ainda não foram registrados
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

      // Prefixos do supervisor para o select
      const prefixosUnicos = [...new Set((todosElet || []).map(e => e.prefixo).filter(Boolean))].sort()
      setPrefixos(prefixosUnicos)

    } catch (e) {
      setErro('Erro ao carregar dados: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [data, supervisorCampo, isSupervisor])

  useEffect(() => { carregar() }, [carregar])

  // ─── Atualiza um campo do registro de um eletricista ───────────────────────
  const upd = (eletId, campo, valor) => {
    setRegistros(prev => ({
      ...prev,
      [eletId]: { ...prev[eletId], [campo]: valor },
    }))
  }

  const setStatus = (eletId, status, prefixoPadrao) => {
    setRegistros(prev => ({
      ...prev,
      [eletId]: {
        ...prev[eletId],
        status,
        prefixo: prev[eletId]?.prefixo || prefixoPadrao || '',
      },
    }))
  }

  // ─── Salva todos os registros marcados ─────────────────────────────────────
  const salvar = async () => {
    const marcados = Object.entries(registros).filter(([, r]) => r.status)
    if (marcados.length === 0) {
      setErro('Nenhum eletricista marcado. Marque pelo menos um como Presente ou Ausente.')
      return
    }

    const semPrefixo = marcados.filter(([, r]) => r.status === 'presente' && !r.prefixo)
    if (semPrefixo.length > 0) {
      setErro('Selecione o prefixo da equipe para todos os eletricistas marcados como Presente.')
      return
    }

    const semMotivo = marcados.filter(([, r]) => r.status === 'ausente' && !r.motivo_id)
    if (semMotivo.length > 0) {
      setErro('Selecione o motivo de ausência para todos os eletricistas marcados como Ausente.')
      return
    }

    setSalvando(true)
    setErro('')
    setSucesso('')

    try {
      const eletMap = {}
      eletricistas.forEach(e => { eletMap[e.id] = e })

      // Busca id do motivo PRESENTE
      const motivoPresente = motivos.find(m => m.descricao.toUpperCase() === 'PRESENTE')
      if (!motivoPresente) throw new Error('Motivo "PRESENTE" não encontrado na tabela motivos_indisponibilidade.')

      // ── Tudo vai para equipes_dia ──────────────────────────────────────────
      // Presentes → id_indisponibilidade = id do motivo PRESENTE
      // Ausentes  → id_indisponibilidade = id do motivo de ausência escolhido
      // Esta é a mesma lógica do sistema original.
      const linhasEquipesDia = marcados.map(([id, r]) => {
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

      const { error: errEquipes } = await supabase
        .from('equipes_dia')
        .upsert(linhasEquipesDia, { onConflict: 'eletricista_id,data' })
      if (errEquipes) throw errEquipes

      // ── Ausentes: grava também em indisponibilidades (detalhe tipo parcial/total) ──
      const ausentesArr = marcados.filter(([, r]) => r.status === 'ausente')
      if (ausentesArr.length > 0) {
        const linhasIndisp = ausentesArr.map(([id, r]) => {
          const elet = eletMap[id] || {}
          return {
            data,
            eletricista_id:        Number(id),
            matricula:             elet.matricula || null,
            prefixo:               elet.prefixo  || '',
            tipo_indisponibilidade: r.tipo || 'total',
            motivo_id:             Number(r.motivo_id),
            observacao:            r.obs || null,
            usuario_registro:      usuarioLogado?.login || 'admin',
          }
        })
        const { error: errIndisp } = await supabase
          .from('indisponibilidades')
          .upsert(linhasIndisp, { onConflict: 'eletricista_id,data' })
        if (errIndisp) throw errIndisp
      }

      const totalPresentes = marcados.filter(([, r]) => r.status === 'presente').length
      const totalAusentes  = ausentesArr.length
      setSucesso(`✅ ${totalPresentes} presente(s) e ${totalAusentes} ausente(s) registrado(s) para ${data}!`)
      await carregar()
    } catch (e) {
      setErro('Erro ao salvar: ' + e.message)
    } finally {
      setSalvando(false)
    }
  }

  // ─── Busca eletricista para remanejamento ───────────────────────────────────
  const buscarRemanejamento = async (texto) => {
    setBuscaReman(texto)
    if (texto.length < 3) { setResultadosReman([]); return }
    setBuscandoReman(true)
    const { data: res } = await supabase
      .from('estrutura_equipes')
      .select('id, colaborador, matricula, prefixo, superv_campo')
      .ilike('colaborador', `%${texto}%`)
      .in('descr_situacao', ['ATIVO', 'RESERVA'])
      .limit(10)
    // Exclui quem já está na lista atual ou já foi registrado
    const idsNaLista = new Set(eletricistas.map(e => e.id))
    setResultadosReman((res || []).filter(e => !idsNaLista.has(e.id)))
    setBuscandoReman(false)
  }

  const confirmarRemanejamento = async (eletricista) => {
    setSalvando(true)
    try {
      // Verifica se já tem registro na data
      const { data: jaExiste } = await supabase
        .from('equipes_dia')
        .select('id')
        .eq('eletricista_id', eletricista.id)
        .eq('data', data)
        .single()

      if (jaExiste) {
        setErro(`❌ ${eletricista.colaborador} já foi registrado hoje.`)
        return
      }

      // Grava remanejamento
      await supabase.from('remanejamentos').upsert({
        eletricista_id:    eletricista.id,
        supervisor_origem: eletricista.superv_campo,
        supervisor_destino: supervisorCampo || 'Administrador',
        data,
        temporario:        true,
        usuario_registro:  usuarioLogado?.login || 'admin',
      }, { onConflict: 'eletricista_id,data' })

      // Adiciona à lista local para poder ser registrado
      setEletricistas(prev => [...prev, eletricista])
      setResultadosReman([])
      setBuscaReman('')
      setSucesso(`✅ ${eletricista.colaborador} adicionado à sua lista para registro.`)
    } catch (e) {
      setErro('Erro no remanejamento: ' + e.message)
    } finally {
      setSalvando(false)
    }
  }

  // ─── Contadores para o header ───────────────────────────────────────────────
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
                { label: 'NA LISTA', val: eletricistas.length,   cor: '#93c5fd' },
                { label: 'PRESENTES', val: totalPresentes,        cor: '#86efac' },
                { label: 'AUSENTES',  val: totalAusentes,         cor: '#fca5a5' },
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

        {/* ── Seleção de data ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>
            📅 Data do Registro
          </label>
          <input
            type="date"
            value={data}
            onChange={e => setData(e.target.value)}
            className="form-input"
            style={{ maxWidth: 220 }}
          />
          {data !== hoje && (
            <p style={{ fontSize: 11, color: '#d97706', marginTop: 6, fontWeight: 600 }}>
              ⚠️ Você está registrando para uma data diferente de hoje ({hoje}).
            </p>
          )}
        </div>

        {/* ── Abas: Frequência | Remanejamento ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'frequencia',    label: '📋 Frequência da Equipe' },
            { id: 'remanejamento', label: '🔄 Remanejar Eletricista' },
          ].map(aba => (
            <button key={aba.id} onClick={() => setAbaAtiva(aba.id)} style={{
              padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              background: abaAtiva === aba.id ? '#1e3a5f' : '#e2e8f0',
              color:      abaAtiva === aba.id ? '#fff'    : '#374151',
            }}>{aba.label}</button>
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
            ABA: FREQUÊNCIA DA EQUIPE
        ══════════════════════════════════════════════ */}
        {abaAtiva === 'frequencia' && (
          <>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>⏳ Carregando eletricistas...</div>
            ) : eletricistas.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 30, textAlign: 'center', color: '#64748b' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <p style={{ fontWeight: 700 }}>Todos os eletricistas já foram registrados para esta data!</p>
                <p style={{ fontSize: 12, marginTop: 6 }}>Para registrar alguém extra, use a aba "Remanejar Eletricista".</p>
              </div>
            ) : (
              <>
                {/* Legenda */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  {[
                    { cor: '#16a34a', label: '✓ PRESENTE — marque para quem veio trabalhar' },
                    { cor: '#dc2626', label: '✗ AUSENTE — marque para quem faltou (selecione motivo)' },
                  ].map(({ cor, label }) => (
                    <div key={cor} style={{ fontSize: 11, color: cor, fontWeight: 600, background: '#fff', border: `1px solid ${cor}`, borderRadius: 8, padding: '4px 10px' }}>
                      {label}
                    </div>
                  ))}
                </div>

                {/* Lista de eletricistas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {eletricistas.map(elet => {
                    const reg = registros[elet.id] || {}
                    const isPresente = reg.status === 'presente'
                    const isAusente  = reg.status === 'ausente'

                    return (
                      <div key={elet.id} style={{
                        background: '#fff',
                        borderRadius: 14,
                        border: `1.5px solid ${isPresente ? '#86efac' : isAusente ? '#fca5a5' : '#e2e8f0'}`,
                        padding: '14px 16px',
                        transition: 'border-color 0.2s',
                      }}>
                        {/* Nome e matrícula */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{elet.colaborador}</p>
                            <p style={{ fontSize: 11, color: '#64748b' }}>
                              Mat: {elet.matricula} · Prefixo: {elet.prefixo || '—'} · {elet.base || '—'}
                            </p>
                          </div>
                          {/* Botões Presente / Ausente */}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => setStatus(elet.id, isPresente ? null : 'presente', elet.prefixo)}
                              style={{
                                padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                fontSize: 13, fontWeight: 700,
                                background: isPresente ? '#16a34a' : '#f0fdf4',
                                color:      isPresente ? '#fff'    : '#16a34a',
                                border:     `1.5px solid #16a34a`,
                              }}>✓ Presente</button>
                            <button
                              onClick={() => setStatus(elet.id, isAusente ? null : 'ausente', elet.prefixo)}
                              style={{
                                padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                fontSize: 13, fontWeight: 700,
                                background: isAusente ? '#dc2626' : '#fef2f2',
                                color:      isAusente ? '#fff'    : '#dc2626',
                                border:     `1.5px solid #dc2626`,
                              }}>✗ Ausente</button>
                          </div>
                        </div>

                        {/* Campos extras quando PRESENTE */}
                        {isPresente && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Prefixo da Equipe *</label>
                              <select
                                className="form-input"
                                value={reg.prefixo || ''}
                                onChange={e => upd(elet.id, 'prefixo', e.target.value)}
                              >
                                <option value="">Selecione...</option>
                                {prefixos.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Observação (opcional)</label>
                              <input
                                className="form-input"
                                value={reg.obs || ''}
                                onChange={e => upd(elet.id, 'obs', e.target.value)}
                                placeholder="Ex: equipe extra"
                              />
                            </div>
                          </div>
                        )}

                        {/* Campos extras quando AUSENTE */}
                        {isAusente && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Motivo *</label>
                              <select
                                className="form-input"
                                value={reg.motivo_id || ''}
                                onChange={e => upd(elet.id, 'motivo_id', e.target.value)}
                              >
                                <option value="">Selecione...</option>
                                {motivos
                                  .filter(m => m.descricao.toUpperCase() !== 'PRESENTE')
                                  .map(m => <option key={m.id} value={m.id}>{m.descricao}</option>)}
                              </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Tipo</label>
                              <select
                                className="form-input"
                                value={reg.tipo || 'total'}
                                onChange={e => upd(elet.id, 'tipo', e.target.value)}
                              >
                                <option value="total">Total</option>
                                <option value="parcial">Parcial</option>
                              </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Observação</label>
                              <input
                                className="form-input"
                                value={reg.obs || ''}
                                onChange={e => upd(elet.id, 'obs', e.target.value)}
                                placeholder="Detalhe se necessário"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Botão salvar */}
                {totalMarcados > 0 && (
                  <div style={{
                    position: 'sticky', bottom: 16,
                    background: '#fff', borderRadius: 14,
                    border: '1.5px solid #bfdbfe', padding: '14px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                  }}>
                    <p style={{ fontSize: 13, color: '#1e293b', fontWeight: 700 }}>
                      {totalPresentes > 0 && `✅ ${totalPresentes} presente(s)`}
                      {totalPresentes > 0 && totalAusentes > 0 && ' · '}
                      {totalAusentes  > 0 && `❌ ${totalAusentes} ausente(s)`}
                    </p>
                    <button
                      onClick={salvar}
                      disabled={salvando}
                      className="btn-primary"
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
            ABA: REMANEJAMENTO
        ══════════════════════════════════════════════ */}
        {abaAtiva === 'remanejamento' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>🔄 Remanejar Eletricista</p>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Adicione um eletricista de outro supervisor à sua lista de frequência de hoje.
              Isso registra um remanejamento temporário e libera o eletricista para você registrar.
            </p>

            <div style={{ position: 'relative' }}>
              <label className="form-label">Buscar eletricista pelo nome</label>
              <input
                className="form-input"
                value={buscaReman}
                onChange={e => buscarRemanejamento(e.target.value)}
                placeholder="Digite ao menos 3 letras do nome..."
              />
              {buscandoReman && <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>⏳ Buscando...</p>}

              {resultadosReman.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 300, overflowY: 'auto',
                }}>
                  {resultadosReman.map(e => (
                    <div key={e.id} style={{
                      padding: '12px 14px', borderBottom: '1px solid #f1f5f9',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{e.colaborador}</p>
                        <p style={{ fontSize: 11, color: '#64748b' }}>Mat: {e.matricula} · Supervisor: {e.superv_campo}</p>
                      </div>
                      <button
                        onClick={() => confirmarRemanejamento(e)}
                        style={{
                          padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          background: '#1e3a5f', color: '#fff', fontSize: 12, fontWeight: 700,
                        }}>Adicionar</button>
                    </div>
                  ))}
                </div>
              )}

              {buscaReman.length >= 3 && !buscandoReman && resultadosReman.length === 0 && (
                <p style={{ fontSize: 12, color: '#dc2626', marginTop: 6, fontWeight: 600 }}>
                  ❌ Nenhum eletricista disponível encontrado com esse nome.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

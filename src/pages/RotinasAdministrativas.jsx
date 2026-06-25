import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { isAdmin, temPermissao } from '../lib/auth.js'

const hojeISO = () => new Date().toISOString().slice(0, 10)
const agoraISO = () => new Date().toISOString()
const horaAtual = () => new Date().toTimeString().slice(0, 5)

const STATUS = {
  PENDENTE:      { label: 'Pendente',      bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  ATRASADA:      { label: 'Atrasada',      bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
  EM_ANDAMENTO:  { label: 'Em andamento',  bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' },
  CONCLUIDA:     { label: 'Concluída',     bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  CANCELADA:     { label: 'Cancelada',     bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
}

const PRIORIDADES = ['BAIXA', 'NORMAL', 'ALTA', 'CRITICA']
const PERFIS_DESTINO = ['', 'SUPERV. OPERAÇÃO', 'SUPERV. CAMPO', 'ANALISTA', 'ASSISTENTE']

const modeloVazio = {
  titulo: '',
  descricao: '',
  horario_previsto: '08:00',
  prioridade: 'NORMAL',
  responsavel_login: '',
  perfil_responsavel: '',
}

function normalizar(valor) {
  return (valor || '').toString().trim().toUpperCase()
}

function usuarioNome(usuario) {
  return usuario?.nome || usuario?.login || 'Usuário'
}

function dentroDoEscopo(item, usuario, acessoGeral) {
  if (acessoGeral) return true
  const login = (usuario?.login || '').toLowerCase()
  const perfil = normalizar(usuario?.perfil)
  const responsavel = (item.responsavel_login || '').toLowerCase()
  const perfilResp = normalizar(item.perfil_responsavel)
  if (!responsavel && !perfilResp) return true
  if (responsavel && responsavel === login) return true
  if (perfilResp && perfilResp === perfil) return true
  return false
}

function statusVisual(rotina) {
  if (!rotina) return 'PENDENTE'
  if (rotina.status !== 'PENDENTE') return rotina.status
  if (!rotina.horario_previsto) return rotina.status
  if (rotina.data_execucao < hojeISO()) return 'ATRASADA'
  if (rotina.data_execucao > hojeISO()) return rotina.status
  return rotina.horario_previsto.slice(0, 5) < horaAtual() ? 'ATRASADA' : rotina.status
}

function statusMeta(rotina) {
  return STATUS[statusVisual(rotina)] || STATUS.PENDENTE
}

function fmtData(data) {
  if (!data) return ''
  const [ano, mes, dia] = data.split('-')
  return dia + '/' + mes + '/' + ano
}

function fmtHora(valor) {
  return (valor || '').slice(0, 5)
}

function Botao({ children, ativo, onClick, style = {}, disabled = false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      border: 'none', borderRadius: 10, padding: '10px 14px', cursor: disabled ? 'not-allowed' : 'pointer',
      fontWeight: 800, fontSize: 13,
      background: ativo ? '#1e3a5f' : '#e2e8f0', color: ativo ? '#fff' : '#1e293b',
      opacity: disabled ? 0.6 : 1,
      ...style,
    }}>{children}</button>
  )
}

function CardNumero({ valor, label, cor = '#2563eb' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: cor }}>{valor}</div>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

function Pill({ meta, children }) {
  return (
    <span style={{
      background: meta.bg, color: meta.color, border: '1px solid ' + meta.border,
      borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 900,
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{children || meta.label}</span>
  )
}

function Campo({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle = {
  width: '100%', border: '1px solid #cbd5e1', borderRadius: 10, padding: '11px 12px',
  fontSize: 14, outline: 'none', background: '#fff', color: '#0f172a', boxSizing: 'border-box',
}

export default function RotinasAdministrativas({ usuarioLogado, onVoltar }) {
  const [aba, setAba] = useState('hoje')
  const [dataSelecionada, setDataSelecionada] = useState(hojeISO())
  const [modelos, setModelos] = useState([])
  const [execucoes, setExecucoes] = useState([])
  const [subrotinas, setSubrotinas] = useState([])
  const [diario, setDiario] = useState([])
  const [selecionadaId, setSelecionadaId] = useState(null)
  const [modeloForm, setModeloForm] = useState(modeloVazio)
  const [novaSubrotina, setNovaSubrotina] = useState('')
  const [novoDiario, setNovoDiario] = useState('')
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')

  const acessoGeral = isAdmin(usuarioLogado) || temPermissao(usuarioLogado, 'rotinas_dashboard')
  const podeConfigurar = isAdmin(usuarioLogado) || temPermissao(usuarioLogado, 'rotinas_configurar')

  const selecionada = useMemo(
    () => execucoes.find(r => r.id === selecionadaId) || execucoes[0] || null,
    [execucoes, selecionadaId]
  )

  const visiveis = useMemo(() => execucoes, [execucoes])

  const contadores = useMemo(() => {
    const total = visiveis.length
    const pendentes = visiveis.filter(r => statusVisual(r) === 'PENDENTE').length
    const atrasadas = visiveis.filter(r => statusVisual(r) === 'ATRASADA').length
    const andamento = visiveis.filter(r => statusVisual(r) === 'EM_ANDAMENTO').length
    const concluidas = visiveis.filter(r => statusVisual(r) === 'CONCLUIDA').length
    const canceladas = visiveis.filter(r => statusVisual(r) === 'CANCELADA').length
    return { total, pendentes, atrasadas, andamento, concluidas, canceladas }
  }, [visiveis])

  const acompanhamento = useMemo(() => {
    const mapa = new Map()
    visiveis.forEach(r => {
      const chave = r.responsavel_login || r.perfil_responsavel || 'GERAL'
      if (!mapa.has(chave)) mapa.set(chave, { nome: chave, total: 0, pendentes: 0, atrasadas: 0, andamento: 0, concluidas: 0, canceladas: 0 })
      const linha = mapa.get(chave)
      linha.total += 1
      const st = statusVisual(r).toLowerCase()
      if (st === 'em_andamento') linha.andamento += 1
      else if (st === 'concluida') linha.concluidas += 1
      else if (st === 'cancelada') linha.canceladas += 1
      else if (st === 'atrasada') linha.atrasadas += 1
      else linha.pendentes += 1
    })
    return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [visiveis])

  const carregar = async () => {
    setLoading(true)
    setErro('')
    try {
      const { data: mods, error: errMods } = await supabase
        .from('rotinas_modelos')
        .select('*')
        .order('horario_previsto', { ascending: true })
      if (errMods) throw errMods

      const modelosEscopo = (mods || []).filter(m => m.ativa !== false && dentroDoEscopo(m, usuarioLogado, acessoGeral))
      setModelos(mods || [])

      const { data: existentes, error: errExistentes } = await supabase
        .from('rotinas_execucoes')
        .select('*')
        .eq('data_execucao', dataSelecionada)
      if (errExistentes) throw errExistentes

      const existentesIds = new Set((existentes || []).map(e => e.rotina_modelo_id).filter(Boolean))
      const faltantes = modelosEscopo
        .filter(m => !existentesIds.has(m.id))
        .map(m => ({
          rotina_modelo_id: m.id,
          data_execucao: dataSelecionada,
          titulo_snapshot: m.titulo,
          descricao_snapshot: m.descricao || null,
          horario_previsto: m.horario_previsto,
          prioridade: m.prioridade || 'NORMAL',
          responsavel_login: m.responsavel_login || null,
          perfil_responsavel: m.perfil_responsavel || null,
          status: 'PENDENTE',
        }))

      if (faltantes.length > 0) {
        const { error: errInsert } = await supabase
          .from('rotinas_execucoes')
          .upsert(faltantes, { onConflict: 'rotina_modelo_id,data_execucao', ignoreDuplicates: true })
        if (errInsert) throw errInsert
      }

      const { data: execs, error: errExecs } = await supabase
        .from('rotinas_execucoes')
        .select('*')
        .eq('data_execucao', dataSelecionada)
        .order('horario_previsto', { ascending: true })
      if (errExecs) throw errExecs

      const execsEscopo = (execs || []).filter(e => dentroDoEscopo(e, usuarioLogado, acessoGeral))
      setExecucoes(execsEscopo)
      if (!selecionadaId || !execsEscopo.some(e => e.id === selecionadaId)) {
        setSelecionadaId(execsEscopo[0]?.id || null)
      }
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const carregarDetalhes = async () => {
    if (!selecionada?.id) {
      setSubrotinas([])
      setDiario([])
      return
    }
    const [{ data: subs, error: errSubs }, { data: logs, error: errLogs }] = await Promise.all([
      supabase.from('rotinas_subrotinas').select('*').eq('rotina_execucao_id', selecionada.id).order('created_at', { ascending: true }),
      supabase.from('rotinas_diario').select('*').eq('rotina_execucao_id', selecionada.id).order('created_at', { ascending: false }),
    ])
    if (errSubs) setErro(errSubs.message)
    else setSubrotinas(subs || [])
    if (errLogs) setErro(errLogs.message)
    else setDiario(logs || [])
  }

  useEffect(() => { carregar() }, [dataSelecionada])
  useEffect(() => { carregarDetalhes() }, [selecionada?.id])

  const flash = texto => {
    setMsg(texto)
    setTimeout(() => setMsg(''), 3500)
  }

  const salvarModelo = async () => {
    if (!modeloForm.titulo.trim()) { setErro('Informe o título da rotina.'); return }
    setSalvando(true)
    setErro('')
    try {
      const payload = {
        ...modeloForm,
        titulo: modeloForm.titulo.trim(),
        descricao: modeloForm.descricao.trim() || null,
        responsavel_login: modeloForm.responsavel_login.trim().toLowerCase() || null,
        perfil_responsavel: modeloForm.perfil_responsavel || null,
        criado_por: usuarioLogado?.login || null,
        ativa: true,
      }
      const { error } = await supabase.from('rotinas_modelos').insert(payload)
      if (error) throw error
      setModeloForm(modeloVazio)
      flash('✅ Modelo de rotina criado.')
      await carregar()
      setAba('hoje')
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setSalvando(false)
    }
  }

  const alternarModelo = async modelo => {
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('rotinas_modelos')
        .update({ ativa: !modelo.ativa, updated_at: agoraISO() })
        .eq('id', modelo.id)
      if (error) throw error
      flash(modelo.ativa ? 'Modelo desativado.' : 'Modelo reativado.')
      await carregar()
    } catch (e) { setErro(e.message || String(e)) }
    finally { setSalvando(false) }
  }

  const atualizarStatus = async (rotina, status) => {
    if (!rotina) return
    setSalvando(true)
    setErro('')
    try {
      const payload = { status, updated_at: agoraISO() }
      if (status === 'EM_ANDAMENTO') payload.iniciada_em = rotina.iniciada_em || agoraISO()
      if (status === 'CONCLUIDA') {
        payload.concluida_em = agoraISO()
        payload.concluida_por = usuarioLogado?.login || null
      }
      if (status === 'CANCELADA') {
        payload.cancelada_em = agoraISO()
        payload.cancelada_por = usuarioLogado?.login || null
      }
      const { error } = await supabase.from('rotinas_execucoes').update(payload).eq('id', rotina.id)
      if (error) throw error
      flash(status === 'CONCLUIDA' ? '✅ Rotina concluída.' : status === 'CANCELADA' ? 'Rotina cancelada.' : 'Rotina atualizada.')
      await carregar()
    } catch (e) { setErro(e.message || String(e)) }
    finally { setSalvando(false) }
  }

  const adicionarSubrotina = async () => {
    if (!selecionada || !novaSubrotina.trim()) return
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase.from('rotinas_subrotinas').insert({
        rotina_execucao_id: selecionada.id,
        titulo: novaSubrotina.trim(),
        responsavel_login: usuarioLogado?.login || null,
      })
      if (error) throw error
      setNovaSubrotina('')
      await carregarDetalhes()
    } catch (e) { setErro(e.message || String(e)) }
    finally { setSalvando(false) }
  }

  const concluirSubrotina = async sub => {
    setSalvando(true)
    setErro('')
    try {
      const concluida = sub.status === 'CONCLUIDA'
      const { error } = await supabase.from('rotinas_subrotinas').update({
        status: concluida ? 'PENDENTE' : 'CONCLUIDA',
        concluida_em: concluida ? null : agoraISO(),
        concluida_por: concluida ? null : (usuarioLogado?.login || null),
      }).eq('id', sub.id)
      if (error) throw error
      await carregarDetalhes()
    } catch (e) { setErro(e.message || String(e)) }
    finally { setSalvando(false) }
  }

  const adicionarDiario = async () => {
    if (!selecionada || !novoDiario.trim()) return
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase.from('rotinas_diario').insert({
        rotina_execucao_id: selecionada.id,
        descricao: novoDiario.trim(),
        usuario_registro: usuarioLogado?.login || null,
      })
      if (error) throw error
      setNovoDiario('')
      await carregarDetalhes()
    } catch (e) { setErro(e.message || String(e)) }
    finally { setSalvando(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef3f8' }}>
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', color: '#fff', padding: '22px 20px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.18)', color: '#fff', border: 'none', borderRadius: 9,
            padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 16,
          }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>🗓️ Rotinas Administrativas</h1>
              <p style={{ fontSize: 12, opacity: 0.82, margin: '4px 0 0' }}>Agenda diária, subrotinas e diário de bordo da equipe administrativa</p>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 14px' }}>
              {usuarioNome(usuarioLogado)} · {fmtData(dataSelecionada)}
            </div>
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '18px 16px 80px' }}>
        {erro && <div style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 12, padding: 12, marginBottom: 14, fontWeight: 800 }}>{erro}</div>}
        {msg && <div style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 12, padding: 12, marginBottom: 14, fontWeight: 800 }}>{msg}</div>}

        <section style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            <CardNumero valor={contadores.total} label="Rotinas do dia" />
            <CardNumero valor={contadores.pendentes} label="Pendentes" cor="#d97706" />
            <CardNumero valor={contadores.atrasadas} label="Atrasadas" cor="#dc2626" />
            <CardNumero valor={contadores.andamento} label="Em andamento" cor="#2563eb" />
            <CardNumero valor={contadores.concluidas} label="Concluídas" cor="#16a34a" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, alignItems: 'end' }}>
            <Campo label="Data da agenda">
              <input type="date" value={dataSelecionada} onChange={e => setDataSelecionada(e.target.value || hojeISO())} style={inputStyle} />
            </Campo>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Botao ativo={aba === 'hoje'} onClick={() => setAba('hoje')}>📋 Agenda do Dia</Botao>
              <Botao ativo={aba === 'modelos'} onClick={() => setAba('modelos')}>🛠️ Modelos</Botao>
              <Botao ativo={aba === 'acompanhamento'} onClick={() => setAba('acompanhamento')}>📊 Acompanhamento</Botao>
              <Botao onClick={() => { setDataSelecionada(hojeISO()); setAba('hoje') }} style={{ marginLeft: 'auto' }}>📍 Hoje</Botao>
            </div>
          </div>
        </section>

        {loading ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 36, textAlign: 'center', color: '#64748b', fontWeight: 800 }}>Carregando rotinas...</div>
        ) : aba === 'hoje' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visiveis.length === 0 ? (
                <div style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 14, padding: 30, textAlign: 'center', color: '#64748b', fontWeight: 800 }}>
                  Nenhuma rotina configurada para o seu perfil.
                </div>
              ) : visiveis.map(rotina => {
                const meta = statusMeta(rotina)
                const ativo = rotina.id === selecionada?.id
                return (
                  <article key={rotina.id} onClick={() => setSelecionadaId(rotina.id)} style={{
                    background: ativo ? '#eff6ff' : '#fff', border: '1.5px solid ' + (ativo ? '#60a5fa' : '#dbe3ef'),
                    borderRadius: 14, padding: 14, cursor: 'pointer', boxShadow: ativo ? '0 8px 20px rgba(37,99,235,0.08)' : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                          <strong style={{ fontSize: 16, color: '#0f172a' }}>{fmtHora(rotina.horario_previsto)}</strong>
                          <Pill meta={meta} />
                          {rotina.prioridade && rotina.prioridade !== 'NORMAL' && <span style={{ fontSize: 11, color: '#b45309', fontWeight: 900 }}>Prioridade {rotina.prioridade}</span>}
                        </div>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#0f172a' }}>{rotina.titulo_snapshot}</h2>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                          {rotina.responsavel_login ? 'Responsável: ' + rotina.responsavel_login : rotina.perfil_responsavel ? 'Perfil: ' + rotina.perfil_responsavel : 'Rotina geral'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                        {['PENDENTE', 'ATRASADA'].includes(statusVisual(rotina)) && (
                          <Botao onClick={() => atualizarStatus(rotina, 'EM_ANDAMENTO')} disabled={salvando}>Iniciar</Botao>
                        )}
                        {statusVisual(rotina) !== 'CONCLUIDA' && statusVisual(rotina) !== 'CANCELADA' && (
                          <Botao onClick={() => atualizarStatus(rotina, 'CONCLUIDA')} disabled={salvando} style={{ background: '#16a34a', color: '#fff' }}>Concluir</Botao>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </section>

            <aside style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 14, padding: 16, position: 'sticky', top: 12 }}>
              {!selecionada ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: 20, fontWeight: 800 }}>Selecione uma rotina.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <Pill meta={statusMeta(selecionada)} />
                      <h3 style={{ margin: '10px 0 4px', fontSize: 17, fontWeight: 900, color: '#0f172a' }}>{selecionada.titulo_snapshot}</h3>
                      <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>{fmtHora(selecionada.horario_previsto)} · {selecionada.descricao_snapshot || 'Sem descrição'}</p>
                    </div>
                    {statusVisual(selecionada) !== 'CONCLUIDA' && statusVisual(selecionada) !== 'CANCELADA' && (
                      <Botao onClick={() => atualizarStatus(selecionada, 'CANCELADA')} disabled={salvando}>Cancelar</Botao>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 12 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 900, color: '#0f172a' }}>Subrotinas</h4>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <input value={novaSubrotina} onChange={e => setNovaSubrotina(e.target.value)} placeholder="Ex: falei com supervisor de campo..." style={inputStyle} />
                      <Botao onClick={adicionarSubrotina} disabled={salvando || !novaSubrotina.trim()}>Adicionar</Botao>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {subrotinas.length === 0 && <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>Nenhuma subrotina criada.</p>}
                      {subrotinas.map(sub => (
                        <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 10px' }}>
                          <span style={{ fontSize: 13, color: sub.status === 'CONCLUIDA' ? '#15803d' : '#0f172a', fontWeight: 800 }}>{sub.status === 'CONCLUIDA' ? '✓ ' : ''}{sub.titulo}</span>
                          <button onClick={() => concluirSubrotina(sub)} style={{ border: 'none', background: sub.status === 'CONCLUIDA' ? '#e2e8f0' : '#dcfce7', color: sub.status === 'CONCLUIDA' ? '#475569' : '#15803d', borderRadius: 8, padding: '6px 9px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
                            {sub.status === 'CONCLUIDA' ? 'Reabrir' : 'Fechar'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 14 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 900, color: '#0f172a' }}>Diário de Bordo</h4>
                    <textarea value={novoDiario} onChange={e => setNovoDiario(e.target.value)} placeholder="Registre contatos, cobrança feita, evidência ou observação..." style={{ ...inputStyle, minHeight: 82, resize: 'vertical' }} />
                    <Botao onClick={adicionarDiario} disabled={salvando || !novoDiario.trim()} style={{ marginTop: 8, width: '100%', background: '#1e3a5f', color: '#fff' }}>Registrar no diário</Botao>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, maxHeight: 240, overflow: 'auto' }}>
                      {diario.length === 0 && <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>Nenhum registro no diário.</p>}
                      {diario.map(log => (
                        <div key={log.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
                          <p style={{ margin: 0, color: '#0f172a', fontSize: 13, lineHeight: 1.45 }}>{log.descricao}</p>
                          <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 11 }}>{log.usuario_registro || 'usuário'} · {new Date(log.created_at).toLocaleString('pt-BR')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </aside>
          </div>
        ) : aba === 'modelos' ? (
          <section style={{ display: 'grid', gridTemplateColumns: podeConfigurar ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr', gap: 16, alignItems: 'start' }}>
            {podeConfigurar && (
              <div style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 14, padding: 16 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 900, color: '#0f172a' }}>Criar modelo de rotina</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Campo label="Título da rotina"><input style={inputStyle} value={modeloForm.titulo} onChange={e => setModeloForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Conferir login da equipe no SIGA" /></Campo>
                  <Campo label="Descrição"><textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={modeloForm.descricao} onChange={e => setModeloForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Detalhe o objetivo e o resultado esperado" /></Campo>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Campo label="Horário"><input type="time" style={inputStyle} value={modeloForm.horario_previsto} onChange={e => setModeloForm(f => ({ ...f, horario_previsto: e.target.value }))} /></Campo>
                    <Campo label="Prioridade"><select style={inputStyle} value={modeloForm.prioridade} onChange={e => setModeloForm(f => ({ ...f, prioridade: e.target.value }))}>{PRIORIDADES.map(p => <option key={p}>{p}</option>)}</select></Campo>
                  </div>
                  <Campo label="Responsável por login"><input style={inputStyle} value={modeloForm.responsavel_login} onChange={e => setModeloForm(f => ({ ...f, responsavel_login: e.target.value }))} placeholder="Opcional: login do usuário" /></Campo>
                  <Campo label="Ou liberar para perfil"><select style={inputStyle} value={modeloForm.perfil_responsavel} onChange={e => setModeloForm(f => ({ ...f, perfil_responsavel: e.target.value }))}>{PERFIS_DESTINO.map(p => <option key={p} value={p}>{p || 'Sem perfil específico'}</option>)}</select></Campo>
                  <Botao onClick={salvarModelo} disabled={salvando} style={{ background: '#2563eb', color: '#fff', width: '100%' }}>Salvar modelo</Botao>
                </div>
              </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: 14, borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>Modelos cadastrados ({modelos.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {modelos.length === 0 && <div style={{ padding: 24, color: '#64748b', fontWeight: 800 }}>Nenhum modelo cadastrado.</div>}
                {modelos.map(m => (
                  <div key={m.id} style={{ padding: 14, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', opacity: m.ativa === false ? 0.55 : 1 }}>
                    <div>
                      <div style={{ fontWeight: 900, color: '#0f172a' }}>{fmtHora(m.horario_previsto)} · {m.titulo}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{m.responsavel_login || m.perfil_responsavel || 'Geral'} · {m.prioridade || 'NORMAL'}</div>
                    </div>
                    {podeConfigurar && <Botao onClick={() => alternarModelo(m)} disabled={salvando}>{m.ativa === false ? 'Reativar' : 'Desativar'}</Botao>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: 14, borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>Acompanhamento por responsável</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left' }}>
                    {['Responsável', 'Total', 'Pendentes', 'Atrasadas', 'Em andamento', 'Concluídas', 'Canceladas'].map(h => <th key={h} style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {acompanhamento.length === 0 && <tr><td colSpan="7" style={{ padding: 24, textAlign: 'center', color: '#64748b', fontWeight: 800 }}>Nenhum dado para a data selecionada.</td></tr>}
                  {acompanhamento.map(l => (
                    <tr key={l.nome}>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>{l.nome}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>{l.total}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', color: '#92400e', fontWeight: 800 }}>{l.pendentes}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', color: '#dc2626', fontWeight: 800 }}>{l.atrasadas}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', color: '#2563eb', fontWeight: 800 }}>{l.andamento}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', color: '#16a34a', fontWeight: 800 }}>{l.concluidas}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 800 }}>{l.canceladas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

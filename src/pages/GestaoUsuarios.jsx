import { useState, useEffect } from 'react'
import {
  listarUsuarios, criarUsuario, atualizarUsuario, deletarUsuario, getVersaoApp,
  listarProcessosUsuario, salvarProcessosUsuario,
  listarRegionaisUsuario, salvarRegionaisUsuario,
} from '../lib/auth.js'
import { supabase } from '../lib/supabase.js'
import { processoToKey, regionalToKey } from '../components/PainelFiltros.jsx'

const PERFIS = ['ADMIN', 'SUPERV. OPERAÇÃO', 'COORD. OPERAÇÃO', 'SUPERV. CAMPO', 'ANALISTA', 'ASSISTENTE']

const PERFIL_CORES = {
  'ADMIN':            { bg: '#fce7f3', color: '#9d174d' },
  'SUPERV. OPERAÇÃO': { bg: '#d1fae5', color: '#065f46' },
  'COORD. OPERAÇÃO':  { bg: '#e0f2fe', color: '#0369a1' },
  'SUPERV. CAMPO':    { bg: '#dbeafe', color: '#1e40af' },
  'ANALISTA':         { bg: '#fef3c7', color: '#92400e' },
  'ASSISTENTE':       { bg: '#f3e8ff', color: '#6b21a8' },
}

const TODAS_PERMISSOES = [
  { id: 'estrutura_online_visualizar', label: 'Estrutura Online - visualizar' },
  { id: 'estrutura_online_editar',     label: 'Estrutura Online - editar abas' },
  { id: 'estrutura_online_importar',   label: 'Estrutura Online - importar total' },
  { id: 'estrutura_online_motivos',    label: 'Estrutura Online - botão Motivos (cadastrar/excluir)' },
  { id: 'iniciar_auditoria', label: '📋 Iniciar Auditoria' },
  { id: 'dashboard',        label: '📊 Dashboard / Ranking'   },
  { id: 'indisponibilidade', label: '🚫 Registrar Indisponibilidade' },
  { id: 'dashboard_indisponibilidade', label: '📈 Dashboard Indisponibilidade' },
  { id: 'rotinas_administrativas', label: '🗓️ Rotinas Administrativas' },
  { id: 'rotinas_configurar',      label: '🛠️ Rotinas — configurar modelos' },
  { id: 'rotinas_dashboard',       label: '📊 Rotinas — acompanhamento geral' },
  { id: 'rotinas_ver_todas',     label: '👥 Rotinas — ver rotinas de todos' },
  { id: 'fiscais_campo',    label: '📍 Fiscais em Campo'       },
  { id: 'metas',            label: '🎯 Metas por Fiscal'       },
  { id: 'feedbacks',        label: '💬 Feedbacks em PDF'       },
  { id: 'relat_equipe',     label: '🚗 Relatório por Equipe'   },
  { id: 'pauta',            label: '📋 Pauta de Fiscalização'  },
  { id: 'pauta_criar',      label: 'Pauta - criar pauta manual' },
  { id: 'pauta_importar_csv', label: 'Pauta - importar CSV/Excel' },
  { id: 'pauta_editar_reprogramar', label: 'Pauta - editar/reprogramar data e dados' },
  { id: 'pauta_cancelar',   label: 'Pauta - cancelar pauta' },
  { id: 'pauta_excluir',    label: 'Pauta - excluir pauta concluida/cancelada' },
  { id: 'gestao_usuarios',  label: '👥 Gestão de Usuários'     },
  { id: 'importar_equipes', label: '📥 Importar Equipes (CSV)' },
  { id: 'historico_ver_todas',     label: '📂 Histórico — ver todas as auditorias' },
  { id: 'historico_reabrir',       label: '🔓 Histórico — reabrir auditorias'      },
  { id: 'acesso_todos_processos',  label: '🌐 Acesso a TODOS os processos (ignora segregação por estrutura)' },
]

const FORM_VAZIO = {
  nome: '', login: '', senha: '', matricula: '',
  perfil: 'SUPERV. CAMPO', base_regiao: 'Todas', status: 'ATIVO',
  tem_meta: false,
}

// Formata data/hora do último login
function formatarUltimoLogin(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1)
  const mesmodia = (a, b) => a.toDateString() === b.toDateString()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (mesmodia(d, hoje))  return `hoje às ${hora}`
  if (mesmodia(d, ontem)) return `ontem às ${hora}`
  return d.toLocaleDateString('pt-BR') + ' ' + hora
}

export default function GestaoUsuarios({ usuarioLogado, onVoltar }) {
  const [usuarios,    setUsuarios]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(false)
  const [editando,    setEditando]    = useState(null)
  const [formData,    setFormData]    = useState(FORM_VAZIO)
  const [salvando,    setSalvando]    = useState(false)
  const [erro,        setErro]        = useState('')
  const [abaAtiva,    setAbaAtiva]    = useState('usuarios')
  const [versaoSistema, setVersaoSistema] = useState('')

  // Permissões
  const [permissoes,       setPermissoes]       = useState({}) // { perfil: [permissao,...] }
  const [loadingPerms,     setLoadingPerms]     = useState(false)
  const [salvandoPerms,    setSalvandoPerms]    = useState(false)
  const [msgPerms,         setMsgPerms]         = useState('')
  const [perfilSelecionado, setPerfilSelecionado] = useState('SUPERV. CAMPO')

  // Processos distintos da estrutura_equipes (pra gerar toggles dinâmicos)
  const [processosDisponiveis, setProcessosDisponiveis] = useState([]) // [{ label, key }]
  const [regionaisDisponiveis, setRegionaisDisponiveis] = useState([]) // [{ label, key }]

  // Processos atribuídos ao usuário atual no modal (granularidade individual)
  const [processosUsuario, setProcessosUsuario] = useState([])
  const [regionaisUsuario, setRegionaisUsuario] = useState([])

  const carregar = async () => {
    setLoading(true)
    try { setUsuarios(await listarUsuarios()) }
    catch (e) { setErro(e.message) }
    finally { setLoading(false) }
  }

  const carregarVersaoSistema = () => {
    // Versão atual vem do build (package.json via Vite), não do banco
    setVersaoSistema(getVersaoApp())
  }

  const carregarPermissoes = async () => {
    setLoadingPerms(true)
    try {
      // ─── Permissões cadastradas por perfil ───
      const { data } = await supabase.from('perfis_permissoes').select('*')
      const mapa = {}
      PERFIS.forEach(p => { mapa[p] = [] })
      ;(data || []).forEach(r => {
        if (!mapa[r.perfil]) mapa[r.perfil] = []
        mapa[r.perfil].push(r.permissao)
      })
      setPermissoes(mapa)
    } finally {
      setLoadingPerms(false)
    }
  }

  // Carrega processos distintos da estrutura_equipes (pra os toggles dinâmicos
  // tanto da aba "Permissões por Perfil" quanto do modal de editar usuário)
  const carregarProcessosDisponiveis = async () => {
    try {
      const { data } = await supabase.from('estrutura_equipes')
        .select('processo_equipe')
      const set = new Set()
      ;(data || []).forEach(r => {
        const p = (r.processo_equipe || '').trim()
        if (p) set.add(p)
      })
      const lista = [...set].sort().map(label => ({
        label, key: processoToKey(label),
      })).filter(p => p.key)
      setProcessosDisponiveis(lista)
    } catch (e) {
      console.warn('Erro carregando processos:', e.message)
    }
  }

  const carregarRegionaisDisponiveis = async () => {
    try {
      const { data } = await supabase.from('estrutura_equipes')
        .select('regional')
      const set = new Set()
      ;(data || []).forEach(r => {
        const p = (r.regional || '').trim()
        if (p) set.add(p)
      })
      const lista = [...set].sort().map(label => ({
        label, key: regionalToKey(label),
      })).filter(p => p.key)
      setRegionaisDisponiveis(lista)
    } catch (e) {
      console.warn('Erro carregando regionais:', e.message)
    }
  }

  useEffect(() => { carregar(); carregarVersaoSistema(); carregarProcessosDisponiveis(); carregarRegionaisDisponiveis() }, [])
  useEffect(() => { if (abaAtiva === 'permissoes') carregarPermissoes() }, [abaAtiva])

  const abrirNovo   = () => {
    setEditando(null); setFormData(FORM_VAZIO); setErro('')
    setProcessosUsuario([])
    setRegionaisUsuario([])
    setModal(true)
  }
  const abrirEditar = async u  => {
    setEditando(u); setFormData({ ...u, senha: '' }); setErro('')
    // Carrega os processos atribuídos a esse usuário
    try {
      const procs = await listarProcessosUsuario(u.id)
      setProcessosUsuario(procs)
    } catch (e) {
      console.warn('Erro carregando processos do usuário:', e.message)
      setProcessosUsuario([])
    }
    try {
      const regs = await listarRegionaisUsuario(u.id)
      setRegionaisUsuario(regs)
    } catch (e) {
      console.warn('Erro carregando regionais do usuário:', e.message)
      setRegionaisUsuario([])
    }
    setModal(true)
  }
  const fechar      = () => { setModal(false); setErro(''); setProcessosUsuario([]); setRegionaisUsuario([]) }
  const upd         = (k, v) => setFormData(f => ({ ...f, [k]: v }))

  const toggleProcessoUsuario = chave => {
    setProcessosUsuario(prev =>
      prev.includes(chave) ? prev.filter(p => p !== chave) : [...prev, chave]
    )
  }

  const toggleRegionalUsuario = chave => {
    setRegionaisUsuario(prev =>
      prev.includes(chave) ? prev.filter(p => p !== chave) : [...prev, chave]
    )
  }

  const salvar = async () => {
    if (!formData.nome || !formData.login) { setErro('Nome e login são obrigatórios.'); return }
    if (!editando && !formData.senha) { setErro('Senha obrigatória para novo usuário.'); return }
    setSalvando(true); setErro('')
    try {
      const payload = { ...formData }
      if (!payload.senha) delete payload.senha
      // Não sobrescreve campos de monitoramento ao editar
      delete payload.versao_app
      delete payload.ultimo_login

      let usuarioSalvo
      if (editando) usuarioSalvo = await atualizarUsuario(editando.id, payload)
      else          usuarioSalvo = await criarUsuario(payload)

      console.log('💾 Usuário salvo:', usuarioSalvo?.id, '— processos/regionais a salvar:', processosUsuario, regionaisUsuario)

      if (usuarioSalvo?.id) {
        await salvarProcessosUsuario(usuarioSalvo.id, processosUsuario)
        await salvarRegionaisUsuario(usuarioSalvo.id, regionaisUsuario)
        console.log('✅ Processos salvos com sucesso pro usuário', usuarioSalvo.id)
      }

      await carregar(); fechar()
    } catch (e) {
      console.error('❌ Erro ao salvar:', e)
      setErro(e.message || String(e))
    }
    finally { setSalvando(false) }
  }

  const alternarStatus = async u => {
    const ciclo = { 'ATIVO': 'RESERVA', 'RESERVA': 'INATIVO', 'INATIVO': 'ATIVO' }
    const novoStatus = ciclo[u.status] || 'ATIVO'
    try { await atualizarUsuario(u.id, { status: novoStatus }); await carregar() }
    catch (e) { alert(e.message) }
  }

  const excluir = async u => {
    if (u.id === usuarioLogado.id) { alert('Você não pode excluir seu próprio usuário.'); return }
    if (!window.confirm(`Excluir ${u.nome}?`)) return
    try { await deletarUsuario(u.id); await carregar() }
    catch (e) { alert(e.message) }
  }

  const togglePermissao = (perfil, permissao) => {
    setPermissoes(prev => {
      const atual = prev[perfil] || []
      const nova  = atual.includes(permissao)
        ? atual.filter(p => p !== permissao)
        : [...atual, permissao]
      return { ...prev, [perfil]: nova }
    })
  }

  const salvarPermissoes = async () => {
    setSalvandoPerms(true)
    setMsgPerms('')
    try {
      // Deleta todas as permissões do perfil selecionado
      await supabase.from('perfis_permissoes').delete().eq('perfil', perfilSelecionado)

      // Reinsere as selecionadas
      const perms = (permissoes[perfilSelecionado] || [])
      if (perms.length > 0) {
        await supabase.from('perfis_permissoes').insert(
          perms.map(p => ({ perfil: perfilSelecionado, permissao: p }))
        )
      }

      setMsgPerms('✅ Permissões salvas!')
      setTimeout(() => setMsgPerms(''), 3000)
    } catch (e) {
      setMsgPerms('❌ Erro: ' + e.message)
    } finally {
      setSalvandoPerms(false)
    }
  }

  const statusCor = s => ({
    'ATIVO':   { bg: '#dcfce7', color: '#15803d', label: '✅ ATIVO'    },
    'RESERVA': { bg: '#fef3c7', color: '#92400e', label: '🟡 RESERVA'  },
    'INATIVO': { bg: '#fee2e2', color: '#dc2626', label: '⭕ INATIVO'  },
  }[s] || { bg: '#f1f5f9', color: '#374151', label: s })

  // Status de versão do usuário comparado com a versão atual do sistema
  const versaoStatus = u => {
    if (!u.versao_app) return { bg: '#f1f5f9', color: '#94a3b8', label: '— nunca logou', atualizado: null }
    if (!versaoSistema) return { bg: '#e0e7ff', color: '#3730a3', label: `v${u.versao_app}`, atualizado: null }
    if (u.versao_app === versaoSistema) return { bg: '#dcfce7', color: '#15803d', label: `✅ v${u.versao_app}`, atualizado: true }
    return { bg: '#fef3c7', color: '#b45309', label: `⚠️ v${u.versao_app}`, atualizado: false }
  }

  const ativos   = usuarios.filter(u => u.status === 'ATIVO').length
  const reservas = usuarios.filter(u => u.status === 'RESERVA').length
  // Quantos ativos estão desatualizados
  const desatualizados = usuarios.filter(u => u.status === 'ATIVO' && u.versao_app && versaoSistema && u.versao_app !== versaoSistema).length

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* Header */}
      <div style={{ background: '#7c3aed', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>👥 Gestão de Usuários</h1>
              <p style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
                Administrador: {usuarioLogado.nome}
                {versaoSistema && <> · Sistema: <strong>v{versaoSistema}</strong></>}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'Total',   val: usuarios.length },
                { label: 'Ativos',  val: ativos          },
                { label: 'Reserva', val: reservas         },
              ].map(t => (
                <div key={t.label} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{t.val}</div>
                  <div style={{ fontSize: 10, opacity: 0.8 }}>{t.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 16px 80px' }}>

        {/* ABAS */}
        <div style={{ display: 'flex', marginBottom: 16, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {[
            { id: 'usuarios',    label: '👥 Usuários'           },
            { id: 'permissoes',  label: '🔐 Permissões por Perfil' },
          ].map(a => (
            <button key={a.id} onClick={() => setAbaAtiva(a.id)} style={{
              flex: 1, padding: '13px', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              background: abaAtiva === a.id ? '#7c3aed' : '#fff',
              color:      abaAtiva === a.id ? '#fff'    : '#64748b',
              transition: 'all 0.2s',
            }}>{a.label}</button>
          ))}
        </div>

        {/* ===== ABA USUÁRIOS ===== */}
        {abaAtiva === 'usuarios' && (
          <>
            {/* Banner de desatualizados */}
            {desatualizados > 0 && (
              <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#b45309', margin: 0 }}>
                  ⚠️ {desatualizados} usuário(s) ativo(s) estão em versão desatualizada
                </p>
                <p style={{ fontSize: 12, color: '#92400e', margin: '4px 0 0' }}>
                  Peça para saírem e logarem novamente para atualizar para a v{versaoSistema}.
                </p>
              </div>
            )}

            <button onClick={abrirNovo} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#7c3aed', color: '#fff', border: 'none',
              padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700,
              cursor: 'pointer', marginBottom: 18,
            }}>+ Novo Usuário</button>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Carregando...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {usuarios.map(u => {
                  const pc = PERFIL_CORES[u.perfil] || { bg: '#f1f5f9', color: '#374151' }
                  const sc = statusCor(u.status)
                  const vs = versaoStatus(u)
                  const ultimoLogin = formatarUltimoLogin(u.ultimo_login)
                  return (
                    <div key={u.id} style={{
                      background: '#fff', borderRadius: 14,
                      border: `1.5px solid ${u.status === 'ATIVO' ? '#e2e8f0' : u.status === 'RESERVA' ? '#fcd34d' : '#fecaca'}`,
                      padding: '14px 16px',
                      opacity: u.status === 'INATIVO' ? 0.6 : 1,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{u.nome}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: pc.bg, color: pc.color }}>
                              {u.perfil}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                              {sc.label}
                            </span>
                            {/* Badge de versão */}
                            {u.perfil !== 'ADMIN' && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: vs.bg, color: vs.color }}>
                                {vs.label}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            Login: <strong>{u.login}</strong>
                            {u.matricula && <> · Matrícula: <strong>{u.matricula}</strong></>}
                            {' '}· Base: {u.base_regiao}
                          </div>
                          {ultimoLogin && (
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                              🕐 Último acesso: {ultimoLogin}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginLeft: 10 }}>
                          <button onClick={() => abrirEditar(u)} style={{
                            width: 34, height: 34, borderRadius: 8, border: 'none',
                            background: '#fef3c7', color: '#92400e', cursor: 'pointer', fontSize: 15,
                          }}>✏️</button>
                          <button onClick={() => alternarStatus(u)} style={{
                            width: 34, height: 34, borderRadius: 8, border: 'none',
                            background: u.status === 'ATIVO' ? '#fef3c7' : u.status === 'RESERVA' ? '#fee2e2' : '#dcfce7',
                            cursor: 'pointer', fontSize: 15,
                          }}>
                            {u.status === 'ATIVO' ? '🟡' : u.status === 'RESERVA' ? '🔴' : '🟢'}
                          </button>
                          {u.id !== usuarioLogado.id && (
                            <button onClick={() => excluir(u)} style={{
                              width: 34, height: 34, borderRadius: 8, border: 'none',
                              background: '#f1f5f9', color: '#7c3aed', cursor: 'pointer', fontSize: 15,
                            }}>🗑️</button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ===== ABA PERMISSÕES ===== */}
        {abaAtiva === 'permissoes' && (
          <>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Selecione o perfil para editar
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PERFIS.filter(p => p !== 'ADMIN').map(p => {
                  const cor = PERFIL_CORES[p] || { bg: '#f1f5f9', color: '#374151' }
                  return (
                    <button key={p} onClick={() => setPerfilSelecionado(p)} style={{
                      padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700,
                      background: perfilSelecionado === p ? cor.color : cor.bg,
                      color:      perfilSelecionado === p ? '#fff'     : cor.color,
                      transition: 'all 0.2s',
                    }}>{p}</button>
                  )
                })}
              </div>
            </div>

            {loadingPerms ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Carregando...</div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #7c3aed', padding: '16px', marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#4c1d95', marginBottom: 16 }}>
                  🔐 Permissões — <span style={{ color: '#7c3aed' }}>{perfilSelecionado}</span>
                </p>
                <p style={{ fontSize: 11, color: '#64748b', marginBottom: 14 }}>
                  ⚠️ ADMIN sempre tem acesso total e não aparece aqui.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {TODAS_PERMISSOES.map(p => {
                    const ativo = (permissoes[perfilSelecionado] || []).includes(p.id)
                    return (
                      <div key={p.id} onClick={() => togglePermissao(perfilSelecionado, p.id)} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                        background: ativo ? '#f5f3ff' : '#f8fafc',
                        border: `1.5px solid ${ativo ? '#7c3aed' : '#e2e8f0'}`,
                        transition: 'all 0.2s',
                      }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: ativo ? '#4c1d95' : '#64748b' }}>
                          {p.label}
                        </span>
                        <div style={{
                          width: 44, height: 24, borderRadius: 12,
                          background: ativo ? '#7c3aed' : '#cbd5e1',
                          position: 'relative', transition: 'background 0.2s',
                        }}>
                          <div style={{
                            position: 'absolute', top: 3,
                            left: ativo ? 23 : 3,
                            width: 18, height: 18, borderRadius: '50%',
                            background: '#fff', transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* ─── Aviso sobre processos agora serem por USUÁRIO ─── */}
                <div style={{
                  marginTop: 22, padding: '14px', borderRadius: 10,
                  background: '#fef3c7', border: '1px solid #fcd34d',
                }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                    💡 Acesso a processos é configurado POR USUÁRIO
                  </p>
                  <p style={{ fontSize: 11, color: '#78350f', lineHeight: 1.5 }}>
                    Os processos da estrutura (CORTE, LIGAÇÃO NOVA, EMERGENCIAL...) são liberados
                    individualmente no <strong>cadastro de cada usuário</strong> — assim Joselito
                    (Comercial) e Fulano (Emergencial) podem ter o mesmo perfil sem se misturar.
                    <br /><br />
                    Use o botão <strong>✏️ Editar</strong> em cada usuário pra configurar.
                  </p>
                </div>

                {msgPerms && (
                  <p style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: msgPerms.startsWith('✅') ? '#15803d' : '#dc2626' }}>
                    {msgPerms}
                  </p>
                )}

                <button onClick={salvarPermissoes} disabled={salvandoPerms} style={{
                  marginTop: 16, width: '100%', padding: '13px', borderRadius: 10, border: 'none',
                  background: salvandoPerms ? '#64748b' : '#7c3aed',
                  color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>
                  {salvandoPerms ? '⏳ Salvando...' : '💾 Salvar Permissões'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal usuário */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>{editando ? '✏️ Editar Usuário' : '+ Novo Usuário'}</h3>
              <button onClick={fechar} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            <div className="form-group">
              <label className="form-label">Nome completo *</label>
              <input className="form-input" value={formData.nome} onChange={e => upd('nome', e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="form-group">
              <label className="form-label">Login *</label>
              <input className="form-input" value={formData.login} onChange={e => upd('login', e.target.value.toLowerCase())} placeholder="nome.sobrenome" />
            </div>
            <div className="form-group">
              <label className="form-label">Matrícula</label>
              <input className="form-input" value={formData.matricula || ''} onChange={e => upd('matricula', e.target.value)} placeholder="Ex: 12345" />
            </div>
            <div className="form-group">
              <label className="form-label">Senha {editando ? '(deixe vazio para manter)' : '*'}</label>
              <input className="form-input" type="password" value={formData.senha} onChange={e => upd('senha', e.target.value)} placeholder="••••••••" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Perfil</label>
                <select className="form-input" value={formData.perfil} onChange={e => upd('perfil', e.target.value)}>
                  {PERFIS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input" value={formData.status} onChange={e => upd('status', e.target.value)}>
                  <option value="ATIVO">ATIVO</option>
                  <option value="RESERVA">RESERVA</option>
                  <option value="INATIVO">INATIVO</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Base / Região</label>
              <input className="form-input" value={formData.base_regiao} onChange={e => upd('base_regiao', e.target.value)} placeholder="Ex: Teresina, Todas..." />
            </div>

            {/* ─── Toggle: tem meta ─── */}
            <div
              onClick={() => upd('tem_meta', !formData.tem_meta)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px', borderRadius: 10, cursor: 'pointer', marginBottom: 16,
                background: formData.tem_meta ? '#f0fdf4' : '#f8fafc',
                border: `1.5px solid ${formData.tem_meta ? '#86efac' : '#e2e8f0'}`,
                transition: 'all 0.2s',
              }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: formData.tem_meta ? '#15803d' : '#64748b', margin: 0 }}>
                  🎯 Aparece em Metas por Fiscal
                </p>
                <p style={{ fontSize: 11, color: formData.tem_meta ? '#15803d' : '#94a3b8', margin: '2px 0 0', opacity: 0.8 }}>
                  {formData.tem_meta ? 'Este usuário recebe meta mensal' : 'Este usuário não recebe meta'}
                </p>
              </div>
              <div style={{
                width: 44, height: 24, borderRadius: 12,
                background: formData.tem_meta ? '#10b981' : '#cbd5e1',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}>
                <div style={{
                  position: 'absolute', top: 3,
                  left: formData.tem_meta ? 23 : 3,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
            </div>

            {/* ─── Processos da Estrutura que o usuário pode ver ─── */}
            {processosDisponiveis.length > 0 && (
              <div style={{
                background: '#f5f3ff', border: '1.5px solid #c4b5fd',
                borderRadius: 12, padding: '14px', marginBottom: 16,
              }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#4c1d95', marginBottom: 4 }}>
                  🌐 Processos que este usuário pode ver
                </p>
                <p style={{ fontSize: 11, color: '#6b21a8', marginBottom: 12, lineHeight: 1.5 }}>
                  Marque os processos da estrutura que este usuário específico pode acessar.
                  Os processos marcados somam aos prefixos da hierarquia natural do usuário.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {processosDisponiveis.map(proc => {
                    const ativo = processosUsuario.includes(proc.key)
                    return (
                      <div key={proc.key} onClick={() => toggleProcessoUsuario(proc.key)} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        background: ativo ? '#ecfdf5' : '#fff',
                        border: `1.5px solid ${ativo ? '#10b981' : '#e2e8f0'}`,
                        transition: 'all 0.2s',
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: ativo ? '#065f46' : '#64748b' }}>
                          ⚙️ {proc.label}
                        </span>
                        <div style={{
                          width: 40, height: 22, borderRadius: 11,
                          background: ativo ? '#10b981' : '#cbd5e1',
                          position: 'relative', transition: 'background 0.2s',
                        }}>
                          <div style={{
                            position: 'absolute', top: 3,
                            left: ativo ? 21 : 3,
                            width: 16, height: 16, borderRadius: '50%',
                            background: '#fff', transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ─── Regionais da Estrutura que o usuário pode ver ─── */}
            {regionaisDisponiveis.length > 0 && (
              <div style={{
                background: '#eff6ff', border: '1.5px solid #93c5fd',
                borderRadius: 12, padding: '14px', marginBottom: 16,
              }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#1e3a8a', marginBottom: 4 }}>
                  🌎 Regionais que este usuário pode ver
                </p>
                <p style={{ fontSize: 11, color: '#1d4ed8', marginBottom: 12, lineHeight: 1.5 }}>
                  Marque as regionais da estrutura que este usuário pode acessar.
                  Quando houver regional marcada, ela limita a hierarquia natural e os processos liberados.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {regionaisDisponiveis.map(reg => {
                    const ativo = regionaisUsuario.includes(reg.key)
                    return (
                      <div key={reg.key} onClick={() => toggleRegionalUsuario(reg.key)} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        background: ativo ? '#ecfeff' : '#fff',
                        border: `1.5px solid ${ativo ? '#0891b2' : '#e2e8f0'}`,
                        transition: 'all 0.2s',
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: ativo ? '#155e75' : '#64748b' }}>
                          📍 {reg.label}
                        </span>
                        <div style={{
                          width: 40, height: 22, borderRadius: 11,
                          background: ativo ? '#0891b2' : '#cbd5e1',
                          position: 'relative', transition: 'background 0.2s',
                        }}>
                          <div style={{
                            position: 'absolute', top: 3,
                            left: ativo ? 21 : 3,
                            width: 16, height: 16, borderRadius: '50%',
                            background: '#fff', transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {erro && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 14 }}>
                ❌ {erro}
              </div>
            )}
            <button className="btn-primary" onClick={salvar} disabled={salvando} style={{ background: salvando ? '#64748b' : '#7c3aed' }}>
              {salvando ? '⏳ Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { TIPOS_ACAO_SESMT, REGIONAIS_SESMT } from '../../data/sesmt_config.js'
import { buscarPessoasSesmtPorNome, buscarPessoasSesmtPorChapa, listarPessoasSesmtPorRegional, prepararPayloadSesmt, criarAcaoRascunhoSesmt } from '../../lib/sesmt.js'
import ModalLinkAssinaturaSesmt from '../../components/ModalLinkAssinaturaSesmt.jsx'

// ── Canvas de assinatura (mesmo padrão de R3Participantes.jsx) ────────────────
function AssinaturaPad({ nomeParticipante, onConfirmar, onCancelar }) {
  const canvasRef = useRef(null)
  const [desenhando, setDesenhando] = useState(false)
  const [temTraco,   setTemTraco]   = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  }, [])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src  = e.touches ? e.touches[0] : e
    return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) }
  }
  const iniciar  = e => { e.preventDefault(); const pos = getPos(e, canvasRef.current); setDesenhando(true); setTemTraco(true); const ctx = canvasRef.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(pos.x, pos.y) }
  const desenhar = e => { e.preventDefault(); if (!desenhando) return; const pos = getPos(e, canvasRef.current); const ctx = canvasRef.current.getContext('2d'); ctx.lineTo(pos.x, pos.y); ctx.stroke() }
  const parar    = e => { e.preventDefault(); setDesenhando(false) }
  const limpar   = () => { const ctx = canvasRef.current.getContext('2d'); ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height); setTemTraco(false) }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 20, width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: '#64748b' }}>Assinatura de</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{nomeParticipante}</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Assine abaixo para confirmar participação</p>
        </div>
        <canvas ref={canvasRef} width={380} height={180}
          onMouseDown={iniciar} onMouseMove={desenhar} onMouseUp={parar} onMouseLeave={parar}
          onTouchStart={iniciar} onTouchMove={desenhar} onTouchEnd={parar}
          style={{ width: '100%', height: 180, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fafafa', cursor: 'crosshair', display: 'block', touchAction: 'none' }} />
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={limpar} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>🔄 Limpar</button>
          <button onClick={onCancelar} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>✕ Cancelar</button>
          <button onClick={() => temTraco && onConfirmar(canvasRef.current.toDataURL('image/png'))} disabled={!temTraco}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: temTraco ? '#16a34a' : '#e2e8f0', color: temTraco ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700, cursor: temTraco ? 'pointer' : 'not-allowed' }}>
            ✅ Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Um campo buscável (usado tanto pra Matrícula quanto pra Nome) — busca em
// sesmt_pessoas pela função informada e mostra sugestões com os dois dados.
function CampoBusca({ label, placeholder, value, onChangeTexto, onSelecionar, buscarFn, exibirPrincipal, exibirBadge, autoFocus }) {
  const [sugestoes, setSugestoes] = useState([])
  const [aberto,    setAberto]    = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const buscar = async (v) => {
    onChangeTexto(v)
    if (v.length < 2) { setSugestoes([]); setAberto(false); return }
    try {
      const pessoas = await buscarFn(v)
      if (pessoas.length > 0) { setSugestoes(pessoas); setAberto(true) }
      else { setSugestoes([]); setAberto(false) }
    } catch { setSugestoes([]); setAberto(false) }
  }

  const selecionar = (p) => {
    setSugestoes([]); setAberto(false)
    onSelecionar(p)
  }

  return (
    <div ref={ref} className="form-group" style={{ position: 'relative' }}>
      <label className="form-label">{label}</label>
      <input className="form-input" value={value} onChange={e => buscar(e.target.value)}
        onFocus={() => sugestoes.length > 0 && setAberto(true)}
        placeholder={placeholder} autoComplete="off" autoFocus={autoFocus} />
      {aberto && sugestoes.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 500, background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 240, overflowY: 'auto' }}>
          {sugestoes.map((p, i) => (
            <button key={i} onMouseDown={() => selecionar(p)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '11px 14px', textAlign: 'left', background: 'none', border: 'none', borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{exibirPrincipal(p)}</span>
              {exibirBadge(p) && <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 700, background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>{exibirBadge(p)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const LIMITE_PREVIEW_IMPORT = 40

// Quantos participantes renderizar de cara na tela do wizard — a lista pode
// crescer bastante com a importação em lote, e um card por pessoa fica
// pesado na casa das centenas.
const LIMITE_LISTA_VISIVEL = 12

// ── Modal: escolhe Lista Total ou uma/mais regionais e importa de uma vez
// todo mundo ativo daquele escopo como participante online (sem assinatura
// ainda) — evita adicionar nome por nome. A prévia mostra só os primeiros
// (a lista pode ter centenas de pessoas); quem entra de fato é o total.
function ModalImportarRegional({ participantesJaAdicionados, onImportar, onFechar }) {
  const [sel,        setSel]        = useState([]) // [] = Lista Total
  const [pessoas,    setPessoas]    = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro,       setErro]       = useState('')

  const jaAdicionados = new Set((participantesJaAdicionados || []).filter(p => p.pessoa_id).map(p => p.pessoa_id))

  useEffect(() => {
    setCarregando(true)
    setErro('')
    listarPessoasSesmtPorRegional(sel)
      .then(data => setPessoas(data.filter(p => !jaAdicionados.has(p.id))))
      .catch(e => setErro(e.message || 'Erro ao carregar a lista.'))
      .finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.join(',')])

  const listaTotal = sel.length === 0
  const toggleRegional = (key) => setSel(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const optStyle = (marcado) => ({
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '11px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
    border: `1.5px solid ${marcado ? '#7c3aed' : '#e2e8f0'}`,
    background: marcado ? '#faf5ff' : '#fff',
  })
  const boxStyle = (marcado) => ({
    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
    border: `1.6px solid ${marcado ? '#7c3aed' : '#cbd5e1'}`,
    background: marcado ? '#7c3aed' : '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 12, fontWeight: 800,
  })

  const preview = pessoas.slice(0, LIMITE_PREVIEW_IMPORT)
  const resto = pessoas.length - preview.length

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2500 }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto', padding: '20px 18px 30px' }}>
        <div style={{ width: 36, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 16px' }} />
        <p style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: '0 0 4px' }}>👥 Importar Lista de Participantes</p>
        <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, margin: '0 0 16px' }}>
          Escolha a Lista Total ou uma/mais regionais — todo mundo ativo dela entra direto como participante online, sem assinatura ainda.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setSel([])} style={optStyle(listaTotal)}>
            <span style={boxStyle(listaTotal)}>{listaTotal && '✓'}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: listaTotal ? '#6d28d9' : '#374151' }}>Lista Total</span>
          </button>
          {REGIONAIS_SESMT.map(r => {
            const marcado = sel.includes(r.key)
            return (
              <button key={r.key} onClick={() => toggleRegional(r.key)} style={optStyle(marcado)}>
                <span style={boxStyle(marcado)}>{marcado && '✓'}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: marcado ? '#6d28d9' : '#374151', flex: 1 }}>{r.label}</span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: "'Courier New', monospace" }}>{r.codigo}</span>
              </button>
            )
          })}
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 14, marginBottom: 16 }}>
          {carregando ? (
            <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', padding: '8px 0' }}>Carregando...</p>
          ) : erro ? (
            <p style={{ fontSize: 13, color: '#dc2626', textAlign: 'center', padding: '8px 0' }}>{erro}</p>
          ) : pessoas.length === 0 ? (
            <p style={{ fontSize: 13, color: '#92400e', textAlign: 'center', padding: '8px 0' }}>Ninguém novo pra importar nesse escopo (já estão todos na lista, ou não há pessoas ativas cadastradas).</p>
          ) : (
            <>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#15803d', marginBottom: 8 }}>✅ {pessoas.length} pessoa(s) serão adicionadas:</p>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {preview.map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < preview.length - 1 ? '1px solid #bbf7d0' : 'none', fontSize: 13, gap: 8 }}>
                    <span style={{ color: '#15803d', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {p.nome}</span>
                    {p.chapa && <span style={{ color: '#94a3b8', fontSize: 11, flexShrink: 0 }}>{p.chapa}</span>}
                  </div>
                ))}
              </div>
              {resto > 0 && <p style={{ fontSize: 12, color: '#64748b', marginTop: 8, textAlign: 'center' }}>+ {resto} outra(s) — todas entram, só a prévia é limitada</p>}
            </>
          )}
        </div>

        <button onClick={() => pessoas.length > 0 && onImportar(pessoas)} disabled={carregando || pessoas.length === 0} style={{
          width: '100%', padding: 13, borderRadius: 10, border: 'none',
          background: (carregando || pessoas.length === 0) ? '#e2e8f0' : '#1e3a5f',
          color: (carregando || pessoas.length === 0) ? '#94a3b8' : '#fff',
          fontSize: 14, fontWeight: 700, cursor: (carregando || pessoas.length === 0) ? 'not-allowed' : 'pointer', marginBottom: 10,
        }}>
          {pessoas.length > 0 ? `Importar ${pessoas.length} participante(s)` : 'Nada pra importar'}
        </button>
        <button onClick={onFechar} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Escopo regional da busca (só Presencial) — o fiscal escolhe Lista Total
// ou uma/mais regionais ANTES de buscar; ninguém é carregado automaticamente,
// só a busca por nome/matrícula fica restrita àquele escopo. Diferente da
// importação em lote do Online (que adiciona todo mundo de uma vez).
function labelBuscarEmRegional(regionais) {
  if (!regionais || regionais.length === 0) return 'Buscar em... (todas)'
  if (regionais.length === 1) {
    const r = REGIONAIS_SESMT.find(x => x.key === regionais[0])
    return `Buscar em: ${r ? r.label.replace('Regional ', '') : regionais[0]}`
  }
  return `Buscar em: ${regionais.length} regionais`
}

function ModalBuscarEmRegional({ selecionadas, onAplicar, onFechar }) {
  const [sel, setSel] = useState(selecionadas)
  const listaTotal = sel.length === 0
  const toggleRegional = (key) => setSel(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const optStyle = (marcado) => ({
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '11px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
    border: `1.5px solid ${marcado ? '#7c3aed' : '#e2e8f0'}`,
    background: marcado ? '#faf5ff' : '#fff',
  })
  const boxStyle = (marcado) => ({
    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
    border: `1.6px solid ${marcado ? '#7c3aed' : '#cbd5e1'}`,
    background: marcado ? '#7c3aed' : '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 12, fontWeight: 800,
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2500 }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '20px 18px 30px' }}>
        <div style={{ width: 36, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 16px' }} />
        <p style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: '0 0 4px' }}>🌎 Buscar Participantes em...</p>
        <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, margin: '0 0 16px' }}>
          Escolha a Lista Total ou uma/mais regionais — a busca por nome/matrícula abaixo só vai trazer gente desse escopo. Não adiciona ninguém sozinho.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          <button onClick={() => setSel([])} style={optStyle(listaTotal)}>
            <span style={boxStyle(listaTotal)}>{listaTotal && '✓'}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: listaTotal ? '#6d28d9' : '#374151' }}>Lista Total</span>
          </button>
          {REGIONAIS_SESMT.map(r => {
            const marcado = sel.includes(r.key)
            return (
              <button key={r.key} onClick={() => toggleRegional(r.key)} style={optStyle(marcado)}>
                <span style={boxStyle(marcado)}>{marcado && '✓'}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: marcado ? '#6d28d9' : '#374151', flex: 1 }}>{r.label}</span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: "'Courier New', monospace" }}>{r.codigo}</span>
              </button>
            )
          })}
        </div>
        <button onClick={() => onAplicar(sel)} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#1e3a5f', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
          Aplicar
        </button>
        <button onClick={onFechar} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Autocomplete: busca em sesmt_pessoas (carregada na Fase 1), pela
// matrícula OU pelo nome — os dois campos preenchem um ao outro ao escolher
// uma sugestão em qualquer um deles.
// onSelect(nome, chapa, pessoaId) — pessoaId só vem quando o fiscal
// realmente escolhe uma sugestão da lista carregada (não ao digitar texto
// livre); grava em participantes[].pessoa_id, quando disponível, pro
// vínculo com sesmt_pessoas ficar completo também nesse canal.
// regionaisFiltro é opcional — só o Presencial passa (ver FormParticipante).
function AutocompleteSesmt({ onSelect, regionaisFiltro }) {
  const [chapa, setChapa] = useState('')
  const [nome,  setNome]  = useState('')

  const selecionarPorChapa = (p) => {
    setChapa(p.chapa || ''); setNome(p.nome)
    onSelect(p.nome, p.chapa || '', p.id)
  }
  const selecionarPorNome = (p) => {
    setNome(p.nome); setChapa(p.chapa || '')
    onSelect(p.nome, p.chapa || '', p.id)
  }

  return (
    <div>
      <CampoBusca
        label="Matrícula *" placeholder="Digite a matrícula..." autoFocus
        value={chapa}
        onChangeTexto={v => { setChapa(v); onSelect(nome, v, null) }}
        onSelecionar={selecionarPorChapa}
        buscarFn={v => buscarPessoasSesmtPorChapa(v, regionaisFiltro)}
        exibirPrincipal={p => p.chapa}
        exibirBadge={p => p.nome}
      />
      <CampoBusca
        label="Nome *" placeholder="Digite para buscar..."
        value={nome}
        onChangeTexto={v => { setNome(v); onSelect(v, chapa, null) }}
        onSelecionar={selecionarPorNome}
        buscarFn={v => buscarPessoasSesmtPorNome(v, regionaisFiltro)}
        exibirPrincipal={p => p.nome}
        exibirBadge={p => p.chapa ? `Matrícula: ${p.chapa}` : ''}
      />
    </div>
  )
}

function FormParticipante({ onSolicitar, onCancelar, regionaisFiltro, onAbrirScopePicker }) {
  const [nome, setNome] = useState('')
  const [chapa, setChapa] = useState('')
  const [pessoaId, setPessoaId] = useState(null)
  return (
    <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Novo participante presencial</p>

      <button type="button" onClick={onAbrirScopePicker} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
        padding: '9px 12px', borderRadius: 9, border: '1.5px solid #c4b5fd', background: '#faf5ff',
        color: '#6d28d9', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
      }}>
        🌎 {labelBuscarEmRegional(regionaisFiltro)}
      </button>

      <AutocompleteSesmt onSelect={(n, c, id) => { setNome(n); setChapa(c); setPessoaId(id || null) }} regionaisFiltro={regionaisFiltro} />
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        {onCancelar && <button onClick={onCancelar} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>}
        <button onClick={() => onSolicitar(nome.trim(), chapa.trim(), pessoaId)} disabled={!nome.trim()}
          style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: nome.trim() ? '#1e3a5f' : '#e2e8f0', color: nome.trim() ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 700, cursor: nome.trim() ? 'pointer' : 'not-allowed' }}>
          ✍️ Solicitar Assinatura
        </button>
      </div>
    </div>
  )
}

function FormParticipanteOnline({ onAdicionar, onCancelar, participantesAtuais, onImportarLote }) {
  const [nome, setNome] = useState('')
  const [chapa, setChapa] = useState('')
  const [pessoaId, setPessoaId] = useState(null)
  const [importAberto, setImportAberto] = useState(false)
  return (
    <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>Participante online</p>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Irá assinar via link/QR Code — sem assinatura agora</p>

      <button type="button" onClick={() => setImportAberto(true)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
        padding: '10px 12px', borderRadius: 9, border: '1.5px solid #7c3aed', background: '#faf5ff',
        color: '#6d28d9', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 14,
      }}>
        👥 Importar Lista de Participantes
      </button>

      <AutocompleteSesmt onSelect={(n, c, id) => { setNome(n); setChapa(c); setPessoaId(id || null) }} />
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        {onCancelar && <button onClick={onCancelar} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>}
        <button onClick={() => onAdicionar(nome.trim(), chapa.trim(), pessoaId)} disabled={!nome.trim()}
          style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: nome.trim() ? '#2563eb' : '#e2e8f0', color: nome.trim() ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 700, cursor: nome.trim() ? 'pointer' : 'not-allowed' }}>
          + Adicionar à lista
        </button>
      </div>

      {importAberto && (
        <ModalImportarRegional
          participantesJaAdicionados={participantesAtuais}
          onImportar={pessoas => { onImportarLote(pessoas); setImportAberto(false) }}
          onFechar={() => setImportAberto(false)}
        />
      )}
    </div>
  )
}

async function capturarLocalizacao() {
  let lat = null, lng = null, endereco_assinatura = null
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000, enableHighAccuracy: true })
        : rej()
    )
    lat = pos.coords.latitude; lng = pos.coords.longitude
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`,
        { headers: { 'User-Agent': 'DPL-Auditoria-Campo/1.0' } }
      )
      const d = await r.json()
      if (d?.address) {
        const a = d.address
        endereco_assinatura = [a.road || a.pedestrian, a.suburb || a.neighbourhood, a.city || a.town || a.village, a.state].filter(Boolean).join(', ')
      }
    } catch { /* silencioso */ }
  } catch { /* GPS negado */ }
  return { lat, lng, endereco_assinatura }
}

// ── Componente principal ──────────────────────────────────────────────────────
// Só entram na lista final quem realmente assinou (presencial na hora) ou vai
// assinar (online, via link gerado na tela de Resultado) — nunca uma lista de
// convidados sem confirmação.
export default function SS3Participantes({ form, upd, next, prev }) {
  const tipoConfig = TIPOS_ACAO_SESMT[form.tipo]
  const [assinandoPart, setAssinandoPart] = useState(null)
  const [adicionando,   setAdicionando]   = useState(false)
  const [modoAdd,       setModoAdd]       = useState(null)
  const [confirmarPend, setConfirmarPend] = useState(false)
  const [qrAberto,      setQrAberto]      = useState(false)
  const [preparandoQr,  setPreparandoQr]  = useState(false)
  const [erroQr,        setErroQr]        = useState('')
  // Lista de participantes pode crescer bastante com a importação em lote —
  // não renderiza tudo de uma vez, só os primeiros + botão "ver mais".
  const [verTodosParticipantes, setVerTodosParticipantes] = useState(false)
  // Escopo regional da busca — só Presencial (ver ModalBuscarEmRegional acima).
  const [regionaisBuscaPresencial, setRegionaisBuscaPresencial] = useState([])
  const [scopePickerPresencialAberto, setScopePickerPresencialAberto] = useState(false)

  // Com QR de autoatendimento gerado, a ação já está salva no banco — não
  // precisa esperar nenhuma assinatura chegar pra poder continuar/finalizar
  // o wizard (elas vão sendo sincronizadas sozinhas depois).
  const podeProsseguir = form.participantes.length > 0 || Boolean(form.tokenAutoatendimento)
  const presenciaisPendentes = form.participantes.filter(p => p.modo === 'presencial' && !p.assinatura && !p.assinatura_url).length

  // A forma de assinar (presencial/online) só é perguntada no primeiro
  // participante — os demais seguem automaticamente a mesma escolha.
  const modoTravado = form.participantes.length > 0 ? form.participantes[0].modo : null
  const presencialAtivo = modoTravado === 'presencial' || modoAdd === 'presencial'

  useEffect(() => {
    if (form.participantes.length === 0 && !adicionando) setAdicionando(true)
  }, [])

  const iniciarAdicao = () => {
    setAdicionando(true)
    setModoAdd(modoTravado)
  }

  // Gera (na 1ª vez) a ação como rascunho no banco — precisa de um acao_id
  // real pra apontar o token do QR — e abre o modal do QR de autoatendimento.
  const abrirQrAutoatendimento = async () => {
    setErroQr('')
    if (form.acaoRascunhoId) { setQrAberto(true); return }
    setPreparandoQr(true)
    try {
      const payload = await prepararPayloadSesmt(form)
      const rascunho = await criarAcaoRascunhoSesmt(payload)
      upd('acaoRascunhoId', rascunho.id)
      setQrAberto(true)
    } catch (e) {
      setErroQr('Erro ao preparar o QR: ' + e.message)
    } finally {
      setPreparandoQr(false)
    }
  }

  const onSolicitarAssinatura = (nome, chapa, pessoaId) => {
    if (!nome) return
    setAdicionando(false); setModoAdd(null)
    setAssinandoPart({ nome, chapa, pessoaId })
  }

  const assinarExistente = (idx) => {
    const p = form.participantes[idx]
    setAssinandoPart({ nome: p.nome, idx })
  }

  const onConfirmarAssinatura = async (png) => {
    const { lat, lng, endereco_assinatura } = await capturarLocalizacao()

    if (assinandoPart.idx !== undefined && assinandoPart.idx !== null) {
      const novos = form.participantes.map((p, i) =>
        i === assinandoPart.idx
          ? { ...p, assinatura: png, assinado_em: new Date().toISOString(), modo: 'presencial', lat, lng, endereco_assinatura }
          : p
      )
      upd('participantes', novos)
      setAssinandoPart(null)
      return
    }

    upd('participantes', [...form.participantes, {
      nome: assinandoPart.nome, chapa: assinandoPart.chapa || '', pessoa_id: assinandoPart.pessoaId || null,
      assinatura: png, assinado_em: new Date().toISOString(), modo: 'presencial',
      lat, lng, endereco_assinatura,
    }])
    setAssinandoPart(null)
  }

  const onAdicionarOnline = (nome, chapa, pessoaId) => {
    if (!nome) return
    upd('participantes', [...form.participantes, {
      nome, chapa: chapa || '', pessoa_id: pessoaId || null, assinatura: null, assinado_em: null, modo: 'online',
    }])
    setAdicionando(false); setModoAdd(null)
  }

  // Importação em lote (por regional/lista total) — o modal já filtra quem
  // já está na lista antes de mostrar a prévia, mas confere de novo aqui
  // por segurança (ex.: duas importações seguidas sem fechar o wizard).
  const onImportarParticipantesEmLote = (pessoas) => {
    const jaTem = new Set(form.participantes.filter(p => p.pessoa_id).map(p => p.pessoa_id))
    const novos = pessoas
      .filter(p => !jaTem.has(p.id))
      .map(p => ({ nome: p.nome, chapa: p.chapa || '', pessoa_id: p.id, assinatura: null, assinado_em: null, modo: 'online' }))
    if (novos.length > 0) upd('participantes', [...form.participantes, ...novos])
    setAdicionando(false); setModoAdd(null)
  }

  const remover = (idx) => upd('participantes', form.participantes.filter((_, i) => i !== idx))

  const tentarContinuar = () => {
    if (presenciaisPendentes > 0) setConfirmarPend(true)
    else next()
  }

  return (
    <div style={{ padding: '0 0 80px' }}>
      <div style={{ background: tipoConfig?.bg, border: `1.5px solid ${tipoConfig?.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>{tipoConfig?.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tipoConfig?.color }}>{tipoConfig?.label}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b' }}>Participantes</h2>
        <span style={{ fontSize: 12, color: '#64748b' }}>{form.participantes.length}</span>
      </div>

      {presenciaisPendentes > 0 && (
        <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#92400e', margin: 0 }}>✍️ {presenciaisPendentes} participante(s) presencial(is) ainda não assinaram</p>
          <p style={{ fontSize: 12, color: '#b45309', margin: '4px 0 0' }}>Toque em <strong>✍️ Assinar</strong> ao lado de cada um para coletar a assinatura.</p>
        </div>
      )}

      {(verTodosParticipantes ? form.participantes : form.participantes.slice(0, LIMITE_LISTA_VISIVEL)).map((p, i) => {
        const assinado = Boolean(p.assinatura || p.assinatura_url)
        const pendentePresencial = p.modo === 'presencial' && !assinado
        const nomeColor = p.modo === 'online' ? '#1d4ed8' : pendentePresencial ? '#92400e' : '#15803d'
        return (
          <div key={i} style={{
            background: p.modo === 'online' ? '#eff6ff' : pendentePresencial ? '#fffbeb' : '#f0fdf4',
            border: `1.5px solid ${p.modo === 'online' ? '#bfdbfe' : pendentePresencial ? '#fcd34d' : '#86efac'}`,
            borderRadius: 12, padding: '12px 14px', marginBottom: 10,
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: nomeColor }}>{i + 1}. {p.nome}</p>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: p.modo === 'online' ? '#dbeafe' : '#dcfce7', color: p.modo === 'online' ? '#1d4ed8' : '#15803d' }}>
                  {p.modo === 'online' ? '🔗 Online' : '✍️ Presencial'}
                </span>
              </div>
              {p.chapa && <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px' }}>Matrícula: {p.chapa}</p>}
              {assinado && <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>✅ Assinado{p.assinado_em ? ` · ${new Date(p.assinado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>}
              {!assinado && p.modo === 'online' && <p style={{ fontSize: 11, color: '#2563eb', margin: 0 }}>⏳ Assinará via link</p>}
              {pendentePresencial && <p style={{ fontSize: 11, color: '#d97706', fontWeight: 600, margin: 0 }}>⚠️ Aguardando assinatura</p>}
            </div>

            {assinado && <img src={p.assinatura || p.assinatura_url} alt="assinatura" style={{ width: 80, height: 40, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0', flexShrink: 0 }} />}

            {pendentePresencial && (
              <button onClick={() => assinarExistente(i)} style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>✍️ Assinar</button>
            )}

            <button onClick={() => remover(i)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
          </div>
        )
      })}

      {!verTodosParticipantes && form.participantes.length > LIMITE_LISTA_VISIVEL && (
        <button onClick={() => setVerTodosParticipantes(true)} style={{
          width: '100%', padding: 12, borderRadius: 10, border: '1.5px dashed #cbd5e1', background: '#f8fafc',
          color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
        }}>
          ▾ Ver mais {form.participantes.length - LIMITE_LISTA_VISIVEL} participante(s)
        </button>
      )}

      {adicionando && !modoAdd && (
        <div style={{ background: '#f8fafc', border: '1.5px dashed #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Como este participante irá assinar?</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={() => setModoAdd('presencial')} style={{ padding: '16px 10px', borderRadius: 12, border: '2px solid #16a34a', background: '#f0fdf4', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>✍️</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Presencial</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Assina agora no celular</div>
            </button>
            <button onClick={() => setModoAdd('online')} style={{ padding: '16px 10px', borderRadius: 12, border: '2px solid #2563eb', background: '#eff6ff', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>🔗</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>Online</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Assina via link/QR Code</div>
            </button>
          </div>
          {form.participantes.length > 0 && (
            <button onClick={() => { setAdicionando(false); setModoAdd(null) }} style={{ width: '100%', marginTop: 10, padding: 10, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          )}
        </div>
      )}

      {adicionando && modoAdd === 'presencial' && (
        <FormParticipante onSolicitar={onSolicitarAssinatura} onCancelar={() => { setAdicionando(false); setModoAdd(null) }}
          regionaisFiltro={regionaisBuscaPresencial} onAbrirScopePicker={() => setScopePickerPresencialAberto(true)} />
      )}
      {adicionando && modoAdd === 'online' && (
        <FormParticipanteOnline onAdicionar={onAdicionarOnline} onCancelar={() => { setAdicionando(false); setModoAdd(null) }}
          participantesAtuais={form.participantes} onImportarLote={onImportarParticipantesEmLote} />
      )}

      {!adicionando && (
        <button onClick={iniciarAdicao} style={{ width: '100%', padding: 13, borderRadius: 12, border: '2px dashed #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
          + Adicionar participante
        </button>
      )}

      {presencialAtivo && (
        <div style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4', borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0f766e', marginBottom: 4 }}>🖨️ Prefere autoatendimento?</p>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>
            Gere um QR Code pra imprimir e fixar no local — qualquer pessoa da lista pode escanear, digitar o nome ou a matrícula e assinar sozinha, sem passar o celular.
            {form.tokenAutoatendimento && ' A ação já está salva no sistema — as assinaturas são sincronizadas automaticamente até o QR expirar.'}
          </p>
          <button onClick={abrirQrAutoatendimento} disabled={preparandoQr} style={{
            width: '100%', padding: 12, borderRadius: 10, border: '1.5px solid #0f766e',
            background: '#fff', color: '#0f766e', fontSize: 13, fontWeight: 700,
            cursor: preparandoQr ? 'not-allowed' : 'pointer',
          }}>
            {preparandoQr ? '⏳ Preparando...' : form.tokenAutoatendimento ? '🖨️ Ver QR de Autoatendimento' : '🖨️ Gerar QR para Autoatendimento'}
          </button>
          {erroQr && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{erroQr}</p>}
        </div>
      )}

      {form.participantes.length === 0 && !adicionando && !form.tokenAutoatendimento && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px', marginBottom: 12, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#92400e' }}>Adicione pelo menos 1 participante para continuar.</p>
        </div>
      )}

      <button onClick={tentarContinuar} disabled={!podeProsseguir} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: podeProsseguir ? '#1e3a5f' : '#e2e8f0', color: podeProsseguir ? '#fff' : '#94a3b8', fontSize: 15, fontWeight: 700, cursor: podeProsseguir ? 'pointer' : 'not-allowed', marginBottom: 10 }}>
        Continuar →
      </button>
      <button onClick={prev} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Voltar</button>

      {assinandoPart && (
        <AssinaturaPad nomeParticipante={assinandoPart.nome} onConfirmar={onConfirmarAssinatura} onCancelar={() => setAssinandoPart(null)} />
      )}

      {qrAberto && form.acaoRascunhoId && (
        <ModalLinkAssinaturaSesmt
          acaoId={form.acaoRascunhoId}
          tipoLabel={tipoConfig?.label}
          modo="AUTOATENDIMENTO"
          tokenInicial={form.tokenAutoatendimento}
          onTokenAtualizado={t => upd('tokenAutoatendimento', t)}
          participantesAtuais={form.participantes}
          onParticipantesSincronizados={novos => upd('participantes', novos)}
          onFechar={() => setQrAberto(false)}
        />
      )}

      {scopePickerPresencialAberto && (
        <ModalBuscarEmRegional
          selecionadas={regionaisBuscaPresencial}
          onAplicar={novo => { setRegionaisBuscaPresencial(novo); setScopePickerPresencialAberto(false) }}
          onFechar={() => setScopePickerPresencialAberto(false)}
        />
      )}

      {confirmarPend && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmarPend(false) }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '26px 22px', width: '100%', maxWidth: 380, textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>✍️</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>Assinaturas pendentes</h3>
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 6 }}>
              {presenciaisPendentes === 1 ? 'Há 1 participante presencial que ainda não assinou.' : `Há ${presenciaisPendentes} participantes presenciais que ainda não assinaram.`}
            </p>
            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 22 }}>
              Você pode coletar as assinaturas agora ou continuar mesmo assim.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setConfirmarPend(false)} style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>✍️ Voltar e coletar assinaturas</button>
              <button onClick={() => { setConfirmarPend(false); next() }} style={{ width: '100%', padding: 13, borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Continuar mesmo assim →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

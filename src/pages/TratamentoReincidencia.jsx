// ── pages/TratamentoReincidencia.jsx ────────────────────────────────────────
// Cópia do fluxo de Abertura de Ocorrência (AberturaOcorrencia.jsx), com
// ajustes pedidos pelo Gileno: sem Local/Endereço nem GPS, rótulos próprios
// ("Descrição da Reincidência"/"Enviar para Tratamento") e 7 campos novos
// obrigatórios (OE/ABRG/PDF/AL/R07/R30/R90). Fase 1 — só o lançamento; a
// atribuição/tratamento dentro de Não Conformidades é uma fase futura.
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { Textarea, SearchSelect } from '../components/Shared.jsx'
import { prepararPayloadOcorrencia, salvarOcorrenciaBD, listarFiscaisParaDirecionamento } from '../lib/ocorrencias.js'
import { salvarOcorrenciaOffline } from '../lib/ocorrencias_offline.js'

// Mesma marca d'água discreta de AberturaOcorrencia.jsx.
function processarFotoReincidencia(file) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width  = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)

        const ts = new Date().toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
        const fontSize = 13
        const pad = 6
        ctx.font = `600 ${fontSize}px monospace`
        const boxW = ctx.measureText(ts).width + pad * 2
        const boxH = fontSize + pad * 1.6
        const boxX = img.width - boxW - 8
        const boxY = img.height - boxH - 8

        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(boxX, boxY, boxW, boxH)
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.textBaseline = 'middle'
        ctx.fillText(ts, boxX + pad, boxY + boxH / 2)

        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// Mesmo CampoFiscalDestino de AberturaOcorrencia.jsx.
function CampoFiscalDestino({ nome, matricula, onNome, onMatricula }) {
  const [fiscais,   setFiscais]   = useState([])
  const [carregado, setCarregado] = useState(false)
  const [semLista,  setSemLista]  = useState(false)

  useEffect(() => {
    listarFiscaisParaDirecionamento()
      .then(data => { setFiscais(data); setCarregado(true) })
      .catch(() => { setSemLista(true); setCarregado(true) })
  }, [])

  if (semLista || (carregado && fiscais.length === 0)) {
    return (
      <div className="form-group">
        <label className="form-label">Direcionar para (Fiscal/Supervisor) *</label>
        <input className="form-input" value={nome}
          onChange={e => onNome(e.target.value.toUpperCase())}
          placeholder="Nome completo" />
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
          📵 Sem conexão para buscar a lista — digite o nome manualmente.
        </p>
      </div>
    )
  }

  return (
    <div className="form-group">
      <label className="form-label">Direcionar para (Fiscal/Supervisor) *</label>
      <SearchSelect
        opcoes={fiscais.map(f => ({
          value: f.nome,
          label: f.matricula ? `${f.nome} (${f.matricula})` : f.nome,
        }))}
        valor={nome}
        onSelecionar={v => {
          onNome(v)
          const achado = fiscais.find(f => f.nome === v)
          onMatricula(achado?.matricula || '')
        }}
        placeholder={carregado ? 'Selecione o fiscal...' : 'Carregando...'}
      />
    </div>
  )
}

// Mesmo CampoPrefixo de AberturaOcorrencia.jsx.
function CampoPrefixo({ value, onChange }) {
  const [sugestoes, setSugestoes] = useState([])
  const [aberto,    setAberto]    = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const buscar = async v => {
    if (!v || v.length < 1) { setSugestoes([]); setAberto(false); return }
    try {
      const { data } = await supabase.from('estrutura_equipes')
        .select('prefixo')
        .ilike('prefixo', `%${v}%`)
        .not('prefixo', 'is', null)
        .neq('prefixo', '')
        .order('prefixo')
        .limit(15)
      const unicos = [...new Set((data || []).map(r => r.prefixo?.trim()).filter(Boolean))]
      setSugestoes(unicos)
      setAberto(unicos.length > 0)
    } catch { setSugestoes([]); setAberto(false) }
  }

  const handleChange = e => {
    const v = e.target.value.toUpperCase()
    onChange(v)
    buscar(v)
  }

  const selecionar = s => { onChange(s); setSugestoes([]); setAberto(false) }

  return (
    <div ref={ref} className="form-group" style={{ position: 'relative' }}>
      <label className="form-label">Prefixo / Equipe</label>
      <input className="form-input" value={value} onChange={handleChange}
        onFocus={() => value && buscar(value)}
        placeholder="Ex: PI-THE-C001M" autoComplete="off" />
      {aberto && sugestoes.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 2,
          background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 200, overflowY: 'auto',
        }}>
          {sugestoes.map((s, i) => (
            <button key={i} onMouseDown={() => selecionar(s)}
              style={{
                display: 'block', width: '100%', padding: '9px 12px',
                textAlign: 'left', background: 'none', border: 'none',
                borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none',
                fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// Mesmo CampoColaboradorEnvolvido de AberturaOcorrencia.jsx.
function CampoColaboradorEnvolvido({ value, onChange, label, placeholder }) {
  const [sugestoes, setSugestoes] = useState([])
  const [aberto,    setAberto]    = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const buscar = async v => {
    if (!v || v.length < 2) { setSugestoes([]); setAberto(false); return }
    try {
      const [eq, us] = await Promise.all([
        supabase.from('estrutura_equipes').select('colaborador').ilike('colaborador', `%${v}%`).order('colaborador').limit(10),
        supabase.from('usuarios').select('nome').eq('status', 'ATIVO').ilike('nome', `%${v}%`).order('nome').limit(10),
      ])
      const deEquipe    = (eq.data || []).map(r => r.colaborador?.trim()).filter(Boolean).map(nome => ({ nome, origem: 'equipe' }))
      const deUsuarios  = (us.data || []).map(r => r.nome?.trim()).filter(Boolean).map(nome => ({ nome, origem: 'usuario' }))
      const vistos = new Set()
      const combinadas = [...deEquipe, ...deUsuarios].filter(s => {
        const chave = s.nome.toUpperCase()
        if (vistos.has(chave)) return false
        vistos.add(chave)
        return true
      })
      setSugestoes(combinadas)
      setAberto(combinadas.length > 0)
    } catch { setSugestoes([]); setAberto(false) }
  }

  const handleChange = e => {
    const v = e.target.value
    onChange(v)
    buscar(v)
  }

  const selecionar = s => { onChange(s.nome); setSugestoes([]); setAberto(false) }

  return (
    <div ref={ref} className="form-group" style={{ position: 'relative' }}>
      <label className="form-label">{label}</label>
      <input className="form-input" value={value} onChange={handleChange}
        onFocus={() => value && buscar(value)}
        placeholder={placeholder} autoComplete="off" />
      {aberto && sugestoes.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 2,
          background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 200, overflowY: 'auto',
        }}>
          {sugestoes.map((s, i) => (
            <button key={i} onMouseDown={() => selecionar(s)}
              style={{
                display: 'block', width: '100%', padding: '9px 12px',
                textAlign: 'left', background: 'none', border: 'none',
                borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none',
                fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {s.nome}
              {s.origem === 'usuario' && (
                <span style={{ fontSize: 10, fontWeight: 500, color: '#64748b', marginLeft: 6 }}>· usuário do sistema</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TratamentoReincidencia({ usuarioLogado, isOnline, onHome, onVoltar }) {
  const [prefixo,            setPrefixo]            = useState('')
  const [colaboradorEnvolvido, setColaboradorEnvolvido] = useState('')
  const [colaboradorEnvolvido2, setColaboradorEnvolvido2] = useState('')
  const [direcionadoPara,    setDirecionadoPara]    = useState('')
  const [matriculaDestino,   setMatriculaDestino]   = useState('')
  const [descricao,          setDescricao]          = useState('')
  const [foto,                setFoto]              = useState(null)
  const [status,              setStatus]            = useState('idle') // idle | saving | saved | error
  const [erro,                setErro]              = useState('')
  const [salvoOffline,        setSalvoOffline]      = useState(false)

  // Campos novos de Reincidência (Foto 3) — todos obrigatórios.
  const [numeroOE,       setNumeroOE]       = useState('')
  const [abrangencia,    setAbrangencia]    = useState('')
  const [componentePDF,  setComponentePDF]  = useState('')
  const [alimentadorAL,  setAlimentadorAL]  = useState('')
  const [reincidenciaR07, setReincidenciaR07] = useState('')
  const [reincidenciaR30, setReincidenciaR30] = useState('')
  const [reincidenciaR90, setReincidenciaR90] = useState('')

  // Data/Hora de abertura — mesmo padrão de AberturaOcorrencia.jsx.
  const [data, setData] = useState(() => new Date().toISOString().split('T')[0])
  const [hora, setHora] = useState(() => new Date().toTimeString().slice(0, 5))

  const online = isOnline !== undefined ? isOnline : navigator.onLine

  const podeEnviar = colaboradorEnvolvido.trim() && direcionadoPara.trim() && descricao.trim().length > 0 && !!foto &&
    numeroOE.trim() && abrangencia.trim() && componentePDF.trim() && alimentadorAL.trim() &&
    reincidenciaR07.trim() && reincidenciaR30.trim() && reincidenciaR90.trim()

  const addFoto = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await processarFotoReincidencia(file)
    setFoto(url)
    e.target.value = ''
  }

  const enviar = async () => {
    if (!podeEnviar) return
    setStatus('saving')
    setErro('')

    const form = {
      tipo_ocorrencia:           'REINCIDENCIA',
      prefixo:                   prefixo.trim().toUpperCase(),
      eletricista_equipe:        colaboradorEnvolvido.trim(),
      eletricista_equipe_2:      colaboradorEnvolvido2.trim() || null,
      direcionado_para:          direcionadoPara.trim(),
      matricula_fiscal_destino:  matriculaDestino,
      descricao:                 descricao.trim(),
      foto,
      aberto_por:                usuarioLogado?.nome || '',
      matricula_aberto_por:      usuarioLogado?.matricula || '',
      data, hora,
      numero_oe:                 numeroOE.trim(),
      abrangencia:               abrangencia.trim().toUpperCase(),
      componente_pdf:            componentePDF.trim(),
      alimentador_al:            alimentadorAL.trim().toUpperCase(),
      reincidencia_r07:          reincidenciaR07.trim(),
      reincidencia_r30:          reincidenciaR30.trim(),
      reincidencia_r90:          reincidenciaR90.trim(),
    }

    if (!online) {
      try {
        await salvarOcorrenciaOffline(form)
        setSalvoOffline(true)
        setStatus('saved')
      } catch (err) {
        setErro('Erro ao salvar offline: ' + err.message)
        setStatus('error')
      }
      return
    }

    try {
      const payload = await prepararPayloadOcorrencia(form)
      await salvarOcorrenciaBD(payload)
      setSalvoOffline(false)
      setStatus('saved')
    } catch (err) {
      console.error('Erro ao salvar tratamento de reincidência:', err)
      setErro(err.message || 'Erro ao salvar. Verifique a conexão.')
      setStatus('error')
    }
  }

  const reiniciar = () => {
    setPrefixo(''); setColaboradorEnvolvido(''); setColaboradorEnvolvido2(''); setDirecionadoPara(''); setMatriculaDestino('')
    setDescricao(''); setFoto(null); setStatus('idle'); setErro(''); setSalvoOffline(false)
    setData(new Date().toISOString().split('T')[0]); setHora(new Date().toTimeString().slice(0, 5))
    setNumeroOE(''); setAbrangencia(''); setComponentePDF(''); setAlimentadorAL('')
    setReincidenciaR07(''); setReincidenciaR30(''); setReincidenciaR90('')
  }

  return (
    <div className="app-shell">
      <header className="app-header no-print" style={{ background: '#c2410c' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Plataforma de Gestão Operacional
          </div>
          <button onClick={onHome} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          }}>← Voltar</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>🔁 Tratamento de Reincidência</div>
        <p style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          Relate a reincidência e direcione para o fiscal tratar
        </p>
      </header>

      <main className="app-content">
        <div style={{ padding: '0 0 80px' }}>

          {!online && (
            <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e', fontWeight: 700 }}>
              📵 Sem internet — será salvo localmente e enviado quando a conexão voltar.
            </div>
          )}

          {status === 'saved' ? (
            <>
              <div style={{ background: salvoOffline ? '#fef3c7' : '#fff7ed', border: `1.5px solid ${salvoOffline ? '#fcd34d' : '#fed7aa'}`, borderRadius: 14, padding: '18px 16px', marginBottom: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{salvoOffline ? '📵' : '✅'}</div>
                <p style={{ color: salvoOffline ? '#92400e' : '#c2410c', fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
                  {salvoOffline ? 'Reincidência salva localmente!' : 'Enviada para tratamento com sucesso!'}
                </p>
                <p style={{ color: '#64748b', fontSize: 12 }}>
                  {salvoOffline
                    ? 'Quando a internet voltar, será enviada automaticamente ao fiscal.'
                    : `Direcionada para ${direcionadoPara}.`}
                </p>
              </div>
              <button onClick={reiniciar} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#c2410c', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
                + Lançar Nova Reincidência
              </button>
              <button onClick={onVoltar} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                ← Voltar
              </button>
            </>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Nome usuário</label>
                <input className="form-input" value={usuarioLogado?.nome || ''} disabled
                  style={{ background: '#fff7ed', borderColor: '#fed7aa', color: '#9a3412', fontWeight: 700 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Matrícula usuário</label>
                <input className="form-input" value={usuarioLogado?.matricula || ''} disabled
                  style={{ background: '#fff7ed', borderColor: '#fed7aa', color: '#9a3412', fontWeight: 700 }} />
                <p style={{ fontSize: 11, color: '#c2410c', marginTop: 4 }}>✅ Preenchidos automaticamente do seu cadastro</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Data *</label>
                  <input className="form-input" type="date" value={data} onChange={e => setData(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Hora *</label>
                  <input className="form-input" type="time" value={hora} onChange={e => setHora(e.target.value)} />
                </div>
              </div>

              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#9a3412', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  🔁 Dados da Reincidência
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Num. Ocorrência (OE) *</label>
                    <input className="form-input" value={numeroOE} onChange={e => setNumeroOE(e.target.value.toUpperCase())} placeholder="Ex: 52997 (C)" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Abrangência (ABRG) *</label>
                    <input className="form-input" value={abrangencia} onChange={e => setAbrangencia(e.target.value.toUpperCase())} placeholder="Ex: TF" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Componente (PDF) *</label>
                    <input className="form-input" value={componentePDF} onChange={e => setComponentePDF(e.target.value.toUpperCase())} placeholder="Ex: 1495224" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Alimentador (AL) *</label>
                    <input className="form-input" value={alimentadorAL} onChange={e => setAlimentadorAL(e.target.value.toUpperCase())} placeholder="Ex: BAS01C1" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 0 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Reincidência R07 *</label>
                    <input className="form-input" value={reincidenciaR07} onChange={e => setReincidenciaR07(e.target.value.toUpperCase())} placeholder="Ex: 1 ou ---" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Reincidência R30 *</label>
                    <input className="form-input" value={reincidenciaR30} onChange={e => setReincidenciaR30(e.target.value.toUpperCase())} placeholder="Ex: 1 ou ---" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Reincidência R90 *</label>
                    <input className="form-input" value={reincidenciaR90} onChange={e => setReincidenciaR90(e.target.value.toUpperCase())} placeholder="Ex: 1 ou ---" />
                  </div>
                </div>
              </div>

              <CampoPrefixo value={prefixo} onChange={setPrefixo} />

              <CampoColaboradorEnvolvido value={colaboradorEnvolvido} onChange={setColaboradorEnvolvido}
                label="Colaborador 1 envolvido *" placeholder="Nome do colaborador" />

              <CampoColaboradorEnvolvido value={colaboradorEnvolvido2} onChange={setColaboradorEnvolvido2}
                label="Colaborador 2 envolvido (opcional)" placeholder="Nome do 2º colaborador, se houver" />

              <CampoFiscalDestino
                nome={direcionadoPara} matricula={matriculaDestino}
                onNome={setDirecionadoPara} onMatricula={setMatriculaDestino}
              />

              <Textarea label="Descrição da Reincidência *" value={descricao} onChange={setDescricao}
                placeholder="Descreva a reincidência (ex: área com 3 desligamentos no período)..." rows={4} />

              <div className="form-group">
                <label className="form-label">Foto *</label>
                {foto ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={foto} alt="Evidência" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, border: '1px solid #e2e8f0' }} />
                    <button onClick={() => setFoto(null)} style={{
                      position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%',
                      background: '#dc2626', color: '#fff', border: '2px solid #fff', fontSize: 14, cursor: 'pointer',
                    }}>×</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <label style={{ flex: 1, cursor: 'pointer' }}>
                      <input type="file" accept="image/*" capture="environment" onChange={addFoto} style={{ display: 'none' }} />
                      <div className="upload-zone" style={{ marginBottom: 0 }}>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                        <p style={{ color: '#c2410c', fontWeight: 700, fontSize: 13 }}>Tirar foto</p>
                        <p style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Câmera</p>
                      </div>
                    </label>
                    <label style={{ flex: 1, cursor: 'pointer' }}>
                      <input type="file" accept="image/*" onChange={addFoto} style={{ display: 'none' }} />
                      <div className="upload-zone" style={{ marginBottom: 0 }}>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                        <p style={{ color: '#7c3aed', fontWeight: 700, fontSize: 13 }}>Da galeria</p>
                        <p style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Galeria</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {erro && (
                <div className="alert alert-danger" style={{ marginBottom: 14 }}>❌ {erro}</div>
              )}

              <button onClick={enviar} disabled={!podeEnviar || status === 'saving'} style={{
                width: '100%', padding: 14, borderRadius: 12, border: 'none',
                background: (!podeEnviar || status === 'saving') ? '#e2e8f0' : (online ? '#c2410c' : '#dc2626'),
                color: (!podeEnviar || status === 'saving') ? '#94a3b8' : '#fff',
                fontSize: 15, fontWeight: 700, cursor: (!podeEnviar || status === 'saving') ? 'not-allowed' : 'pointer',
                marginBottom: 10,
              }}>
                {status === 'saving' ? '⏳ Enviando...' : online ? '🔁 Enviar para Tratamento' : '📵 Salvar Offline'}
              </button>
              <button onClick={onVoltar} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                ← Cancelar
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

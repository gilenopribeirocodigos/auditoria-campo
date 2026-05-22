import { useState, useEffect, useRef } from 'react'
import { buscarTokenPorUUID, salvarAssinaturaColetada, verificarJaAssinou, listarAssinaturasColetadas } from '../lib/assinaturas.js'
import { TIPOS_REGISTRO } from '../data/registros_config.js'

const TIPO_MEDIDA_LABEL = {
  FEEDBACK:            'Feedback',
  ADVERTENCIA_VERBAL:  'Advertência Verbal',
  ADVERTENCIA_ESCRITA: 'Advertência Escrita',
  SUSPENSAO:           'Suspensão',
}

// ── Canvas de assinatura ──────────────────────────────────────────────────────
function AssinaturaPad({ onConfirmar }) {
  const canvasRef = useRef(null)
  const [desenhando, setDesenhando] = useState(false)
  const [temTraco,   setTemTraco]   = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src  = e.touches ? e.touches[0] : e
    return {
      x: (src.clientX - rect.left) * (canvas.width  / rect.width),
      y: (src.clientY - rect.top)  * (canvas.height / rect.height),
    }
  }

  const iniciar = e => {
    e.preventDefault()
    const pos = getPos(e, canvasRef.current)
    setDesenhando(true)
    setTemTraco(true)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const desenhar = e => {
    e.preventDefault()
    if (!desenhando) return
    const pos = getPos(e, canvasRef.current)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const parar = e => { e.preventDefault(); setDesenhando(false) }

  const limpar = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setTemTraco(false)
  }

  return (
    <div>
      <canvas
        ref={canvasRef} width={340} height={160}
        onMouseDown={iniciar} onMouseMove={desenhar} onMouseUp={parar} onMouseLeave={parar}
        onTouchStart={iniciar} onTouchMove={desenhar} onTouchEnd={parar}
        style={{
          width: '100%', height: 160,
          borderRadius: 12, border: '2px solid #e2e8f0',
          background: '#fafafa', cursor: 'crosshair',
          display: 'block', touchAction: 'none',
        }}
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button onClick={limpar} style={{
          flex: 1, padding: 10, borderRadius: 10,
          border: '1px solid #e2e8f0', background: '#f8fafc',
          color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>🔄 Limpar</button>
        <button
          onClick={() => temTraco && onConfirmar(canvasRef.current.toDataURL('image/png'))}
          disabled={!temTraco}
          style={{
            flex: 2, padding: 10, borderRadius: 10, border: 'none',
            background: temTraco ? '#1e3a5f' : '#e2e8f0',
            color: temTraco ? '#fff' : '#94a3b8',
            fontSize: 14, fontWeight: 700,
            cursor: temTraco ? 'pointer' : 'not-allowed',
          }}
        >✅ Confirmar Assinatura</button>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function PaginaAssinar({ tokenUUID }) {
  const [fase,        setFase]        = useState('carregando') // carregando | formulario | assinando | sucesso | erro | expirado | encerrado
  const [tokenData,   setTokenData]   = useState(null)
  const [assinadas,   setAssinadas]   = useState([])
  const [nome,        setNome]        = useState('')
  const [matricula,   setMatricula]   = useState('')
  const [erro,        setErro]        = useState('')
  const [salvando,    setSalvando]    = useState(false)

  const registro = tokenData?.registros_operacionais
  const tipoConfig = registro ? TIPOS_REGISTRO[registro.tipo] : null

  useEffect(() => {
    carregarToken()
  }, [tokenUUID])

  const carregarToken = async () => {
    try {
      const data = await buscarTokenPorUUID(tokenUUID)
      setTokenData(data)

      // Verifica validade
      if (data.status === 'ENCERRADO') { setFase('encerrado'); return }
      if (new Date(data.expires_at) < new Date()) { setFase('expirado'); return }

      // Carrega assinaturas já coletadas
      const coletadas = await listarAssinaturasColetadas(data.id)
      setAssinadas(coletadas)

      setFase('formulario')
    } catch (e) {
      console.error(e)
      setFase('erro')
    }
  }

  const prosseguirParaAssinatura = async () => {
    if (!nome.trim()) { setErro('Digite seu nome completo.'); return }
    setErro('')

    // Verifica se já assinou
    const jaAssinou = await verificarJaAssinou(tokenData.id, nome.trim())
    if (jaAssinou) {
      setErro(`"${nome.trim()}" já assinou este documento às ${new Date(jaAssinou.assinado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`)
      return
    }

    setFase('assinando')
  }

  const onConfirmarAssinatura = async (assinaturaBase64) => {
    setSalvando(true)
    try {
      await salvarAssinaturaColetada(
        tokenData.id,
        tokenData.registro_id,
        nome.trim(),
        matricula.trim(),
        assinaturaBase64
      )
      setFase('sucesso')
    } catch (e) {
      console.error(e)
      setErro('Erro ao salvar assinatura. Tente novamente.')
      setFase('formulario')
    } finally {
      setSalvando(false)
    }
  }

  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  // ── TELAS ─────────────────────────────────────────────────────────────────

  if (fase === 'carregando') return (
    <div style={styles.tela}>
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <p style={{ fontSize: 16, color: '#64748b' }}>Carregando documento...</p>
      </div>
    </div>
  )

  if (fase === 'erro') return (
    <div style={styles.tela}>
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>Link inválido</p>
        <p style={{ fontSize: 14, color: '#64748b' }}>Este link não existe ou foi removido.</p>
      </div>
    </div>
  )

  if (fase === 'expirado') return (
    <div style={styles.tela}>
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏰</div>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#d97706', marginBottom: 8 }}>Link expirado</p>
        <p style={{ fontSize: 14, color: '#64748b' }}>Este link de assinatura expirou. Solicite um novo ao fiscal.</p>
      </div>
    </div>
  )

  if (fase === 'encerrado') return (
    <div style={styles.tela}>
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Link encerrado</p>
        <p style={{ fontSize: 14, color: '#64748b' }}>O fiscal encerrou este link. Não é mais possível assinar.</p>
      </div>
    </div>
  )

  if (fase === 'sucesso') return (
    <div style={styles.tela}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <p style={{ fontSize: 22, fontWeight: 800, color: '#15803d', marginBottom: 8 }}>
          Assinatura registrada!
        </p>
        <p style={{ fontSize: 15, color: '#64748b', marginBottom: 6 }}>
          Obrigado, <strong>{nome}</strong>!
        </p>
        <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
          Sua assinatura foi salva com sucesso.<br />
          Você pode fechar esta página.
        </p>

        {/* Resumo do que foi assinado */}
        {registro && (
          <div style={{ marginTop: 24, background: tipoConfig?.bg, border: `1.5px solid ${tipoConfig?.border}`, borderRadius: 14, padding: 16, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 24 }}>{tipoConfig?.emoji}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: tipoConfig?.color }}>{tipoConfig?.label}</span>
            </div>
            <p style={{ fontSize: 13, color: '#475569' }}>
              <strong>Fiscal:</strong> {registro.fiscal}<br />
              <strong>Data:</strong> {formatData(registro.data_registro)} às {registro.hora_registro}<br />
              {registro.pauta && <><strong>Pauta:</strong> {registro.pauta.slice(0, 120)}{registro.pauta.length > 120 ? '...' : ''}</>}
            </p>
          </div>
        )}

        <div style={{ marginTop: 20, background: '#f1f5f9', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#64748b' }}>
          DPL Construções — Contrato Equatorial Energia 1021/2024
        </div>
      </div>
    </div>
  )

  // ── FORMULÁRIO + ASSINATURA ───────────────────────────────────────────────
  return (
    <div style={styles.tela}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f, #1d4ed8)',
        color: '#fff', padding: '16px 20px', borderRadius: '0 0 20px 20px',
        marginBottom: 20,
      }}>
        <p style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
          DPL Construções — Equatorial Energia
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>{tipoConfig?.emoji || '📝'}</span>
          <div>
            <p style={{ fontSize: 17, fontWeight: 800 }}>{tipoConfig?.label || 'Registro Operacional'}</p>
            <p style={{ fontSize: 12, opacity: 0.8 }}>Assinatura digital solicitada</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px 40px' }}>

        {/* Dados do registro */}
        {registro && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase' }}>
              Detalhes do Registro
            </p>
            {[
              ['Fiscal',     registro.fiscal],
              ['Data/Hora',  `${formatData(registro.data_registro)} às ${registro.hora_registro}`],
              ['Local',      registro.endereco],
              ['Tema',       registro.tema],
              registro.tipo_medida ? ['Medida', TIPO_MEDIDA_LABEL[registro.tipo_medida]] : null,
            ].filter(Boolean).filter(([, v]) => v).map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <span style={{ color: '#94a3b8', fontWeight: 500 }}>{l}</span>
                <span style={{ color: '#1e293b', fontWeight: 600, textAlign: 'right', maxWidth: '65%', wordBreak: 'break-word' }}>{v}</span>
              </div>
            ))}

            {/* Pauta */}
            {registro.pauta && (
              <div style={{ marginTop: 12, background: '#fffbeb', borderRadius: 8, padding: '10px 12px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                  {registro.tipo === 'DISCIPLINAR' ? 'DESCRIÇÃO:' : 'PAUTA / CONTEÚDO:'}
                </p>
                <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>{registro.pauta}</p>
              </div>
            )}
          </div>
        )}

        {/* Já assinaram */}
        {assinadas.length > 0 && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>
              ✅ {assinadas.length} pessoa(s) já assinaram
            </p>
            {assinadas.map((a, i) => (
              <div key={i} style={{ fontSize: 13, color: '#15803d', padding: '3px 0' }}>
                {i + 1}. {a.nome} {a.matricula ? `(Mat: ${a.matricula})` : ''}
              </div>
            ))}
          </div>
        )}

        {/* FASE: formulário */}
        {fase === 'formulario' && (
          <>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>
                ✍️ Sua identificação
              </p>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>
                  Nome completo *
                </label>
                <input
                  value={nome}
                  onChange={e => { setNome(e.target.value.toUpperCase()); setErro('') }}
                  placeholder="Digite seu nome completo"
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 10,
                    border: '1.5px solid #e2e8f0', fontSize: 15,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>
                  Matrícula (opcional)
                </label>
                <input
                  value={matricula}
                  onChange={e => setMatricula(e.target.value)}
                  placeholder="Sua matrícula"
                  inputMode="numeric"
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 10,
                    border: '1.5px solid #e2e8f0', fontSize: 15,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              {erro && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: '#b91c1c' }}>
                  ⚠️ {erro}
                </div>
              )}

              <button
                onClick={prosseguirParaAssinatura}
                disabled={!nome.trim()}
                style={{
                  width: '100%', padding: 14, borderRadius: 12, border: 'none',
                  background: nome.trim() ? '#1e3a5f' : '#e2e8f0',
                  color: nome.trim() ? '#fff' : '#94a3b8',
                  fontSize: 16, fontWeight: 700,
                  cursor: nome.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Continuar para assinar →
              </button>
            </div>

            <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 1.6 }}>
              Ao assinar, você confirma que participou deste {tipoConfig?.label?.toLowerCase() || 'registro'} e está ciente do conteúdo acima.
            </p>
          </>
        )}

        {/* FASE: assinatura */}
        {fase === 'assinando' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
              Assinatura de {nome}
            </p>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
              Assine no campo abaixo com o dedo
            </p>

            {salvando ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ fontSize: 14, color: '#64748b' }}>⏳ Salvando assinatura...</p>
              </div>
            ) : (
              <>
                <AssinaturaPad onConfirmar={onConfirmarAssinatura} />
                <button
                  onClick={() => setFase('formulario')}
                  style={{
                    width: '100%', marginTop: 12, padding: 12, borderRadius: 10,
                    border: '1px solid #e2e8f0', background: '#f8fafc',
                    color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >← Voltar</button>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

const styles = {
  tela: {
    minHeight: '100vh',
    background: '#f0f4f8',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  }
}

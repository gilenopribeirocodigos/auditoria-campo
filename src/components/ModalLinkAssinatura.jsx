import { useState, useEffect } from 'react'
import { criarTokenAssinatura, listarAssinaturasColetadas, encerrarToken } from '../lib/assinaturas.js'

const BASE_URL = window.location.origin

const OPCOES_MINUTOS = [
  { label: '15 min',  value: 15 },
  { label: '30 min',  value: 30 },
  { label: '45 min',  value: 45 },
  { label: '1 hora',  value: 60 },
  { label: '2 horas', value: 120 },
  { label: '4 horas', value: 240 },
]

export default function ModalLinkAssinatura({ registroId, tipoLabel, onFechar }) {
  // fase: 'configurando' | 'gerando' | 'pronto' | 'encerrado'
  const [fase,         setFase]         = useState('configurando')
  const [minutos,      setMinutos]      = useState(60)
  const [tokenData,    setTokenData]    = useState(null)
  const [assinadas,    setAssinadas]    = useState([])
  const [copiado,      setCopiado]      = useState(false)
  const [encerrando,   setEncerrando]   = useState(false)
  const [erro,         setErro]         = useState('')
  const [countdown,    setCountdown]    = useState('')   // ex: "28:45"

  const link  = tokenData ? `${BASE_URL}/assinar/${tokenData.token}` : ''
  const label = tipoLabel || 'Registro Operacional'

  // ── Countdown timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (fase !== 'pronto' || !tokenData?.expires_at) return
    const tick = () => {
      const diff = new Date(tokenData.expires_at) - new Date()
      if (diff <= 0) { setCountdown('expirado'); setFase('encerrado'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(h > 0
        ? `${h}h ${String(m).padStart(2, '0')}min`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [fase, tokenData])

  // ── Auto-refresh assinaturas a cada 8s ──────────────────────────────────
  useEffect(() => {
    if (fase !== 'pronto' || !tokenData) return
    const id = setInterval(() => {
      listarAssinaturasColetadas(tokenData.id).then(setAssinadas).catch(() => {})
    }, 8000)
    return () => clearInterval(id)
  }, [fase, tokenData])

  const gerarToken = async () => {
    setFase('gerando')
    setErro('')
    try {
      const data = await criarTokenAssinatura(registroId, minutos)
      setTokenData(data)
      const coletadas = await listarAssinaturasColetadas(data.id)
      setAssinadas(coletadas)
      setFase('pronto')
    } catch (e) {
      setErro('Erro ao gerar link: ' + e.message)
      setFase('configurando')
    }
  }

  const copiarLink = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    })
  }

  const compartilharWhatsApp = () => {
    const expiracaoTexto = minutos < 60
      ? `${minutos} minutos`
      : minutos === 60 ? '1 hora' : `${minutos / 60} horas`
    const texto = encodeURIComponent(
      `📋 *${label}*\nDPL Construções — Equatorial Energia\n\n` +
      `Clique no link abaixo para assinar:\n${link}\n\n` +
      `⏰ Link válido por ${expiracaoTexto}`
    )
    window.open(`https://wa.me/?text=${texto}`, '_blank')
  }

  const onEncerrar = async () => {
    if (!window.confirm('Encerrar este link? Ninguém mais conseguirá assinar.')) return
    setEncerrando(true)
    try {
      await encerrarToken(tokenData.id)
      setFase('encerrado')
    } catch (e) {
      alert('Erro ao encerrar: ' + e.message)
    } finally {
      setEncerrando(false)
    }
  }

  const atualizarManual = async () => {
    if (!tokenData) return
    const data = await listarAssinaturasColetadas(tokenData.id)
    setAssinadas(data)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 3000,
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, maxHeight: '92vh',
        overflowY: 'auto', padding: '24px 20px 40px',
      }}>
        <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>🔗 Link de Assinatura</h2>
            <p style={{ fontSize: 13, color: '#2563eb', fontWeight: 700 }}>{label}</p>
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        {/* ── FASE: CONFIGURANDO ─────────────────────────────────────────── */}
        {fase === 'configurando' && (
          <>
            <div style={{ background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18, marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>⏰ Tempo de validade do link</p>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
                Após esse tempo o link expira automaticamente e ninguém mais consegue assinar.
              </p>

              {/* Grid de opções rápidas */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                {OPCOES_MINUTOS.map(op => (
                  <button key={op.value} onClick={() => setMinutos(op.value)} style={{
                    padding: '12px 6px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${minutos === op.value ? '#2563eb' : '#e2e8f0'}`,
                    background: minutos === op.value ? '#eff6ff' : '#fff',
                    color: minutos === op.value ? '#1d4ed8' : '#374151',
                    fontSize: 13, fontWeight: minutos === op.value ? 800 : 600,
                  }}>
                    {op.label}
                  </button>
                ))}
              </div>

              {/* Campo personalizado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Personalizado:
                </label>
                <input
                  type="number" min="5" max="480" value={minutos}
                  onChange={e => setMinutos(Math.max(5, Math.min(480, Number(e.target.value))))}
                  style={{ width: 80, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 14, fontWeight: 700, textAlign: 'center' }}
                />
                <span style={{ fontSize: 13, color: '#64748b' }}>minutos</span>
              </div>

              {/* Resumo */}
              <div style={{ marginTop: 14, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
                ⚠️ O link expirará em <strong>{minutos < 60 ? `${minutos} minutos` : minutos === 60 ? '1 hora' : `${(minutos/60).toFixed(1).replace('.0','')} horas`}</strong> após ser gerado.
              </div>
            </div>

            <button onClick={gerarToken} style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none',
              background: '#2563eb', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10,
            }}>
              🔗 Gerar Link e QR Code →
            </button>

            {erro && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 10 }}>
                ❌ {erro}
              </div>
            )}

            <button onClick={onFechar} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Cancelar
            </button>
          </>
        )}

        {/* ── FASE: GERANDO ─────────────────────────────────────────────── */}
        {fase === 'gerando' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: 14, color: '#64748b' }}>⏳ Gerando link seguro...</p>
          </div>
        )}

        {/* ── FASE: PRONTO / ENCERRADO ───────────────────────────────────── */}
        {(fase === 'pronto' || fase === 'encerrado') && tokenData && (
          <>
            {/* Status com countdown */}
            {fase === 'encerrado' && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b91c1c', fontWeight: 700, textAlign: 'center' }}>
                🔒 Link encerrado — não aceita mais assinaturas
              </div>
            )}

            {fase === 'pronto' && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#15803d', fontWeight: 700 }}>✅ Link ativo</span>
                  <span style={{ fontSize: 13, color: countdown === 'expirado' ? '#dc2626' : '#15803d', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    ⏰ {countdown}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Expira em {new Date(tokenData.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )}

            {/* QR Code */}
            <div style={{ background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, textAlign: 'center', marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 12, textTransform: 'uppercase' }}>
                QR Code — escaneie com o celular
              </p>
              <div style={{ display: 'inline-block', padding: 12, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <QRCodeSVG value={link} size={180} />
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.5 }}>
                Projete na tela em videochamadas<br />ou mostre o celular presencialmente
              </p>
            </div>

            {/* Link texto */}
            <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 14px', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>LINK PARA COMPARTILHAR</p>
              <p style={{ fontSize: 12, color: '#1e293b', wordBreak: 'break-all', background: '#fff', borderRadius: 8, padding: '8px 10px', border: '1px solid #e2e8f0', lineHeight: 1.5, margin: 0 }}>
                {link}
              </p>
            </div>

            {/* Botões compartilhar */}
            {fase === 'pronto' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <button onClick={compartilharWhatsApp} style={{ padding: '12px 10px', borderRadius: 12, border: 'none', background: '#25d366', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  📤 WhatsApp
                </button>
                <button onClick={copiarLink} style={{ padding: '12px 10px', borderRadius: 12, border: '1.5px solid #2563eb', background: copiado ? '#eff6ff' : '#fff', color: '#2563eb', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  {copiado ? '✅ Copiado!' : '📋 Copiar link'}
                </button>
              </div>
            )}

            {/* Assinaturas coletadas */}
            <div style={{ background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#374151', margin: 0 }}>
                  ✅ Assinaturas recebidas ({assinadas.length})
                </p>
                {fase === 'pronto' && (
                  <button onClick={atualizarManual} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>🔄 Atualizar</button>
                )}
              </div>

              {assinadas.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>Aguardando assinaturas...</p>
              ) : (
                assinadas.map((a, i) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: i < assinadas.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#15803d', margin: 0 }}>{i + 1}. {a.nome}</p>
                        {a.matricula && <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>Mat: {a.matricula}</p>}
                        {/* Localização de onde assinou */}
                        {a.endereco_assinatura && (
                          <p style={{ fontSize: 11, color: '#2563eb', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                            📍 {a.endereco_assinatura}
                          </p>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {a.assinatura_url && (
                          <img src={a.assinatura_url} alt="assinatura"
                            style={{ height: 32, maxWidth: 80, objectFit: 'contain', borderRadius: 4, background: '#fafafa', border: '1px solid #e2e8f0' }} />
                        )}
                        <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                          {new Date(a.assinado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {fase === 'pronto' && (
              <button onClick={onEncerrar} disabled={encerrando} style={{
                width: '100%', padding: 13, borderRadius: 12,
                border: '1.5px solid #dc2626', background: '#fff',
                color: '#dc2626', fontSize: 14, fontWeight: 700,
                cursor: encerrando ? 'not-allowed' : 'pointer', marginBottom: 10,
              }}>
                {encerrando ? '⏳ Encerrando...' : '🔒 Encerrar link (ninguém mais assina)'}
              </button>
            )}
          </>
        )}

        <button onClick={onFechar} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Fechar
        </button>
      </div>
    </div>
  )
}

function QRCodeSVG({ value, size = 180 }) {
  const [qrSVG, setQrSVG] = useState(null)
  useEffect(() => {
    setQrSVG(`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&format=svg&margin=2`)
  }, [value, size])
  if (!qrSVG) return <div style={{ width: size, height: size, background: '#f1f5f9', borderRadius: 8 }} />
  return <img src={qrSVG} alt="QR Code" width={size} height={size} style={{ borderRadius: 8, display: 'block' }} />
}

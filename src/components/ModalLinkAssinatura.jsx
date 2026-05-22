import { useState, useEffect } from 'react'
import { criarTokenAssinatura, listarAssinaturasColetadas, encerrarToken } from '../lib/assinaturas.js'

// BASE_URL da aplicação — detecta automaticamente dev ou produção
const BASE_URL = window.location.origin

export default function ModalLinkAssinatura({ registroId, onFechar }) {
  const [fase,       setFase]       = useState('gerando') // gerando | pronto | encerrado
  const [tokenData,  setTokenData]  = useState(null)
  const [assinadas,  setAssinadas]  = useState([])
  const [copiado,    setCopiado]    = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [erro,       setErro]       = useState('')

  const link = tokenData ? `${BASE_URL}/assinar/${tokenData.token}` : ''

  useEffect(() => {
    gerarToken()
  }, [registroId])

  // Atualiza lista de assinados a cada 8 segundos
  useEffect(() => {
    if (fase !== 'pronto' || !tokenData) return
    const interval = setInterval(() => {
      listarAssinaturasColetadas(tokenData.id).then(setAssinadas).catch(() => {})
    }, 8000)
    return () => clearInterval(interval)
  }, [fase, tokenData])

  const gerarToken = async () => {
    try {
      const data = await criarTokenAssinatura(registroId)
      setTokenData(data)
      setFase('pronto')
    } catch (e) {
      setErro('Erro ao gerar link: ' + e.message)
      setFase('pronto')
    }
  }

  const copiarLink = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    })
  }

  const compartilharWhatsApp = () => {
    const texto = encodeURIComponent(
      `📋 *${document.title || 'Registro Operacional'}*\n\nClique no link abaixo para assinar:\n${link}`
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
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 3000,
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, maxHeight: '92vh',
        overflowY: 'auto', padding: '24px 20px 40px',
      }}>

        {/* Handle */}
        <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>
              🔗 Link de Assinatura
            </h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Compartilhe para coletar assinaturas remotamente
            </p>
          </div>
          <button onClick={onFechar} style={{
            background: 'none', border: 'none', fontSize: 22,
            cursor: 'pointer', color: '#94a3b8',
          }}>×</button>
        </div>

        {fase === 'gerando' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: 14, color: '#64748b' }}>⏳ Gerando link seguro...</p>
          </div>
        )}

        {(fase === 'pronto' || fase === 'encerrado') && !erro && tokenData && (
          <>
            {/* Status */}
            {fase === 'encerrado' && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b91c1c', fontWeight: 700, textAlign: 'center' }}>
                🔒 Link encerrado — não aceita mais assinaturas
              </div>
            )}

            {fase === 'pronto' && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                ✅ Link ativo · válido por 7 dias
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
                Projete na tela em videochamadas<br />
                ou mostre o celular presencialmente
              </p>
            </div>

            {/* Link texto */}
            <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 14px', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>LINK PARA COMPARTILHAR</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <p style={{
                  flex: 1, fontSize: 12, color: '#1e293b', wordBreak: 'break-all',
                  background: '#fff', borderRadius: 8, padding: '8px 10px',
                  border: '1px solid #e2e8f0', lineHeight: 1.5,
                }}>
                  {link}
                </p>
              </div>
            </div>

            {/* Botões de compartilhar */}
            {fase === 'pronto' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <button onClick={compartilharWhatsApp} style={{
                  padding: '12px 10px', borderRadius: 12, border: 'none',
                  background: '#25d366', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>
                  📤 WhatsApp
                </button>
                <button onClick={copiarLink} style={{
                  padding: '12px 10px', borderRadius: 12,
                  border: '1.5px solid #2563eb', background: copiado ? '#eff6ff' : '#fff',
                  color: '#2563eb', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>
                  {copiado ? '✅ Copiado!' : '📋 Copiar link'}
                </button>
              </div>
            )}

            {/* Assinaturas coletadas */}
            <div style={{ background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>
                  ✅ Assinaturas recebidas ({assinadas.length})
                </p>
                {fase === 'pronto' && (
                  <button onClick={atualizarManual} style={{
                    fontSize: 12, color: '#2563eb', background: 'none',
                    border: 'none', cursor: 'pointer', fontWeight: 600,
                  }}>🔄 Atualizar</button>
                )}
              </div>

              {assinadas.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
                  Aguardando assinaturas...
                </p>
              ) : (
                assinadas.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: i < assinadas.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>{i + 1}. {a.nome}</p>
                      {a.matricula && <p style={{ fontSize: 12, color: '#64748b' }}>Mat: {a.matricula}</p>}
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
                ))
              )}
            </div>

            {/* Encerrar link */}
            {fase === 'pronto' && (
              <button onClick={onEncerrar} disabled={encerrando} style={{
                width: '100%', padding: 13, borderRadius: 12,
                border: '1.5px solid #dc2626', background: '#fff',
                color: '#dc2626', fontSize: 14, fontWeight: 700,
                cursor: encerrando ? 'not-allowed' : 'pointer',
                marginBottom: 10,
              }}>
                {encerrando ? '⏳ Encerrando...' : '🔒 Encerrar link (ninguém mais assina)'}
              </button>
            )}
          </>
        )}

        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#b91c1c' }}>
            ❌ {erro}
          </div>
        )}

        <button onClick={onFechar} style={{
          width: '100%', padding: 13, borderRadius: 10,
          border: '1px solid #e2e8f0', background: '#f8fafc',
          color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>Fechar</button>

      </div>
    </div>
  )
}

// ── QR Code puro em SVG (sem dependência externa) ─────────────────────────────
function QRCodeSVG({ value, size = 180 }) {
  const [qrSVG, setQrSVG] = useState(null)

  useEffect(() => {
    // Usa a API do QR Server (CDN público e gratuito)
    setQrSVG(`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&format=svg&margin=2`)
  }, [value, size])

  if (!qrSVG) return <div style={{ width: size, height: size, background: '#f1f5f9', borderRadius: 8 }} />

  return (
    <img
      src={qrSVG}
      alt="QR Code"
      width={size}
      height={size}
      style={{ borderRadius: 8, display: 'block' }}
    />
  )
}

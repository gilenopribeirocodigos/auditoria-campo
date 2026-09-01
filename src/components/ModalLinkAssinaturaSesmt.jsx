import { useState, useEffect, useRef } from 'react'
import { criarTokenAssinaturaSesmt, listarAssinaturasSesmtColetadas, encerrarTokenSesmt, concluirRascunhoAcaoSesmt, atualizarParticipantesAcaoSesmt, mesclarAssinaturasColetadas } from '../lib/sesmt.js'

const BASE_URL = window.location.origin

const OPCOES_MINUTOS = [
  { label: '15 min',  value: 15 },
  { label: '30 min',  value: 30 },
  { label: '45 min',  value: 45 },
  { label: '1 hora',  value: 60 },
  { label: '2 horas', value: 120 },
  { label: '4 horas', value: 240 },
]

// Mesma UX/UI de ModalLinkAssinatura.jsx (Registros Operacionais), apontando
// pras tabelas/rota do módulo SESMT.
// modo 'ONLINE': link pra quem o fiscal já adicionou como participante,
// pra assinar remotamente.
// modo 'AUTOATENDIMENTO': QR pra imprimir/fixar no local — qualquer pessoa
// da lista carregada pode escanear e assinar sozinha, sem pré-cadastro.
// Deriva a fase inicial a partir de um token já existente (reabertura do
// modal) — sem isso, reabrir geraria um token novo a cada vez.
function faseInicialDe(tokenInicial) {
  if (!tokenInicial) return 'configurando'
  if (tokenInicial.status === 'ENCERRADO') return 'encerrado'
  if (new Date(tokenInicial.expires_at) < new Date()) return 'expirado'
  return 'pronto'
}

export default function ModalLinkAssinaturaSesmt({ acaoId, tipoLabel, modo = 'ONLINE', tokenInicial, onTokenAtualizado, participantesAtuais, onParticipantesSincronizados, onFechar }) {
  const autoatendimento = modo === 'AUTOATENDIMENTO'
  const [fase,       setFase]       = useState(() => faseInicialDe(tokenInicial))
  const [minutos,    setMinutos]    = useState(autoatendimento ? 240 : 60)
  const [tokenData,  setTokenData]  = useState(tokenInicial || null)
  const [assinadas,  setAssinadas]  = useState([])
  const [copiado,    setCopiado]    = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [erro,       setErro]       = useState('')
  const [countdown,  setCountdown]  = useState('')

  const link  = tokenData ? `${BASE_URL}/assinar-sesmt/${tokenData.token}` : ''
  const label = tipoLabel || 'Ação SESMT'

  // Mantém a lista de participantes conhecida numa ref pra poder comparar
  // dentro do polling sem precisar recriar o intervalo a cada mudança.
  const participantesRef = useRef(participantesAtuais || [])
  useEffect(() => { participantesRef.current = participantesAtuais || [] }, [participantesAtuais])

  // Busca quem já assinou e, no modo autoatendimento, mescla os novos
  // direto na lista de participantes (local + banco) — sem precisar de um
  // clique manual de "importar".
  const sincronizarAssinaturas = async (tokenAtual) => {
    const t = tokenAtual || tokenData
    if (!t) return
    const coletadas = await listarAssinaturasSesmtColetadas(t.id)
    setAssinadas(coletadas)
    if (autoatendimento && acaoId && onParticipantesSincronizados) {
      const mesclados = mesclarAssinaturasColetadas(participantesRef.current, coletadas)
      if (mesclados.length !== participantesRef.current.length) {
        try { await atualizarParticipantesAcaoSesmt(acaoId, mesclados) } catch { /* tenta de novo na próxima sincronização */ }
        onParticipantesSincronizados(mesclados)
      }
    }
  }

  // Token já existente (reabertura do modal) — busca/sincroniza assim que
  // monta, sem esperar o próximo ciclo do polling.
  useEffect(() => {
    if (tokenInicial && tokenData) sincronizarAssinaturas(tokenData)
  }, [])

  useEffect(() => {
    if (fase !== 'pronto' || !tokenData?.expires_at) return
    const tick = () => {
      const diff = new Date(tokenData.expires_at) - new Date()
      if (diff <= 0) { setCountdown('expirado'); setFase('encerrado'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [fase, tokenData])

  useEffect(() => {
    if (fase !== 'pronto' || !tokenData) return
    const id = setInterval(() => { sincronizarAssinaturas(tokenData) }, 8000)
    return () => clearInterval(id)
  }, [fase, tokenData])

  const gerarToken = async () => {
    setFase('gerando')
    setErro('')
    try {
      const data = await criarTokenAssinaturaSesmt(acaoId, minutos, modo)
      setTokenData(data)
      onTokenAtualizado?.(data)
      // A partir daqui a ação já é considerada salva/oficial (aparece no
      // Histórico), mesmo que o fiscal nunca volte pra tela de Resultado.
      if (autoatendimento && acaoId) {
        try { await concluirRascunhoAcaoSesmt(acaoId) } catch { /* ainda pode ser salva depois, ao finalizar o wizard */ }
      }
      await sincronizarAssinaturas(data)
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
    const expiracaoTexto = minutos < 60 ? `${minutos} minutos` : minutos === 60 ? '1 hora' : `${minutos / 60} horas`
    const texto = encodeURIComponent(
      `🦺 *${label}*\nDPL Construções — Equatorial Energia\n\n` +
      `Clique no link abaixo para assinar:\n${link}\n\n` +
      `⏰ Link válido por ${expiracaoTexto}`
    )
    window.open(`https://wa.me/?text=${texto}`, '_blank')
  }

  const onEncerrar = async () => {
    if (!window.confirm('Encerrar este link? Ninguém mais conseguirá assinar.')) return
    setEncerrando(true)
    try {
      await encerrarTokenSesmt(tokenData.id)
      setFase('encerrado')
      onTokenAtualizado?.({ ...tokenData, status: 'ENCERRADO' })
    } catch (e) {
      alert('Erro ao encerrar: ' + e.message)
    } finally {
      setEncerrando(false)
    }
  }

  const atualizarManual = () => sincronizarAssinaturas(tokenData)

  // Folha pronta pra imprimir e fixar no local — QR grande + instruções.
  const abrirImpressao = () => {
    const qrGrande = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(link)}&format=svg&margin=2`
    const validadeTexto = tokenData?.expires_at
      ? new Date(tokenData.expires_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : ''
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
    <title>QR de Autoatendimento — ${label}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#1e293b;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:40px;}
      .folha{text-align:center;max-width:480px;}
      h1{font-size:22px;margin-bottom:4px;}
      p.sub{font-size:13px;color:#64748b;margin-bottom:24px;}
      img{width:320px;height:320px;margin:0 auto 24px;display:block;}
      .instrucoes{font-size:15px;color:#1e293b;line-height:1.8;text-align:left;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;padding:20px 22px;}
      .instrucoes b{color:#0f766e;}
      .rodape{margin-top:20px;font-size:12px;color:#94a3b8;}
      @media print { @page { margin: 18mm; } }
    </style>
    </head><body>
      <div class="folha">
        <h1>🦺 ${label}</h1>
        <p class="sub">Assinatura de participação — DPL Construções / Equatorial Energia</p>
        <img src="${qrGrande}" alt="QR Code" />
        <div class="instrucoes">
          <b>Como assinar:</b><br/>
          1. Abra a câmera do celular e aponte para o QR Code acima<br/>
          2. Toque no link que aparecer<br/>
          3. Digite seu nome ou matrícula (o outro campo preenche sozinho)<br/>
          4. Assine na tela e pronto!
        </div>
        ${validadeTexto ? `<div class="rodape">Válido até ${validadeTexto}</div>` : ''}
      </div>
      <script>window.onload = () => setTimeout(() => window.print(), 500)</script>
    </body></html>`
    const janela = window.open('', '_blank', 'width=700,height=900')
    if (!janela) { alert('Permita pop-ups para abrir a folha de impressão.'); return }
    janela.document.write(html)
    janela.document.close()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 3000 }}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', padding: '24px 20px 40px' }}>
        <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 20px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>
              {autoatendimento ? '🖨️ QR de Autoatendimento' : '🔗 Link de Assinatura'}
            </h2>
            <p style={{ fontSize: 13, color: '#2563eb', fontWeight: 700 }}>{label}</p>
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        {autoatendimento && (
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
            🖨️ Imprima e fixe no local. <strong>Qualquer pessoa da lista carregada</strong> pode escanear e assinar sozinha, sem precisar estar pré-adicionada.
          </div>
        )}

        {fase === 'configurando' && (
          <>
            <div style={{ background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18, marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>⏰ Tempo de validade do link</p>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
                Após esse tempo o link expira automaticamente e ninguém mais consegue assinar.
              </p>

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

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>Personalizado:</label>
                <input type="number" min="5" max="480" value={minutos}
                  onChange={e => setMinutos(Math.max(5, Math.min(480, Number(e.target.value))))}
                  style={{ width: 80, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 14, fontWeight: 700, textAlign: 'center' }} />
                <span style={{ fontSize: 13, color: '#64748b' }}>minutos</span>
              </div>

              <div style={{ marginTop: 14, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
                ⚠️ O link expirará em <strong>{minutos < 60 ? `${minutos} minutos` : minutos === 60 ? '1 hora' : `${(minutos/60).toFixed(1).replace('.0','')} horas`}</strong> após ser gerado.
              </div>
            </div>

            <button onClick={gerarToken} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#2563eb', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
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

        {fase === 'gerando' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: 14, color: '#64748b' }}>⏳ Gerando link seguro...</p>
          </div>
        )}

        {(fase === 'pronto' || fase === 'encerrado') && tokenData && (
          <>
            {fase === 'encerrado' && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b91c1c', fontWeight: 700, textAlign: 'center' }}>
                🔒 Link encerrado — não aceita mais assinaturas
              </div>
            )}

            {fase === 'pronto' && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#15803d', fontWeight: 700 }}>✅ Link ativo</span>
                  <span style={{ fontSize: 13, color: countdown === 'expirado' ? '#dc2626' : '#15803d', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>⏰ {countdown}</span>
                </div>
                <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Expira em {new Date(tokenData.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )}

            <div style={{ background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, textAlign: 'center', marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 12, textTransform: 'uppercase' }}>QR Code — escaneie com o celular</p>
              <div style={{ display: 'inline-block', padding: 12, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <QRCodeSVG value={link} size={180} />
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.5 }}>Projete na tela em videochamadas<br />ou mostre o celular presencialmente</p>
            </div>

            <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 14px', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>LINK PARA COMPARTILHAR</p>
              <p style={{ fontSize: 12, color: '#1e293b', wordBreak: 'break-all', background: '#fff', borderRadius: 8, padding: '8px 10px', border: '1px solid #e2e8f0', lineHeight: 1.5, margin: 0 }}>{link}</p>
            </div>

            {fase === 'pronto' && autoatendimento && (
              <button onClick={abrirImpressao} style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: '#0f766e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
                🖨️ Abrir folha para impressão
              </button>
            )}

            {fase === 'pronto' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <button onClick={compartilharWhatsApp} style={{ padding: '12px 10px', borderRadius: 12, border: 'none', background: '#25d366', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>📤 WhatsApp</button>
                <button onClick={copiarLink} style={{ padding: '12px 10px', borderRadius: 12, border: '1.5px solid #2563eb', background: copiado ? '#eff6ff' : '#fff', color: '#2563eb', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{copiado ? '✅ Copiado!' : '📋 Copiar link'}</button>
              </div>
            )}

            <div style={{ background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#374151', margin: 0 }}>✅ Assinaturas recebidas ({assinadas.length})</p>
                {fase === 'pronto' && <button onClick={atualizarManual} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>🔄 Atualizar</button>}
              </div>
              {autoatendimento && onParticipantesSincronizados && (
                <p style={{ fontSize: 11, color: '#0f766e', margin: '0 0 12px', fontWeight: 600 }}>🔄 Sincronizado automaticamente com a lista de participantes.</p>
              )}

              {assinadas.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>Aguardando assinaturas...</p>
              ) : (
                assinadas.map((a, i) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: i < assinadas.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#15803d', margin: 0 }}>{i + 1}. {a.nome}</p>
                        {a.matricula && <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>Matrícula: {a.matricula}</p>}
                        {a.endereco_assinatura && <p style={{ fontSize: 11, color: '#2563eb', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>📍 {a.endereco_assinatura}</p>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {a.assinatura_url && <img src={a.assinatura_url} alt="assinatura" style={{ height: 32, maxWidth: 80, objectFit: 'contain', borderRadius: 4, background: '#fafafa', border: '1px solid #e2e8f0' }} />}
                        <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{new Date(a.assinado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {fase === 'pronto' && (
              <button onClick={onEncerrar} disabled={encerrando} style={{
                width: '100%', padding: 13, borderRadius: 12, border: '1.5px solid #dc2626', background: '#fff',
                color: '#dc2626', fontSize: 14, fontWeight: 700, cursor: encerrando ? 'not-allowed' : 'pointer', marginBottom: 10,
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

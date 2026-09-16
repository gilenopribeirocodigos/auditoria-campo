import { useState, useEffect, useRef } from 'react'
import { TIPOS_ACAO_SESMT } from '../../data/sesmt_config.js'
import { salvarAcaoSesmt, atualizarAcaoSesmt, atualizarParticipantesAcaoSesmt, atualizarFotosAcaoSesmt, prepararPayloadSesmt, listarAssinaturasSesmtColetadas, mesclarAssinaturasColetadas } from '../../lib/sesmt.js'
import { uploadBase64 } from '../../lib/supabase.js'
import { adicionarWatermark } from './SS2Evidencias.jsx'
import ModalLinkAssinaturaSesmt from '../../components/ModalLinkAssinaturaSesmt.jsx'

// Depois de "Salvar Ação", o mesmo fiscal ainda pode completar o registro
// fotográfico por um tempo limitado — mesmo padrão (janela com contagem
// regressiva) já usado no link de assinatura remota (criarTokenAssinaturaSesmt).
// Aqui não precisa de token/link próprio: usa o `criado_em` que a própria
// ação já ganha ao ser salva (timestamptz default now() na tabela) como
// início da janela, e confere a matrícula de quem está logado contra a
// matrícula do fiscal que salvou — só ele enxerga o botão de adicionar.
const JANELA_FOTOS_MS = 60 * 60 * 1000
const MAX_FOTOS_TOTAL = 5

function formatarRestante(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export default function SS4Resultado({ form, usuarioLogado, onConcluir, prev }) {
  const [status,     setStatus]     = useState('idle') // idle | saving | saved | error
  const [erro,       setErro]       = useState('')
  const [acaoSalva,  setAcaoSalva]  = useState(null)
  const [mostrarModal, setMostrarModal] = useState(false)
  const [mostrarQrAuto, setMostrarQrAuto] = useState(false)
  const [tokenOnline, setTokenOnline] = useState(null)
  const [tokenQr,    setTokenQr]    = useState(form.tokenAutoatendimento || null)
  const [atualizandoAssin, setAtualizandoAssin] = useState(false)
  // Cópia local dos participantes pra poder ir incorporando novas
  // assinaturas coletadas pelo QR mesmo depois de já ter salvo a ação.
  const [participantesAtuais, setParticipantesAtuais] = useState(form.participantes)

  // Cópia local das fotos — começa com as do formulário e recebe as
  // incluídas depois de salvar (ver janela de tempo abaixo).
  const [fotosAtuais,   setFotosAtuais]   = useState(form.fotos)
  const [agora,         setAgora]         = useState(Date.now())
  const [mostrarAddFoto, setMostrarAddFoto] = useState(false)
  const [enviandoFoto,  setEnviandoFoto]  = useState(false)
  const cameraFotoRef  = useRef(null)
  const galeriaFotoRef = useRef(null)

  const tipoConfig = TIPOS_ACAO_SESMT[form.tipo]
  const pendentesOnline = participantesAtuais.filter(p => p.modo === 'online' && !p.assinatura && !p.assinatura_url).length

  // Relógio vivo só enquanto a janela pode estar valendo — sem isso o
  // contador ficaria parado até a próxima re-renderização por outro motivo.
  useEffect(() => {
    if (status !== 'saved' || !acaoSalva) return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [status, acaoSalva])

  const criadoEmMs  = acaoSalva?.criado_em ? new Date(acaoSalva.criado_em).getTime() : null
  const restanteMs  = criadoEmMs != null ? JANELA_FOTOS_MS - (agora - criadoEmMs) : 0
  const mesmoUsuario = !!usuarioLogado?.matricula && usuarioLogado.matricula === acaoSalva?.matricula_fiscal
  const janelaFotosAtiva = status === 'saved' && mesmoUsuario && restanteMs > 0

  const adicionarFotosPosSalvar = async (files) => {
    const disponiveis = MAX_FOTOS_TOTAL - fotosAtuais.length
    if (disponiveis <= 0 || !acaoSalva) return
    setEnviandoFoto(true)
    try {
      const selecionadas = Array.from(files || []).slice(0, disponiveis)
      const novasUrls = []
      for (const file of selecionadas) {
        const base64 = await new Promise(res => {
          const reader = new FileReader()
          reader.onload = ev => res(ev.target.result)
          reader.readAsDataURL(file)
        })
        const comMarca = await adicionarWatermark(base64, form)
        const url = await uploadBase64(comMarca, `sesmt/${acaoSalva.id}/foto_extra_${Date.now()}.jpg`, 'fotos-auditoria')
        novasUrls.push(url)
      }
      const fotosUrlsAtuais = fotosAtuais.map(f => f.url)
      const fotosUrlsNovas  = [...fotosUrlsAtuais, ...novasUrls]
      const atualizada = await atualizarFotosAcaoSesmt(acaoSalva.id, fotosUrlsNovas)
      setAcaoSalva(atualizada)
      setFotosAtuais(fotosUrlsNovas.map(url => ({ url })))
      setMostrarAddFoto(false)
    } catch (e) {
      alert('Erro ao adicionar foto: ' + (e.message || e))
    } finally {
      setEnviandoFoto(false)
    }
  }
  const onCameraFoto  = async (e) => { await adicionarFotosPosSalvar(e.target.files); e.target.value = '' }
  const onGaleriaFoto = async (e) => { await adicionarFotosPosSalvar(e.target.files); e.target.value = '' }

  const salvar = async () => {
    setStatus('saving')
    setErro('')
    try {
      const payload = await prepararPayloadSesmt(form)
      // Se um QR de autoatendimento já criou a ação como rascunho, finaliza
      // (atualiza) em vez de inserir de novo.
      const saved = form.acaoRascunhoId
        ? await atualizarAcaoSesmt(form.acaoRascunhoId, payload)
        : await salvarAcaoSesmt(payload)
      setAcaoSalva(saved)
      setStatus('saved')
    } catch (err) {
      console.error('Erro ao salvar ação SESMT:', err)
      setErro(err.message || 'Erro ao salvar. Verifique a conexão.')
      setStatus('error')
    }
  }

  // Traz assinaturas coletadas via QR direto do banco, sem precisar abrir o
  // modal — o QR/token continua valendo até expirar (mesmo antes de "Salvar
  // Ação" ser clicado, já que gerar o QR já deixa a ação registrada).
  const atualizarAssinaturasAgora = async () => {
    if (!tokenQr) return
    setAtualizandoAssin(true)
    try {
      const coletadas = await listarAssinaturasSesmtColetadas(tokenQr.id)
      const mesclados = mesclarAssinaturasColetadas(participantesAtuais, coletadas)
      if (mesclados !== participantesAtuais) {
        setParticipantesAtuais(mesclados)
        const acaoIdAtual = acaoSalva?.id || form.acaoRascunhoId
        if (acaoIdAtual) await atualizarParticipantesAcaoSesmt(acaoIdAtual, mesclados)
      }
    } catch (e) {
      alert('Erro ao atualizar assinaturas: ' + e.message)
    } finally {
      setAtualizandoAssin(false)
    }
  }

  return (
    <>
      <div style={{ padding: '0 0 40px' }}>
        <div style={{ background: tipoConfig?.bg, border: `2px solid ${tipoConfig?.border}`, borderRadius: 16, padding: 20, textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{tipoConfig?.emoji}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: tipoConfig?.color, marginBottom: 4 }}>{tipoConfig?.label}</div>
          <div style={{ fontSize: 13, color: tipoConfig?.color, opacity: 0.85 }}>{participantesAtuais.length} participante(s)</div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Resumo</p>
          {[
            ['Usuário', form.fiscal],
            ['Data/Hora', `${form.data} às ${form.hora}`],
            ['Local', form.endereco || (form.lat ? `${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}` : null)],
            ['Tema', form.tema],
            ['Motivo', form.motivo],
            ['Fotos', form.fotos.length > 0 ? `${form.fotos.length} foto(s)` : null],
          ].filter(([, v]) => v).map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
              <span style={{ color: '#94a3b8', fontWeight: 500 }}>{l}</span>
              <span style={{ color: '#1e293b', fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>

        {form.observacao && (
          <div className="card" style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>OBSERVAÇÃO:</p>
            <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{form.observacao}</p>
          </div>
        )}

        {participantesAtuais?.length > 0 && (
          <div className="card" style={{ marginBottom: 14, background: '#f0fdf4', border: '1.5px solid #86efac' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#15803d', margin: 0 }}>✅ Participantes ({participantesAtuais.length})</p>
              {tokenQr && (
                <button onClick={atualizarAssinaturasAgora} disabled={atualizandoAssin} style={{ fontSize: 12, color: '#0f766e', background: 'none', border: 'none', cursor: atualizandoAssin ? 'default' : 'pointer', fontWeight: 700 }}>
                  {atualizandoAssin ? '⏳ Atualizando...' : '🔄 Atualizar'}
                </button>
              )}
            </div>
            {participantesAtuais.map((p, i) => {
              const assinado = Boolean(p.assinatura || p.assinatura_url)
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < participantesAtuais.length - 1 ? '1px solid #bbf7d0' : 'none' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: assinado ? '#15803d' : '#1d4ed8', margin: 0 }}>{i + 1}. {p.nome}</p>
                    {p.chapa && <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Matrícula: {p.chapa}</span>}
                  </div>
                  {assinado
                    ? <img src={p.assinatura || p.assinatura_url} alt="assinatura" style={{ height: 36, maxWidth: 90, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0' }} />
                    : <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', border: '1px solid #93c5fd', padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>🔗 Aguardando</span>}
                </div>
              )
            })}
          </div>
        )}

        {fotosAtuais?.length > 0 && (
          <div className="card" style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 10 }}>📷 FOTOS ({fotosAtuais.length})</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {fotosAtuais.map((f, i) => (
                <img key={i} src={f.url} alt={`Foto ${i+1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block', border: '1px solid #e2e8f0' }} />
              ))}
            </div>
          </div>
        )}

        {status === 'idle' && (
          <>
            <button onClick={salvar} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#1e3a5f', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              💾 Salvar Ação
            </button>
            <button onClick={prev} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Voltar e editar</button>
          </>
        )}

        {status === 'saving' && (
          <button disabled style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#64748b', color: '#fff', fontSize: 16, fontWeight: 700 }}>⏳ Salvando...</button>
        )}

        {status === 'error' && (
          <>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 10, fontSize: 13, color: '#b91c1c' }}>❌ {erro}</div>
            <button onClick={salvar} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#dc2626', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>🔄 Tentar novamente</button>
            <button onClick={prev} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Voltar</button>
          </>
        )}

        {status === 'saved' && (
          <>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '14px 16px', marginBottom: 14, textAlign: 'center' }}>
              <p style={{ color: '#15803d', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>✅ Ação salva com sucesso!</p>
              <p style={{ color: '#64748b', fontSize: 12 }}>Dados, fotos e assinaturas enviados ao banco.</p>
            </div>

            {janelaFotosAtiva && fotosAtuais.length < MAX_FOTOS_TOTAL && (
              <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>⏱️</span>
                  <span style={{ color: '#92400e', fontWeight: 800, fontSize: 14 }}>Você pode adicionar mais fotos por {formatarRestante(restanteMs)}</span>
                </div>

                {!mostrarAddFoto ? (
                  <button onClick={() => setMostrarAddFoto(true)} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                    ➕ Adicionar Fotos
                  </button>
                ) : (
                  <div style={{ marginBottom: 8 }}>
                    <input ref={cameraFotoRef} type="file" accept="image/*" capture="environment" onChange={onCameraFoto} style={{ display: 'none' }} />
                    <input ref={galeriaFotoRef} type="file" accept="image/*" multiple onChange={onGaleriaFoto} style={{ display: 'none' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button onClick={() => cameraFotoRef.current?.click()} disabled={enviandoFoto} style={{ padding: '14px 10px', borderRadius: 10, border: '2px dashed #7c3aed', background: '#f5f3ff', cursor: enviandoFoto ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: enviandoFoto ? 0.6 : 1 }}>
                        <span style={{ fontSize: 22 }}>📷</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6' }}>{enviandoFoto ? 'Enviando...' : 'Tirar foto'}</span>
                      </button>
                      <button onClick={() => galeriaFotoRef.current?.click()} disabled={enviandoFoto} style={{ padding: '14px 10px', borderRadius: 10, border: '2px dashed #7c3aed', background: '#f5f3ff', cursor: enviandoFoto ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: enviandoFoto ? 0.6 : 1 }}>
                        <span style={{ fontSize: 22 }}>🖼️</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6' }}>{enviandoFoto ? 'Enviando...' : 'Da galeria'}</span>
                      </button>
                    </div>
                  </div>
                )}

                <p style={{ color: '#92400e', fontSize: 11, lineHeight: 1.5, margin: 0 }}>
                  Só você ({form.fiscal}) pode adicionar fotos, e só até o tempo acabar.
                </p>
              </div>
            )}

            {(pendentesOnline > 0 || tokenOnline) && (
              <button onClick={() => setMostrarModal(true)} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#0f766e', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
                {tokenOnline
                  ? '🔗 Ver Link de Assinatura'
                  : `🔗 Gerar Link + QR Code para Assinatura (${pendentesOnline} pendente${pendentesOnline > 1 ? 's' : ''})`}
              </button>
            )}

            {tokenQr && (
              <button onClick={() => setMostrarQrAuto(true)} style={{ width: '100%', padding: 14, borderRadius: 12, border: '1.5px solid #0f766e', background: '#fff', color: '#0f766e', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
                🖨️ Ver QR de Autoatendimento
              </button>
            )}

            <button onClick={onConcluir} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#15803d', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              + Nova Ação
            </button>
          </>
        )}
      </div>

      {mostrarModal && acaoSalva && (
        <ModalLinkAssinaturaSesmt
          acaoId={acaoSalva.id}
          tipoLabel={tipoConfig?.label}
          tokenInicial={tokenOnline}
          onTokenAtualizado={setTokenOnline}
          participantesAtuais={participantesAtuais}
          onParticipantesSincronizados={setParticipantesAtuais}
          onFechar={() => setMostrarModal(false)}
        />
      )}

      {mostrarQrAuto && acaoSalva && (
        <ModalLinkAssinaturaSesmt
          acaoId={acaoSalva.id}
          tipoLabel={tipoConfig?.label}
          modo="AUTOATENDIMENTO"
          tokenInicial={tokenQr}
          onTokenAtualizado={setTokenQr}
          participantesAtuais={participantesAtuais}
          onParticipantesSincronizados={setParticipantesAtuais}
          onFechar={() => setMostrarQrAuto(false)}
        />
      )}
    </>
  )
}

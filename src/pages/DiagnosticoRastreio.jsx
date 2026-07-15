import { useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { obterDiagnosticoRastreio, sincronizarRastreioAgora } from '../lib/rastreio.js'

// ════════════════════════════════════════════════════════════════════════════
// DiagnosticoRastreio — painel simples pra o próprio fiscal (ou quem estiver
// com o celular na mão) checar, ali na hora, por que o rastreio pode não
// estar aparecendo no mapa "Fiscais em Campo". Só faz sentido no app Android
// nativo — no navegador/PWA não existe serviço nativo pra diagnosticar.
// ════════════════════════════════════════════════════════════════════════════

const ESTADO_LABEL = {
  granted:  { texto: 'Concedida',       cor: '#059669' },
  denied:   { texto: 'Negada',          cor: '#dc2626' },
  prompt:   { texto: 'Não perguntada',  cor: '#d97706' },
  'prompt-with-rationale': { texto: 'Não perguntada', cor: '#d97706' },
}

function linhaEstado(label, valor) {
  const info = ESTADO_LABEL[valor] || { texto: valor ?? '—', cor: '#64748b' }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: 13.5, color: '#334155' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: info.cor }}>{info.texto}</span>
    </div>
  )
}

function linhaBooleana(label, valor, corTrue = '#059669', corFalse = '#dc2626') {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: 13.5, color: '#334155' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: valor ? corTrue : corFalse }}>{valor ? 'Sim' : 'Não'}</span>
    </div>
  )
}

function formatarQuandoFoi(ms) {
  if (!ms) return 'nunca'
  const diffSeg = Math.round((Date.now() - ms) / 1000)
  if (diffSeg < 5) return 'agora mesmo'
  if (diffSeg < 60) return `há ${diffSeg}s`
  if (diffSeg < 3600) return `há ${Math.round(diffSeg / 60)}min`
  return `há ${Math.round(diffSeg / 3600)}h (${new Date(ms).toLocaleTimeString('pt-BR')})`
}

export default function DiagnosticoRastreio({ onVoltar }) {
  const [diag, setDiag] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const nativo = Capacitor.isNativePlatform()

  const carregar = useCallback(async () => {
    if (!nativo) { setCarregando(false); return }
    const d = await obterDiagnosticoRastreio()
    setDiag(d)
    setCarregando(false)
  }, [nativo])

  useEffect(() => {
    carregar()
    const id = setInterval(carregar, 5000)
    return () => clearInterval(id)
  }, [carregar])

  const sincronizar = async () => {
    setSincronizando(true)
    await sincronizarRastreioAgora()
    setTimeout(async () => { await carregar(); setSincronizando(false) }, 1500)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ background: 'linear-gradient(135deg, #059669, #065f46)', padding: '14px 20px', color: '#fff' }}>
        <button onClick={onVoltar} style={{
          background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff',
          padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 10,
        }}>← Voltar para Home</button>
        <div style={{ fontSize: 19, fontWeight: 800 }}>📡 Diagnóstico de Rastreio</div>
        <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>
          Confere se a localização em segundo plano está realmente sendo capturada e enviada neste aparelho.
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: 18 }}>
        {!nativo && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 16, fontSize: 13.5, color: '#9a3412' }}>
            Esse diagnóstico só existe no app Android instalado — no navegador não há um serviço nativo de rastreio pra inspecionar.
          </div>
        )}

        {nativo && carregando && (
          <div style={{ textAlign: 'center', padding: 30, color: '#64748b', fontSize: 13.5 }}>Carregando diagnóstico...</div>
        )}

        {nativo && !carregando && !diag && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 16, fontSize: 13.5, color: '#991b1b' }}>
            Não foi possível ler o diagnóstico nativo — o serviço de rastreio pode não estar rodando. Tente fechar e reabrir o app.
          </div>
        )}

        {nativo && diag && (
          <>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '4px 16px', marginBottom: 14 }}>
              {linhaBooleana('Serviço nativo rodando', diag.servicoRodando)}
              {linhaBooleana('Configurado (login recente)', diag.configurado)}
              {linhaBooleana('Sessão nativa válida', diag.sessaoValida)}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                <span style={{ fontSize: 13.5, color: '#334155' }}>Modo de captura</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>
                  {diag.watchersAtivos > 0 ? 'Normal (app aberto)' : diag.modoAutonomo ? 'Autônomo (sem app aberto)' : 'Parado'}
                </span>
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '4px 16px', marginBottom: 14 }}>
              {linhaEstado('Permissão de localização', diag.permissaoLocalizacao)}
              {linhaEstado('Localização em segundo plano', diag.permissaoBackgroundLocalizacao)}
              {linhaEstado('Permissão de notificação', diag.permissaoNotificacao)}
              {linhaBooleana('Economia de bateria (Android) ignorada', diag.otimizacaoBateriaIgnorada)}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '4px 16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 13.5, color: '#334155' }}>Último ponto capturado</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{formatarQuandoFoi(diag.ultimaCapturaEm)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 13.5, color: '#334155' }}>Último ponto enviado ao banco</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{formatarQuandoFoi(diag.ultimoEnvioSucessoEm)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: diag.ultimoErro ? '1px solid #e2e8f0' : 'none' }}>
                <span style={{ fontSize: 13.5, color: '#334155' }}>Pontos pendentes na fila</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: diag.pontosPendentes > 0 ? '#d97706' : '#059669' }}>{diag.pontosPendentes ?? 0}</span>
              </div>
              {diag.ultimoErro && (
                <div style={{ padding: '10px 0', fontSize: 12.5, color: '#dc2626' }}>
                  <b>Último erro:</b> {diag.ultimoErro}
                </div>
              )}
            </div>

            <button onClick={sincronizar} disabled={sincronizando} style={{
              width: '100%', background: sincronizando ? '#64748b' : '#2563eb', color: '#fff', border: 'none',
              padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer',
            }}>
              {sincronizando ? '⏳ Sincronizando...' : '🔄 Sincronizar agora'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

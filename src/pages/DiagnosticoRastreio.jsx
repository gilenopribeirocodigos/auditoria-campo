import { useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { obterDiagnosticoRastreio, sincronizarRastreioAgora, limparFilaRastreio, testarGpsAgora } from '../lib/rastreio.js'
import { getVersaoApp } from '../lib/auth.js'

// ════════════════════════════════════════════════════════════════════════════
// DiagnosticoRastreio — painel simples pra o próprio fiscal (ou quem estiver
// com o celular na mão) checar, ali na hora, se o rastreio em segundo plano
// está realmente ativo. Só faz sentido no app Android nativo — no navegador
// não existe SDK nativo pra diagnosticar.
// ════════════════════════════════════════════════════════════════════════════

const TRACKING_MODE_LABEL = { 1: 'Localização', 2: 'Geofence apenas' }

function linhaBooleana(label, valor, corTrue = '#059669', corFalse = '#dc2626') {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: 13.5, color: '#334155' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: valor ? corTrue : corFalse }}>{valor ? 'Sim' : 'Não'}</span>
    </div>
  )
}

function linhaTexto(label, valor, borda = true) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: borda ? '1px solid #e2e8f0' : 'none' }}>
      <span style={{ fontSize: 13.5, color: '#334155' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{valor}</span>
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
  const [limpando, setLimpando] = useState(false)
  const [testandoGps, setTestandoGps] = useState(false)
  const [resultadoGps, setResultadoGps] = useState(null)
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

  const limparFila = async () => {
    setLimpando(true)
    await limparFilaRastreio()
    setTimeout(async () => { await carregar(); setLimpando(false) }, 1000)
  }

  const testarGps = async () => {
    setTestandoGps(true)
    setResultadoGps(null)
    const r = await testarGpsAgora()
    setResultadoGps(r)
    setTestandoGps(false)
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
        <div style={{ fontSize: 11.5, opacity: 0.75, marginTop: 6 }}>Versão do app: {getVersaoApp()}</div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: 18 }}>
        {!nativo && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 16, fontSize: 13.5, color: '#9a3412' }}>
            Esse diagnóstico só existe no app Android instalado — no navegador não há um SDK nativo de rastreio pra inspecionar.
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
            {diag.erroInicializacao && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 16, marginBottom: 14, fontSize: 12.5, color: '#991b1b' }}>
                <b>Falha ao iniciar o SDK nativo:</b> {diag.erroInicializacao}
              </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '4px 16px', marginBottom: 14 }}>
              {linhaBooleana('Serviço nativo rodando', diag.servicoRodando)}
              {linhaTexto('Modo de rastreio', TRACKING_MODE_LABEL[diag.trackingMode] || '—')}
              {linhaTexto('Status da permissão de localização', String(diag.statusPermissao ?? '—'))}
              {linhaBooleana('Voltou sozinho após reiniciar o celular', diag.voltouDeReiniciar, '#2563eb', '#64748b')}
              {linhaTexto('Distância percorrida (odômetro)', diag.odometroKm != null ? `${diag.odometroKm.toFixed(2)} km` : '—', false)}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '4px 16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 13.5, color: '#334155' }}>Última captura local (GPS)</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{formatarQuandoFoi(diag.ultimaCapturaLocalEm)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 13.5, color: '#334155' }}>Heartbeats recebidos (parado)</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{diag.heartbeats ?? 0}</span>
              </div>
              {diag.erroCaptura && (
                <div style={{ padding: '10px 0', fontSize: 12.5, color: '#dc2626', borderBottom: '1px solid #e2e8f0' }}>
                  <b>Erro na captura local:</b> {diag.erroCaptura}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 13.5, color: '#334155' }}>Último ponto enviado ao banco</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{formatarQuandoFoi(diag.ultimoEnvioSucessoEm)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: diag.ultimoErro ? '1px solid #e2e8f0' : 'none' }}>
                <span style={{ fontSize: 13.5, color: '#334155' }}>Pontos pendentes na fila (SQLite nativo)</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: diag.pontosPendentes > 0 ? '#d97706' : '#059669' }}>{diag.pontosPendentes ?? 0}</span>
              </div>
              {diag.ultimoErro && (
                <div style={{ padding: '10px 0', fontSize: 12.5, color: '#dc2626' }}>
                  <b>Último erro de envio:</b> {diag.ultimoErro}
                </div>
              )}
            </div>

            <button onClick={sincronizar} disabled={sincronizando} style={{
              width: '100%', background: sincronizando ? '#64748b' : '#2563eb', color: '#fff', border: 'none',
              padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer', marginBottom: 10,
            }}>
              {sincronizando ? '⏳ Sincronizando...' : '🔄 Sincronizar agora'}
            </button>

            <button onClick={testarGps} disabled={testandoGps} style={{
              width: '100%', background: testandoGps ? '#64748b' : '#7c3aed', color: '#fff', border: 'none',
              padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer', marginBottom: 10,
            }}>
              {testandoGps ? '📡 Pedindo posição ao GPS...' : '🛰️ Testar GPS agora'}
            </button>

            {resultadoGps && (
              <div style={{
                background: resultadoGps.erro ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${resultadoGps.erro ? '#fecaca' : '#bbf7d0'}`,
                borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 12.5,
                color: resultadoGps.erro ? '#991b1b' : '#166534',
              }}>
                {resultadoGps.erro ? (
                  <><b>Falha ao obter posição:</b> {resultadoGps.erro}</>
                ) : (
                  <>
                    <b>Posição obtida:</b> {resultadoGps.lat?.toFixed(6)}, {resultadoGps.lng?.toFixed(6)}
                    {' '}(±{resultadoGps.precisao != null ? Math.round(resultadoGps.precisao) : '?'}m)
                  </>
                )}
              </div>
            )}

            {diag.pontosPendentes > 0 && (
              <button onClick={limparFila} disabled={limpando} style={{
                width: '100%', background: '#fff', color: '#dc2626', border: '1px solid #fecaca',
                padding: '12px', borderRadius: 12, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
              }}>
                {limpando ? '⏳ Limpando...' : '🗑️ Descartar pontos pendentes (fila presa)'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

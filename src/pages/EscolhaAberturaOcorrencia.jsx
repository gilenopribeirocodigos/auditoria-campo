// ── pages/EscolhaAberturaOcorrencia.jsx ─────────────────────────────────────
// Telinha intermediária entre o card "Abertura de Ocorrência" (R0TipoRegistro)
// e o formulário de verdade: deixa escolher abrir uma Ocorrência manual (fluxo
// de sempre) ou importar várias de uma vez a partir de planilha (TOA). A
// opção de lote só aparece pra quem tem a permissão 'importar_ocorrencias_lote'
// — sem ela, o ideal é nem mostrar essa escolha (ver RegistrosApp.jsx).
import { temPermissao } from '../lib/auth.js'

export default function EscolhaAberturaOcorrencia({ usuarioLogado, onManual, onLote, onHome }) {
  const podeImportarLote = temPermissao(usuarioLogado, 'importar_ocorrencias_lote')

  return (
    <div className="app-shell">
      <header className="app-header no-print" style={{ background: '#4338ca' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Plataforma de Gestão Operacional
          </div>
          <button onClick={onHome} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          }}>🏠 Home</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>📦 Abertura de Ocorrência</div>
        <p style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Como você quer abrir?</p>
      </header>

      <main className="app-content">
        <div style={{ padding: '0 0 80px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={onManual} style={{
            background: '#fff', border: '2px solid #c7d2fe', borderRadius: 14,
            padding: 16, textAlign: 'left', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: '#eef2ff', border: '1.5px solid #c7d2fe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, flexShrink: 0,
            }}>📝</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#4338ca', marginBottom: 2 }}>Abrir Manual</p>
              <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                Uma ocorrência de cada vez — formulário atual
              </p>
            </div>
            <div style={{ fontSize: 18, color: '#4338ca' }}>›</div>
          </button>

          {podeImportarLote && (
            <button onClick={onLote} style={{
              background: '#4338ca0d', border: '2px solid #4338ca', borderRadius: 14,
              padding: 16, textAlign: 'left', cursor: 'pointer', position: 'relative',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <span style={{
                position: 'absolute', top: -9, right: 12, background: '#4338ca', color: '#fff',
                fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 20, letterSpacing: 0.3,
              }}>NOVO</span>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: '#eef2ff', border: '1.5px solid #c7d2fe',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>📥</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#4338ca', marginBottom: 2 }}>Abrir em Lote (planilha)</p>
                <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                  Importa várias de uma vez a partir da planilha do TOA
                </p>
              </div>
              <div style={{ fontSize: 18, color: '#4338ca' }}>›</div>
            </button>
          )}
        </div>
      </main>
    </div>
  )
}

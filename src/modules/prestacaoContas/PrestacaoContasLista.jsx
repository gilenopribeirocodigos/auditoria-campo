import { useEffect, useState } from 'react'
import { CarregandoHexagono } from '../../components/Shared.jsx'
import { listarMinhasPrestacoes } from './lib/prestacaoContas.js'

const STATUS_BADGE = {
  RASCUNHO:  { bg: '#e2e8f0', color: '#475569', label: '📝 Rascunho' },
  ENVIADO:   { bg: '#dbeafe', color: '#1d4ed8', label: '📤 Enviado' },
  APROVADO:  { bg: '#dcfce7', color: '#15803d', label: '✅ Aprovado' },
  REJEITADO: { bg: '#fee2e2', color: '#b91c1c', label: '↩️ Rejeitado' },
}

export default function PrestacaoContasLista({ usuarioLogado, onVoltar, onNova }) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [prestacoes, setPrestacoes] = useState([])

  useEffect(() => {
    (async () => {
      try {
        const dados = await listarMinhasPrestacoes(usuarioLogado.id)
        setPrestacoes(dados)
      } catch (e) {
        setErro(e.message || 'Erro ao carregar prestações de contas.')
      } finally {
        setCarregando(false)
      }
    })()
  }, [usuarioLogado.id])

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Plataforma de Gestão Operacional
          </div>
          <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>🏠 Home</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>💰 Prestação de Contas</div>
      </header>

      <main className="app-content">
        <p style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Minhas Prestações
        </p>

        {carregando ? (
          <CarregandoHexagono texto="Carregando..." />
        ) : erro ? (
          <p style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ {erro}</p>
        ) : prestacoes.length === 0 ? (
          <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '28px 16px', textAlign: 'center', marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Você ainda não enviou nenhuma prestação de contas.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {prestacoes.map(p => {
              const badge = STATUS_BADGE[p.status] || STATUS_BADGE.RASCUNHO
              return (
                <div key={p.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{p.numero_pc}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: badge.bg, color: badge.color }}>{badge.label}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b' }}>
                    {p.total_itens} {p.total_itens === 1 ? 'item' : 'itens'} · R$ {p.valor_total.toFixed(2).replace('.', ',')}
                    {p.rodada > 1 && ` · ${p.rodada}ª tentativa`}
                  </p>
                  {p.status === 'REJEITADO' && p.motivo_rejeicao && (
                    <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>Motivo: "{p.motivo_rejeicao}"</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button onClick={onNova} style={{
          width: '100%', padding: 16, borderRadius: 14, border: 'none',
          background: 'linear-gradient(135deg, rgba(245,158,11,0.95), rgba(217,119,6,0.95))',
          color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
        }}>＋ Nova Prestação de Contas</button>
      </main>
    </div>
  )
}

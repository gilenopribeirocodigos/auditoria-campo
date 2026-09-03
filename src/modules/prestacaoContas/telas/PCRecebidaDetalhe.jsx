import { useEffect, useState } from 'react'
import PCHistorico from './PCHistorico.jsx'
import PCItensComFotos from './PCItensComFotos.jsx'
import { buscarDuplicatasPotenciais } from '../lib/prestacaoContas.js'

export default function PCRecebidaDetalhe({ prestacao, remetenteNome, onAprovar, onRejeitar, onVoltar, processando }) {
  const [rejeitando, setRejeitando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [duplicatas, setDuplicatas] = useState([])

  const itens = prestacao.pc_itens || []
  const total = itens.reduce((soma, i) => soma + Number(i.valor || 0), 0)
  const podeDecidir = prestacao.status === 'ENVIADO'

  // Alerta pra quem analisa: mesmo solicitante já tem outra prestação com o
  // mesmo valor e a mesma data de emissão — vale olhar com mais cautela
  // antes de aprovar (e rejeitar, se identificar erro).
  useEffect(() => {
    (async () => {
      const encontradas = []
      for (const item of itens) {
        try {
          const achadas = await buscarDuplicatasPotenciais(prestacao.remetente_id, item.valor, item.data_emissao, prestacao.id)
          for (const p of achadas) if (!encontradas.some(e => e.id === p.id)) encontradas.push(p)
        } catch { /* se a checagem falhar, só não mostra o alerta */ }
      }
      setDuplicatas(encontradas)
    })()
  }, [prestacao.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ padding: '0 0 24px' }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>
        {prestacao.numero_pc}
      </h2>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
        De: {remetenteNome || '—'} {prestacao.rodada > 1 && `· ${prestacao.rodada}ª tentativa`}
      </p>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>
        {itens.length} {itens.length === 1 ? 'item' : 'itens'} · Total: R$ {total.toFixed(2).replace('.', ',')}
      </p>

      <div style={{ marginBottom: 18 }}>
        <PCItensComFotos itens={itens} />
      </div>

      {duplicatas.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <p style={{ fontSize: 12.5, color: '#92400e', fontWeight: 700, marginBottom: 4 }}>
            ⚠️ Possível prestação de contas duplicada
          </p>
          <p style={{ fontSize: 12, color: '#92400e' }}>
            {remetenteNome || 'Este solicitante'} já possui {duplicatas.length === 1 ? 'outra prestação de contas' : `outras ${duplicatas.length} prestações de contas`} com o mesmo valor e a mesma data de emissão
            {duplicatas.length === 1 ? ` (${duplicatas[0].numero_pc})` : `: ${duplicatas.map(d => d.numero_pc).join(', ')}`}.
            Revise com atenção antes de aprovar — se identificar erro, você pode rejeitar.
          </p>
        </div>
      )}

      {prestacao.status === 'APROVADO' && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: '#15803d' }}>
            ✅ Aprovada. Para baixar Excel/fotos, use a tela <strong>✅ Aprovadas</strong> (consolida todas as prestações aprovadas de uma vez).
          </p>
        </div>
      )}

      {prestacao.status === 'FECHADA' && (
        <div style={{ background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: '#6d28d9' }}>
            ✔️ Prestação de conta já realizada — faz parte de um fechamento de período. Consulte a tela <strong>🔒 Fechamentos</strong> pra reexportar, se precisar.
          </p>
        </div>
      )}

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          🕐 Histórico desta prestação
        </p>
        <PCHistorico prestacaoId={prestacao.id} />
      </div>

      {podeDecidir && !rejeitando && (
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button onClick={() => setRejeitando(true)} disabled={processando} style={{
            flex: 1, padding: 14, borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>↩️ Rejeitar</button>
          <button onClick={onAprovar} disabled={processando} style={{
            flex: 1, padding: 14, borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #059669, #047857)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>{processando ? '⏳...' : '✅ Aprovar e Pagar'}</button>
        </div>
      )}

      {rejeitando && (
        <div style={{ marginTop: 10 }}>
          <label className="form-label">Motivo da rejeição *</label>
          <textarea
            className="form-textarea" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Ex.: foto do item 3 ilegível, favor reenviar"
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button onClick={() => setRejeitando(false)} disabled={processando} style={{
              flex: 1, padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc',
              color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>Cancelar</button>
            <button onClick={() => onRejeitar(motivo)} disabled={processando || !motivo.trim()} style={{
              flex: 1, padding: 13, borderRadius: 10, border: 'none',
              background: motivo.trim() ? '#dc2626' : '#e2e8f0', color: motivo.trim() ? '#fff' : '#94a3b8',
              fontSize: 14, fontWeight: 700, cursor: motivo.trim() ? 'pointer' : 'not-allowed',
            }}>{processando ? '⏳...' : 'Confirmar Rejeição'}</button>
          </div>
        </div>
      )}

      <button onClick={onVoltar} disabled={processando} style={{
        width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0',
        background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 18,
      }}>← Voltar à lista</button>
    </div>
  )
}

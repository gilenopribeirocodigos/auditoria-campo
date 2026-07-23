import { useEffect, useState } from 'react'
import { buscarDuplicatasPotenciais } from '../lib/prestacaoContas.js'

export default function PCRevisaoEnvio({
  itens, destinatarios, destinatarioId, onMudarDestinatario, onEnviar, onVoltar, enviando,
  ehReenvio, observacaoCorrecao, onMudarObservacaoCorrecao, remetenteId, prestacaoId,
}) {
  const total = itens.reduce((soma, i) => soma + Number(i.valor || 0), 0)
  const itensSemFoto = itens.filter(i => !(i.pc_fotos?.length > 0))
  const [duplicatas, setDuplicatas] = useState([])
  const [cienteDuplicata, setCienteDuplicata] = useState(false)

  // Alerta de possível nota duplicada: mesmo solicitante já lançou outra
  // prestação com o mesmo valor e a mesma data de emissão (regra de negócio
  // pedida pelo Gileno, pra reduzir risco de lançamento repetido).
  useEffect(() => {
    (async () => {
      const encontradas = []
      for (const item of itens) {
        try {
          const achadas = await buscarDuplicatasPotenciais(remetenteId, item.valor, item.data_emissao, prestacaoId)
          for (const p of achadas) if (!encontradas.some(e => e.id === p.id)) encontradas.push(p)
        } catch { /* se a checagem falhar, não bloqueia o envio */ }
      }
      setDuplicatas(encontradas)
    })()
  }, [itens, remetenteId, prestacaoId])

  const temDuplicata = duplicatas.length > 0
  const podeEnviar = itens.length > 0 && itensSemFoto.length === 0 && !!destinatarioId
    && (!ehReenvio || observacaoCorrecao.trim().length > 0)
    && (!temDuplicata || cienteDuplicata)

  return (
    <div style={{ padding: '0 0 24px' }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
        Revisão e Envio
      </h2>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 18 }}>
        Confira os itens antes de enviar para aprovação.
      </p>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
          <span>{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
          <span>Total: R$ {total.toFixed(2).replace('.', ',')}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {itens.map(item => {
          const semFoto = !(item.pc_fotos?.length > 0)
          return (
            <div key={item.id} style={{
              background: '#fff', border: `1.5px solid ${semFoto ? '#fca5a5' : '#e2e8f0'}`,
              borderRadius: 10, padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{item.classificacao} — {item.descricao}</p>
                  <p style={{ fontSize: 11, color: '#64748b' }}>{item.fornecedor || '—'} · {item.data_emissao || 'sem data'}</p>
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>R$ {Number(item.valor).toFixed(2).replace('.', ',')}</p>
              </div>
              {semFoto && (
                <p style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginTop: 6 }}>
                  ⚠️ sem foto do comprovante
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="form-group">
        <label className="form-label">Enviar para *</label>
        <select className="form-input" value={destinatarioId || ''} onChange={e => onMudarDestinatario(e.target.value)}>
          <option value="">Selecione...</option>
          {destinatarios.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
          Lista mostra só usuários habilitados a receber prestações de contas.
        </p>
      </div>

      {ehReenvio && (
        <div className="form-group">
          <label className="form-label">O que foi corrigido? *</label>
          <textarea
            className="form-textarea" rows={3} value={observacaoCorrecao} onChange={e => onMudarObservacaoCorrecao(e.target.value)}
            placeholder="Ex.: troquei a foto do recibo e corrigi a data"
          />
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            Obrigatório pra reenviar — fica registrado no histórico desta prestação, junto com o motivo da rejeição.
          </p>
        </div>
      )}

      {itensSemFoto.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', marginTop: 10, marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>
            ⚠️ {itensSemFoto.length} {itensSemFoto.length === 1 ? 'item precisa' : 'itens precisam'} de foto do comprovante antes de enviar.
          </p>
        </div>
      )}

      {temDuplicata && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px', marginTop: 10, marginBottom: 10 }}>
          <p style={{ fontSize: 12.5, color: '#92400e', fontWeight: 700, marginBottom: 6 }}>
            ⚠️ Possível prestação de contas duplicada
          </p>
          <p style={{ fontSize: 12, color: '#92400e', marginBottom: 8 }}>
            Identificamos que você já possui {duplicatas.length === 1 ? 'outra prestação de contas' : `outras ${duplicatas.length} prestações de contas`} lançada{duplicatas.length === 1 ? '' : 's'} com o mesmo valor e a mesma data de emissão
            {duplicatas.length === 1 ? ` (${duplicatas[0].numero_pc})` : `: ${duplicatas.map(d => d.numero_pc).join(', ')}`}.
            Confirme se esta despesa não está sendo lançada em duplicidade antes de prosseguir.
          </p>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#78350f', cursor: 'pointer' }}>
            <input type="checkbox" checked={cienteDuplicata} onChange={e => setCienteDuplicata(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Declaro estar ciente do alerta acima e assumo integral responsabilidade caso esta prestação de contas seja, de fato, duplicada.</span>
          </label>
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={onEnviar} disabled={!podeEnviar || enviando} style={{
          width: '100%', padding: 14, borderRadius: 12, border: 'none',
          background: podeEnviar && !enviando ? '#d97706' : '#e2e8f0',
          color: podeEnviar && !enviando ? '#fff' : '#94a3b8',
          fontSize: 15, fontWeight: 700, cursor: podeEnviar && !enviando ? 'pointer' : 'not-allowed',
        }}>
          {enviando ? '⏳ Enviando...' : '📤 Enviar para Aprovação'}
        </button>
        <button onClick={onVoltar} disabled={enviando} style={{
          width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0',
          background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>← Voltar aos itens</button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import PCHistorico from './PCHistorico.jsx'
import { gerarExcelPrestacao, baixarFotosEmLote } from '../lib/exportacao.js'

export default function PCRecebidaDetalhe({ prestacao, remetenteNome, onAprovar, onRejeitar, onVoltar, processando }) {
  const [rejeitando, setRejeitando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [baixandoFotos, setBaixandoFotos] = useState(false)

  const handleBaixarExcel = () => {
    try {
      gerarExcelPrestacao(prestacao)
    } catch (e) {
      alert('Não foi possível gerar o Excel: ' + (e.message || e))
    }
  }

  const handleBaixarFotos = async () => {
    setBaixandoFotos(true)
    try {
      await baixarFotosEmLote(prestacao)
    } catch (e) {
      alert('Não foi possível baixar as fotos: ' + (e.message || e))
    } finally {
      setBaixandoFotos(false)
    }
  }

  const itens = prestacao.pc_itens || []
  const total = itens.reduce((soma, i) => soma + Number(i.valor || 0), 0)
  const podeDecidir = prestacao.status === 'ENVIADO'

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {itens.map((item, i) => (
          <div key={item.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{i + 1}. {item.classificacao} — {item.descricao}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>R$ {Number(item.valor).toFixed(2).replace('.', ',')}</p>
            </div>
            <p style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
              {item.fornecedor || '—'} · {item.forma_pagamento || '—'} · {item.tipo_comprovante || '—'} · {item.data_emissao || 'sem data'}
            </p>
            {item.observacao && <p style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Obs.: {item.observacao}</p>}
            {(item.pc_fotos || []).length > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {item.pc_fotos.map(f => (
                  <a key={f.id} href={f.foto_url} target="_blank" rel="noreferrer">
                    <img src={f.foto_url} alt="Comprovante" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  </a>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>⚠️ sem foto do comprovante</p>
            )}
          </div>
        ))}
      </div>

      {prestacao.status === 'APROVADO' && (
        <div style={{ background: '#fff', border: '1.5px solid #86efac', borderRadius: 12, padding: '14px', marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            📦 Exportar
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={handleBaixarExcel} style={{
              width: '100%', padding: 12, borderRadius: 10, border: 'none',
              background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>📊 Baixar Excel Consolidado</button>
            <button onClick={handleBaixarFotos} disabled={baixandoFotos} style={{
              width: '100%', padding: 12, borderRadius: 10, border: 'none',
              background: baixandoFotos ? '#94a3b8' : '#1e3a5f', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: baixandoFotos ? 'not-allowed' : 'pointer',
            }}>{baixandoFotos ? '⏳ Baixando fotos...' : '🗂️ Baixar Fotos em Lote (.zip)'}</button>
          </div>
          <p style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
            Excel no mesmo layout da sua planilha. Fotos nomeadas e ordenadas por data de emissão.
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

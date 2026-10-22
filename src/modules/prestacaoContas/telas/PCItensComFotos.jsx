// Lista de itens de uma prestação com os comprovantes anexados — usado tanto
// na análise de quem recebe (PCRecebidaDetalhe) quanto, agora, por quem
// enviou (PrestacaoContasLista, aba "Minhas Prestações"), pra poder rever o
// próprio comprovante depois de enviar sem precisar ser aprovador.
import { useEffect, useState } from 'react'
import { labelCategoriaDespesa, formatarAlocacao, mapaSugestoesAlocacao, divergenciaAlocacao } from '../lib/categorias.js'
import { listarClassificacoes } from '../lib/prestacaoContas.js'

export default function PCItensComFotos({ itens }) {
  const [sugestoesAlocacao, setSugestoesAlocacao] = useState({})

  useEffect(() => {
    listarClassificacoes().then(cs => setSugestoesAlocacao(mapaSugestoesAlocacao(cs))).catch(() => {})
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {itens.map((item, i) => {
        const sugestaoAlocacao = divergenciaAlocacao(item, sugestoesAlocacao)
        return (
        <div key={item.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{i + 1}. {item.classificacao} — <strong>DESCRIÇÃO:</strong> {item.descricao}</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>R$ {Number(item.valor).toFixed(2).replace('.', ',')}</p>
          </div>
          <p style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
            <strong>FORNECEDOR:</strong> {item.fornecedor || '—'} · {item.forma_pagamento || '—'} · {item.tipo_comprovante || '—'} · {item.data_emissao || 'sem data'}
          </p>
          {item.categoria_despesa && (
            <p style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, marginBottom: 6 }}>
              🏷️ {labelCategoriaDespesa(item.categoria_despesa)}{formatarAlocacao(item) !== '—' ? `: ${formatarAlocacao(item)}` : ''}
            </p>
          )}
          {sugestaoAlocacao && (
            <p style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '5px 8px', marginBottom: 6 }}>
              ⚠️ "{item.classificacao}" costuma ser alocada a <strong>{labelCategoriaDespesa(sugestaoAlocacao)}</strong> — confira a alocação.
            </p>
          )}
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
        )
      })}
    </div>
  )
}

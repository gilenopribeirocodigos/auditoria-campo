import { useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { analisarFechamento } from '../lib/analiseFechamento.js'
import {
  compartilharImagemNativo, compartilharImagemWeb, renderizarElementoVisivelParaCanvas, descreverErro,
} from '../../../lib/compartilhar.js'

const CORES_CATEGORIA = {
  BASE_OPERACIONAL: { emoji: '🏠', cor: '#d97706' },
  COLABORADOR:       { emoji: '🍽️', cor: '#2563eb' },
  VIATURA:           { emoji: '🚗', cor: '#0891b2' },
  EQUIPE_PREFIXO:    { emoji: '📦', cor: '#64748b' },
  TERCEIROS:         { emoji: '🏷️', cor: '#7c3aed' },
  ADMINISTRATIVA:    { emoji: '💼', cor: '#b91c1c' },
}

const CORES_POSICAO = ['#d97706', '#94a3b8', '#b45309', '#cbd5e1', '#cbd5e1']

function fmtMoeda(valor) {
  return `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`
}

function fmtData(iso) {
  if (!iso) return ''
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR')
}

// periodo_de/periodo_ate do fechamento costumam vir vazios (não são
// preenchidos no fluxo atual de fecharPrestacoes) — nesse caso deriva o
// período direto das datas de emissão dos itens do próprio lote.
function periodoDoFechamento(fechamento, prestacoes) {
  if (fechamento.periodo_de && fechamento.periodo_ate) {
    return `${fmtData(fechamento.periodo_de)} a ${fmtData(fechamento.periodo_ate)}`
  }
  const datas = prestacoes.flatMap(p => (p.pc_itens || []).map(i => i.data_emissao)).filter(Boolean).sort()
  if (datas.length === 0) return ''
  return `${fmtData(datas[0])} a ${fmtData(datas[datas.length - 1])}`
}

function CartaoRanking({ titulo, itens, sufixoQtd = 'despesa' }) {
  if (itens.length === 0) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 12 }}>
        {titulo}
      </div>
      <div>
        {itens.map((item, i) => (
          <div key={item.nome} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
            borderBottom: i < itens.length - 1 ? '1px solid #f8fafc' : 'none',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: CORES_POSICAO[i] || '#cbd5e1',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff',
            }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.nome}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{item.qtd} {sufixoQtd}{item.qtd === 1 ? '' : 's'}</div>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1e293b', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {fmtMoeda(item.total)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniColuna({ titulo, itens }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .4 }}>
        {titulo}
      </div>
      {itens.length === 0 ? (
        <p style={{ fontSize: 11.5, color: '#94a3b8' }}>Sem despesas.</p>
      ) : itens.map((item, i) => (
        <div key={item.nome} style={{
          display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', fontSize: 12.5,
          borderBottom: i < itens.length - 1 ? '1px dashed #f8fafc' : 'none',
        }}>
          <span style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.nome}</span>
          <span style={{ fontWeight: 700, color: '#1e293b', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtMoeda(item.total)}</span>
        </div>
      ))}
    </div>
  )
}

export default function PCRelatorioFechamento({ fechamento, prestacoes, onFechar }) {
  const conteudoRef = useRef(null)
  const [compartilhando, setCompartilhando] = useState(false)

  const analise = useMemo(() => analisarFechamento(prestacoes), [prestacoes])
  const periodo = useMemo(() => periodoDoFechamento(fechamento, prestacoes), [fechamento, prestacoes])
  const maiorCategoria = analise.porCategoria[0]?.total || 1

  const handleCompartilhar = async () => {
    setCompartilhando(true)
    try {
      const canvas = await renderizarElementoVisivelParaCanvas(conteudoRef.current, { escala: 4, corFundo: '#eef2f6' })
      const nomeArq = `Relatorio_${fechamento.numero_fechamento}.png`.replace(/\s+/g, '_')
      if (Capacitor.isNativePlatform()) {
        await compartilharImagemNativo(canvas, nomeArq, { titulo: 'Relatório do Fechamento' })
      } else {
        await compartilharImagemWeb(canvas, nomeArq, {
          titulo: 'Relatório do Fechamento',
          mensagem: `Segue em anexo a análise do fechamento ${fechamento.numero_fechamento} — anexe a imagem "${nomeArq}" que acabou de baixar.`,
        })
      }
    } catch (err) {
      console.error(err); alert('Não foi possível gerar a imagem: ' + descreverErro(err))
    } finally {
      setCompartilhando(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 3000,
    }}>
      <div style={{
        background: '#eef2f6', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, maxHeight: '92vh',
        overflowY: 'auto', padding: '0 0 20px',
      }}>
        <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '12px auto' }} />

        <div ref={conteudoRef}>
          <div style={{ background: '#1e3a5f', color: '#fff', padding: '4px 20px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 10, opacity: .65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                Prestação de Contas · Fechamento
              </div>
              <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'rgba(255,255,255,0.7)' }}>×</button>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>📊 Relatório do Fechamento</div>
            <div style={{ fontSize: 12, opacity: .75, marginTop: 2 }}>{fechamento.numero_fechamento}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14 }}>
              <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtMoeda(fechamento.valor_total)}</div>
              <div style={{ fontSize: 11.5, opacity: .75, textAlign: 'right', lineHeight: 1.5 }}>
                {fechamento.qtd_prestacoes} prestações<br />{periodo}
              </div>
            </div>
          </div>

          <div style={{ padding: '14px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 12 }}>
                🏷️ Por categoria de despesa
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {analise.porCategoria.map(c => {
                  const estilo = CORES_CATEGORIA[c.nome] || { emoji: '🏷️', cor: '#64748b' }
                  return (
                    <div key={c.nome} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#1e293b' }}>
                        <span style={{ fontWeight: 600 }}>{estilo.emoji} {c.label} <span style={{ color: '#64748b', fontWeight: 400 }}>· {c.qtd}</span></span>
                        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMoeda(c.total)}</span>
                      </div>
                      <div style={{ height: 10, background: '#f8fafc', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 999, width: `${Math.max(4, (c.total / maiorCategoria) * 100)}%`, background: estilo.cor }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <CartaoRanking titulo="🥇 Quem mais gastou — Fiscal" itens={analise.topFiscais.slice(0, 5)} sufixoQtd="prestação" />
            <CartaoRanking titulo="🍽️ Colaboradores com mais despesa" itens={analise.topColaboradores.slice(0, 5)} />

            {(analise.topViaturas.length > 0 || analise.topPrefixos.length > 0) && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 12 }}>
                  🚗 Viaturas e Prefixos
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <MiniColuna titulo="Top Viaturas" itens={analise.topViaturas.slice(0, 5)} />
                  <MiniColuna titulo="Top Prefixos" itens={analise.topPrefixos.slice(0, 5)} />
                </div>
              </div>
            )}

            <CartaoRanking titulo="🏠 Bases Operacionais" itens={analise.topBases.slice(0, 5)} />
          </div>
        </div>

        <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={handleCompartilhar} disabled={compartilhando} style={{
            width: '100%', padding: 14, borderRadius: 12, border: 'none',
            background: '#d97706', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>{compartilhando ? '⏳ Gerando...' : '📤 Compartilhar'}</button>
          <button onClick={onFechar} style={{
            width: '100%', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0',
            background: 'transparent', color: '#64748b', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

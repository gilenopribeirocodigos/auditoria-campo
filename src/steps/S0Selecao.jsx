import { useState } from 'react'
import { CHECKLISTS, getChecklist } from '../data/checklists.js'
import { NavBar, Alert } from '../components/Shared.jsx'
import { obterNumeroAS, numeroASDaPauta } from '../lib/numeroAS.js'

const TIPOS_AUDITORIA = [
  { id: 'DESEMPENHO',  label: 'Desempenho Operacional', emoji: '📊', sub: 'Acompanhamento em tempo real' },
  { id: 'POS_SERVICO', label: 'Pós Serviço',            emoji: '✅', sub: 'Após execução da atividade'  },
]

const TIPO_AUDITORIA_LABEL = { DESEMPENHO: 'Desempenho Op.', POS_SERVICO: 'Pós Serviço' }

function temCoordenadasPauta(p) {
  return p?.latitude !== null && p?.latitude !== undefined && p?.latitude !== '' &&
    p?.longitude !== null && p?.longitude !== undefined && p?.longitude !== ''
}

function linkRotaPauta(p) {
  if (!temCoordenadasPauta(p)) return ''
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.latitude},${p.longitude}`)}`
}

function textoPadrao(valor) {
  return String(valor ?? '').trim().toLocaleUpperCase('pt-BR')
}

function localPauta(p) {
  return [p?.cidade, p?.bairro].map(textoPadrao).filter(Boolean).join('/')
}

function formatarDataBR(dataISO) {
  if (!dataISO) return ''
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

function diasAteData(dataISO) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(`${dataISO}T00:00:00`)
  const dias = Math.round((alvo - hoje) / 86400000)
  if (dias === 1) return 'amanhã'
  return `daqui a ${dias} dias`
}

function cidadePauta(p) {
  return textoPadrao(p?.cidade) || 'SEM LOCALIZAÇÃO INFORMADA'
}

function agruparPorData(pautas) {
  const mapa = new Map()
  pautas.forEach(p => {
    const chave = p.data_prevista
    if (!mapa.has(chave)) mapa.set(chave, [])
    mapa.get(chave).push(p)
  })
  return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function agruparPorCidade(pautas) {
  const mapa = new Map()
  pautas.forEach(p => {
    const chave = cidadePauta(p)
    if (!mapa.has(chave)) mapa.set(chave, [])
    mapa.get(chave).push(p)
  })
  return [...mapa.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
}

function agruparPorDataCidade(pautas) {
  return agruparPorData(pautas).map(([data, lista]) => [data, agruparPorCidade(lista)])
}

function PautaFuturaLinha({ p }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{p.prefixo}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b' }}>{formatarDataBR(p.data_prevista)}</span>
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
        🔧 {p.tipo_servico} · {TIPO_AUDITORIA_LABEL[p.tipo_auditoria]}
        {(p.cidade || p.bairro) && <span> · {localPauta(p)}</span>}
      </div>
    </div>
  )
}

function GrupoPautasFuturas({ titulo, sub, pautas, aberto }) {
  return (
    <details open={aberto} style={{ border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
      <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', cursor: 'pointer', listStyle: 'none' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{titulo}</div>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{sub}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#0b4f49', background: '#e6f6f4', padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
          {pautas.length} pauta{pautas.length > 1 ? 's' : ''}
        </span>
      </summary>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pautas.map(p => <PautaFuturaLinha key={p.id} p={p} />)}
      </div>
    </details>
  )
}

function PautasFuturas({ pautasFuturas }) {
  const [aberto, setAberto] = useState(false)
  const [agrupamento, setAgrupamento] = useState('data')

  if (!pautasFuturas || pautasFuturas.length === 0) return null

  const porData = agruparPorData(pautasFuturas)
  const porCidade = agruparPorCidade(pautasFuturas)
  const porDataCidade = agruparPorDataCidade(pautasFuturas)

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, marginBottom: 18 }}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#e6f6f4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📅</div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Ver Pautas Futuras</p>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Planejamento — datas ainda não vencidas</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 999 }}>{pautasFuturas.length}</span>
          <span style={{ fontSize: 11, color: '#64748b', display: 'inline-block', transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
        </div>
      </button>

      {aberto && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 4, marginBottom: 12 }}>
            {[['data', '📅 Por Data'], ['cidade', '🏙️ Por Cidade'], ['datacidade', '📅+🏙️ Data e Cidade']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAgrupamento(id)}
                style={{
                  textAlign: 'center', fontSize: 11, fontWeight: 800, padding: '8px 4px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: agrupamento === id ? '#0f766e' : 'transparent',
                  color: agrupamento === id ? '#fff' : '#64748b',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {agrupamento === 'data' && porData.map(([data, lista], i) => (
            <GrupoPautasFuturas key={data} titulo={formatarDataBR(data)} sub={diasAteData(data)} pautas={lista} aberto={i === 0} />
          ))}

          {agrupamento === 'cidade' && porCidade.map(([cidade, lista], i) => (
            <GrupoPautasFuturas
              key={cidade}
              titulo={cidade}
              sub={`${new Set(lista.map(p => p.data_prevista)).size} data(s) diferente(s)`}
              pautas={lista}
              aberto={i === 0}
            />
          ))}

          {agrupamento === 'datacidade' && porDataCidade.map(([data, cidades], i) => (
            <details key={data} open={i === 0} style={{ border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
              <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', cursor: 'pointer', listStyle: 'none' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{formatarDataBR(data)}</div>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{diasAteData(data)}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#0b4f49', background: '#e6f6f4', padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  {cidades.reduce((soma, [, lista]) => soma + lista.length, 0)} pauta(s)
                </span>
              </summary>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cidades.map(([cidade, lista]) => (
                  <details key={cidade} style={{ background: '#f8fafc', borderRadius: 8 }}>
                    <summary style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', cursor: 'pointer', listStyle: 'none', fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
                      <span>{cidade}</span>
                      <span style={{ fontWeight: 800, color: '#0b4f49' }}>{lista.length}</span>
                    </summary>
                    <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {lista.map(p => <PautaFuturaLinha key={p.id} p={p} />)}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}

export default function S0Selecao({ form, upd, setForm, next, pautasHoje = [], pautasFuturas = [], pautaAtiva, setPautaAtiva, permiteAuditoriaAvulsa = false }) {
  const [modoAvulso, setModoAvulso] = useState(false)
  const temPautas = pautasHoje.length > 0
  const ok = form.tipoAuditoria && form.tipoServico && form.produtivo !== null
  const cl = ok ? getChecklist(form.tipoServico, form.tipoAuditoria, form.produtivo) : null

  // Seleciona uma pauta obrigatória e pré-preenche o formulário
  const selecionarPauta = (pauta) => {
    const numeroAS = numeroASDaPauta(pauta)
    const pautaComAS = { ...pauta, numero_as: numeroAS }
    setPautaAtiva(pautaComAS)
    setForm(f => ({
      ...f,
      numeroAS,
      tipoServico:   pautaComAS.tipo_servico,
      tipoAuditoria: pautaComAS.tipo_auditoria,
      prefixo:       pautaComAS.prefixo,
      os:            pautaComAS.os || '',
      uc:            pautaComAS.uc || '',
      motivoAuditoria: pautaComAS.motivo_auditoria || '',
      qtdeCabosOs:   pautaComAS.qtde_cabos_os ?? '',
      qtdeCabosEmCampo: '',
      nomeEletricista: pautaComAS.nome_eletricista || '',
      nomeEletricista2: pautaComAS.nome_eletricista2 || '',
      matriculaEletricista1: pautaComAS.matricula_eletricista1 || '',
      matriculaEletricista2: pautaComAS.matricula_eletricista2 || '',
      statusMotivoAuditoria: null,
      observacoesMotivoAuditoria: '',
      fotosMotivo: [],
      produtivo:     null,
      respostas:     {},
      debitoPago:    null,
    }))
  }

  // Desmarca pauta
  const desmarcarPauta = () => {
    setPautaAtiva(null)
    setForm(f => ({
      ...f,
      numeroAS: obterNumeroAS(),
      tipoServico: '',
      tipoAuditoria: '',
      prefixo: '',
      os: '',
      uc: '',
      motivoAuditoria: '',
      qtdeCabosOs: '',
      qtdeCabosEmCampo: '',
      nomeEletricista: '',
      nomeEletricista2: '',
      matriculaEletricista1: '',
      matriculaEletricista2: '',
      statusMotivoAuditoria: null,
      observacoesMotivoAuditoria: '',
      fotosMotivo: [],
      produtivo: null,
      respostas: {},
      debitoPago: null,
    }))
  }

  // SE TEM PAUTAS OBRIGATÓRIAS — modo bloqueado
  const iniciarModoAvulso = () => {
    desmarcarPauta()
    setModoAvulso(true)
  }

  const voltarParaPautas = () => {
    desmarcarPauta()
    setModoAvulso(false)
  }

  if (temPautas && !modoAvulso) {
    return (
      <div>
        {/* Alerta obrigatório */}
        <div style={{
          background: '#450a0a', border: '2px solid #dc2626',
          borderRadius: 14, padding: '16px', marginBottom: 18, textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🚨</div>
          <p style={{ color: '#fca5a5', fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
            Você tem {pautasHoje.length} pauta(s) obrigatória(s) hoje!
          </p>
          <p style={{ color: '#fecaca', fontSize: 12 }}>
            {permiteAuditoriaAvulsa
              ? 'Selecione uma pauta para cumprir ou use auditoria avulsa quando houver necessidade operacional.'
              : 'Selecione uma equipe para fiscalizar. Você só pode auditar as equipes listadas abaixo.'}
          </p>
        </div>

        <PautasFuturas pautasFuturas={pautasFuturas} />

        {/* Lista de pautas */}
        <p className="section-title">Selecione a Equipe para Auditar</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {pautasHoje.map(p => {
            const ativa = pautaAtiva?.id === p.id
            const numeroAS = numeroASDaPauta(p)
            return (
              <button key={p.id} onClick={() => ativa ? desmarcarPauta() : selecionarPauta(p)} style={{
                background: ativa ? '#eff6ff' : '#fff',
                border: `2px solid ${ativa ? '#2563eb' : '#e2e8f0'}`,
                borderRadius: 14, padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
                transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 16, fontWeight: 800, color: ativa ? '#1d4ed8' : '#1e293b', marginBottom: 4 }}>
                      {ativa ? '✅ ' : ''}{p.prefixo}
                    </p>
                    <p style={{ fontSize: 12, color: '#64748b' }}>
                      🔧 {p.tipo_servico} · {TIPO_AUDITORIA_LABEL[p.tipo_auditoria]}
                      {p.data_prevista < new Date().toISOString().split('T')[0] && (
                        <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: 6 }}>⚠️ Vencida</span>
                      )}
                    </p>

                    {/* ─── Eletricistas pré-atribuídos (se houver) ─── */}
                    <p style={{ fontSize: 12, color: '#475569', fontWeight: 600, marginTop: 3 }}>
                      NO. AS: {textoPadrao(numeroAS)}
                    </p>

                    {(p.prioridade_execucao || p.data_os || p.cidade || p.bairro || p.endereco_referencia || temCoordenadasPauta(p)) && (
                      <div style={{ fontSize: 12, color: '#475569', fontWeight: 600, marginTop: 3, lineHeight: 1.5 }}>
                        {p.prioridade_execucao && <div>PRIORIDADE: {p.prioridade_execucao}</div>}
                        {p.data_os && <div>DATA DA OS: {p.data_os}</div>}
                        {(p.cidade || p.bairro) && <div>CIDADE/BAIRRO: {localPauta(p)}</div>}
                        {p.endereco_referencia && <div>ENDERECO: {textoPadrao(p.endereco_referencia)}</div>}
                        {temCoordenadasPauta(p) && (
                          <span
                            onClick={e => {
                              e.stopPropagation()
                              window.open(linkRotaPauta(p), '_blank', 'noopener,noreferrer')
                            }}
                            style={{ color: '#2563eb', fontWeight: 800, cursor: 'pointer' }}
                          >
                            Abrir rota
                          </span>
                        )}
                      </div>
                    )}

                    {(p.os || p.uc) && (
                      <p style={{ fontSize: 12, color: '#475569', fontWeight: 600, marginTop: 3 }}>
                        {p.os && <>OS: {p.os}</>}
                        {p.os && p.uc && <span style={{ margin: '0 6px' }}>-</span>}
                        {p.uc && <>UC: {p.uc}</>}
                      </p>
                    )}

                    {(p.nome_eletricista || p.nome_eletricista2) && (
                      <p style={{ fontSize: 12, color: '#0c4a6e', fontWeight: 600, marginTop: 3 }}>
                        👷 {[p.nome_eletricista, p.nome_eletricista2].filter(Boolean).join(' | ')}
                      </p>
                    )}

                    {/* ─── Motivo Auditoria (destacado em laranja) ─── */}
                    {p.motivo_auditoria && (
                      <div style={{
                        marginTop: 6, display: 'inline-block',
                        background: '#fff7ed', border: '1px solid #fed7aa',
                        color: '#c2410c', fontWeight: 700, fontSize: 11,
                        padding: '3px 9px', borderRadius: 6,
                      }}>
                        🎯 Motivo: {p.motivo_auditoria}
                      </div>
                    )}

                    {p.qtde_cabos_os && (
                      <p style={{ fontSize: 12, color: '#92400e', fontWeight: 700, marginTop: 4 }}>
                        Cabos OS: {p.qtde_cabos_os}m
                      </p>
                    )}

                    {/* ─── Observação (destacada em azul, texto completo) ─── */}
                    {p.observacao && (
                      <div style={{
                        marginTop: 5, background: '#f0f9ff', border: '1px solid #bae6fd',
                        padding: '6px 10px', borderRadius: 6, lineHeight: 1.5,
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          💬 Observação:
                        </span>
                        <p style={{ fontSize: 11, color: '#0c4a6e', margin: '2px 0 0', wordBreak: 'break-word' }}>
                          {p.observacao}
                        </p>
                      </div>
                    )}
                  </div>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: `2px solid ${ativa ? '#2563eb' : '#e2e8f0'}`,
                    background: ativa ? '#2563eb' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 2,
                  }}>
                    {ativa && <span style={{ color: '#fff', fontSize: 14 }}>✓</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Status do Serviço — só aparece após selecionar pauta */}
        {permiteAuditoriaAvulsa && (
          <Alert type="warning">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div>
                <strong>Auditoria avulsa autorizada.</strong><br />
                As pautas obrigatórias continuam pendentes. Use esta opção apenas para uma auditoria fora da pauta programada.
              </div>
              <button
                type="button"
                onClick={iniciarModoAvulso}
                style={{
                  background: '#1e40af', color: '#fff', border: 'none', borderRadius: 10,
                  padding: '10px 14px', fontWeight: 800, cursor: 'pointer',
                }}
              >
                Iniciar auditoria avulsa
              </button>
            </div>
          </Alert>
        )}

        {pautaAtiva && (
          <>
            <p className="section-title">Status do Serviço</p>
            <div className="type-grid">
              <button
                className={`type-card ${form.produtivo === true ? 'selected-green' : ''}`}
                onClick={() => { upd('produtivo', true); upd('respostas', {}); upd('debitoPago', null) }}>
                <div className="type-emoji">✅</div>
                <div className="type-label" style={{ color: form.produtivo === true ? '#15803d' : '#374151' }}>Produtivo</div>
                <div className="type-sub">Serviço executado</div>
              </button>
              <button
                className={`type-card ${form.produtivo === false ? 'selected-red' : ''}`}
                onClick={() => { upd('produtivo', false); upd('respostas', {}); upd('debitoPago', null) }}>
                <div className="type-emoji">❌</div>
                <div className="type-label" style={{ color: form.produtivo === false ? '#b91c1c' : '#374151' }}>Improdutivo</div>
                <div className="type-sub">Não executado</div>
              </button>
            </div>

            {cl && (
              <Alert type="info">
                <strong>Pauta: {pautaAtiva.prefixo}</strong> — {CHECKLISTS[form.tipoServico]?.label} —{' '}
                {cl.label} — <strong>{cl.items.length} perguntas</strong>
                {pautaAtiva.numero_as && <><br /><strong>NO. AS:</strong> {textoPadrao(pautaAtiva.numero_as)}</>}
              </Alert>
            )}
          </>
        )}

        <div style={{ height: 80 }} />
        <NavBar onNext={ok ? next : undefined} nextDisabled={!ok} hideBack nextLabel="Iniciar Auditoria →" />
      </div>
    )
  }

  // SEM PAUTAS — modo livre normal
  return (
    <div>
      <PautasFuturas pautasFuturas={pautasFuturas} />

      {temPautas && modoAvulso && (
        <Alert type="warning">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div>
              <strong>Auditoria avulsa liberada.</strong><br />
              Existem {pautasHoje.length} pauta(s) obrigatória(s) pendente(s) para este usuário.
            </div>
            <button
              type="button"
              onClick={voltarParaPautas}
              style={{
                background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 10,
                padding: '10px 14px', fontWeight: 800, cursor: 'pointer',
              }}
            >
              Voltar para pautas obrigatórias
            </button>
          </div>
        </Alert>
      )}

      <p className="section-title">Tipo de Auditoria</p>
      <div className="type-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {TIPOS_AUDITORIA.map(t => (
          <button key={t.id}
            className={`type-card ${form.tipoAuditoria === t.id ? 'selected-blue' : ''}`}
            onClick={() => { upd('tipoAuditoria', t.id); upd('tipoServico', ''); upd('produtivo', null); upd('respostas', {}); upd('debitoPago', null) }}>
            <div className="type-emoji">{t.emoji}</div>
            <div className="type-label" style={{ color: form.tipoAuditoria === t.id ? '#1d4ed8' : '#374151' }}>{t.label}</div>
            <div className="type-sub">{t.sub}</div>
          </button>
        ))}
      </div>

      {form.tipoAuditoria && (
        <>
          <p className="section-title">Tipo de Serviço</p>
          {/* ─── Grid 2x2 — acomoda os 4 tipos: Corte, Anexo, Religação, Emergencial ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 18 }}>
            {Object.entries(CHECKLISTS).map(([key, val]) => (
              <button key={key}
                className={`type-card ${form.tipoServico === key ? 'selected-blue' : ''}`}
                onClick={() => { upd('tipoServico', key); upd('produtivo', null); upd('respostas', {}); upd('debitoPago', null) }}
                style={{ padding: '14px 8px' }}>
                <div className="type-emoji" style={{ fontSize: 26 }}>{val.emoji}</div>
                <div className="type-label" style={{ fontSize: 12, color: form.tipoServico === key ? '#1d4ed8' : '#374151', lineHeight: 1.3, marginTop: 6 }}>
                  {val.label}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {form.tipoServico && (
        <>
          <p className="section-title">Status do Serviço</p>
          <div className="type-grid">
            <button
              className={`type-card ${form.produtivo === true ? 'selected-green' : ''}`}
              onClick={() => { upd('produtivo', true); upd('respostas', {}); upd('debitoPago', null) }}>
              <div className="type-emoji">✅</div>
              <div className="type-label" style={{ color: form.produtivo === true ? '#15803d' : '#374151' }}>Produtivo</div>
              <div className="type-sub">Serviço executado</div>
            </button>
            <button
              className={`type-card ${form.produtivo === false ? 'selected-red' : ''}`}
              onClick={() => { upd('produtivo', false); upd('respostas', {}); upd('debitoPago', null) }}>
              <div className="type-emoji">❌</div>
              <div className="type-label" style={{ color: form.produtivo === false ? '#b91c1c' : '#374151' }}>Improdutivo</div>
              <div className="type-sub">Não executado</div>
            </button>
          </div>
        </>
      )}

      {cl && (
        <Alert type="info">
          <strong>{TIPOS_AUDITORIA.find(t => t.id === form.tipoAuditoria)?.label}</strong> —{' '}
          {CHECKLISTS[form.tipoServico].label} — {cl.label} —{' '}
          <strong>{cl.items.length} perguntas</strong> (peso {cl.peso} cada)
        </Alert>
      )}

      <div style={{ height: 80 }} />
      <NavBar onNext={ok ? next : undefined} nextDisabled={!ok} hideBack nextLabel="Iniciar Auditoria →" />
    </div>
  )
}

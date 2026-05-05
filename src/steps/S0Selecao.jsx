import { CHECKLISTS } from '../data/checklists.js'
import { NavBar, Alert } from '../components/Shared.jsx'

const TIPOS_AUDITORIA = [
  { id: 'DESEMPENHO',  label: 'Desempenho Operacional', emoji: '📊', sub: 'Acompanhamento em tempo real' },
  { id: 'POS_SERVICO', label: 'Pós Serviço',            emoji: '✅', sub: 'Após execução da atividade'  },
]

export default function S0Selecao({ form, upd, next }) {
  const ok = form.tipoAuditoria && form.tipoServico && form.produtivo !== null
  const cl = ok ? CHECKLISTS[form.tipoServico]?.[form.produtivo ? 'PRODUTIVO' : 'IMPRODUTIVO'] : null

  return (
    <div>
      {/* TIPO DE AUDITORIA */}
      <p className="section-title">Tipo de Auditoria</p>
      <div className="type-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {TIPOS_AUDITORIA.map(t => (
          <button key={t.id}
            className={`type-card ${form.tipoAuditoria === t.id ? 'selected-blue' : ''}`}
            onClick={() => { upd('tipoAuditoria', t.id); upd('tipoServico', ''); upd('produtivo', null); upd('respostas', {}); }}>
            <div className="type-emoji">{t.emoji}</div>
            <div className="type-label" style={{ color: form.tipoAuditoria === t.id ? '#1d4ed8' : '#374151' }}>
              {t.label}
            </div>
            <div className="type-sub">{t.sub}</div>
          </button>
        ))}
      </div>

      {/* TIPO DE SERVIÇO — 3 botões */}
      {form.tipoAuditoria && (
        <>
          <p className="section-title">Tipo de Serviço</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
            {Object.entries(CHECKLISTS).map(([key, val]) => (
              <button key={key}
                className={`type-card ${form.tipoServico === key ? 'selected-blue' : ''}`}
                onClick={() => { upd('tipoServico', key); upd('produtivo', null); upd('respostas', {}); }}
                style={{ padding: '14px 6px' }}>
                <div className="type-emoji" style={{ fontSize: 24 }}>{val.emoji}</div>
                <div className="type-label" style={{
                  fontSize: 11,
                  color: form.tipoServico === key ? '#1d4ed8' : '#374151',
                  lineHeight: 1.3,
                  marginTop: 4,
                }}>
                  {val.label}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* STATUS DO SERVIÇO */}
      {form.tipoServico && (
        <>
          <p className="section-title">Status do Serviço</p>
          <div className="type-grid">
            <button
              className={`type-card ${form.produtivo === true ? 'selected-green' : ''}`}
              onClick={() => { upd('produtivo', true); upd('respostas', {}); }}>
              <div className="type-emoji">✅</div>
              <div className="type-label" style={{ color: form.produtivo === true ? '#15803d' : '#374151' }}>Produtivo</div>
              <div className="type-sub">Serviço executado</div>
            </button>
            <button
              className={`type-card ${form.produtivo === false ? 'selected-red' : ''}`}
              onClick={() => { upd('produtivo', false); upd('respostas', {}); }}>
              <div className="type-emoji">❌</div>
              <div className="type-label" style={{ color: form.produtivo === false ? '#b91c1c' : '#374151' }}>Improdutivo</div>
              <div className="type-sub">Não executado</div>
            </button>
          </div>
        </>
      )}

      {/* RESUMO */}
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

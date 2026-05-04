import { CHECKLISTS } from '../data/checklists.js'
import { SectionTitle, NavBar, Alert } from '../components/Shared.jsx'

export default function S0Selecao({ form, upd, next }) {
  const ok = form.tipoServico && form.produtivo !== null
  const cl = ok ? CHECKLISTS[form.tipoServico][form.produtivo ? 'PRODUTIVO' : 'IMPRODUTIVO'] : null

  return (
    <div>
      <SectionTitle>Tipo de Serviço</SectionTitle>
      <div className="type-grid">
        {Object.entries(CHECKLISTS).map(([key, val]) => (
          <button
            key={key}
            className={`type-card ${form.tipoServico === key ? 'selected-blue' : ''}`}
            onClick={() => upd('tipoServico', key)}
          >
            <div className="type-emoji">{val.emoji}</div>
            <div className="type-label" style={{ color: form.tipoServico === key ? '#1d4ed8' : '#374151' }}>
              {val.label}
            </div>
          </button>
        ))}
      </div>

      <SectionTitle>Status do Serviço</SectionTitle>
      <div className="type-grid">
        <button
          className={`type-card ${form.produtivo === true ? 'selected-green' : ''}`}
          onClick={() => upd('produtivo', true)}
        >
          <div className="type-emoji">✅</div>
          <div className="type-label" style={{ color: form.produtivo === true ? '#15803d' : '#374151' }}>
            Produtivo
          </div>
          <div className="type-sub">Serviço executado</div>
        </button>
        <button
          className={`type-card ${form.produtivo === false ? 'selected-red' : ''}`}
          onClick={() => upd('produtivo', false)}
        >
          <div className="type-emoji">❌</div>
          <div className="type-label" style={{ color: form.produtivo === false ? '#b91c1c' : '#374151' }}>
            Improdutivo
          </div>
          <div className="type-sub">Não executado</div>
        </button>
      </div>

      {cl && (
        <Alert type="info">
          <strong>Checklist selecionado:</strong> {CHECKLISTS[form.tipoServico].label} —{' '}
          {cl.label} — <strong>{cl.items.length} perguntas</strong> (peso {cl.peso} cada)
        </Alert>
      )}

      <div style={{ height: 80 }} />
      <NavBar onNext={ok ? next : undefined} nextDisabled={!ok} hideBack nextLabel="Iniciar Auditoria →" />
    </div>
  )
}

// ================================================================
// COMPONENTES COMPARTILHADOS
// ================================================================

export function SectionTitle({ children }) {
  return <p className="section-title">{children}</p>
}

export function Field({ label, value, onChange, type = 'text', placeholder, required }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}{required && ' *'}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="form-input"
      />
    </div>
  )
}

export function Textarea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="form-textarea"
        rows={rows}
      />
    </div>
  )
}

export function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{value || '—'}</span>
    </div>
  )
}

export function NavBar({ onPrev, onNext, hideBack = false, nextLabel = 'Continuar →', nextDisabled = false }) {
  return (
    <div className="nav-bar no-print">
      {!hideBack && (
        <button className="btn-secondary" onClick={onPrev} style={{ flex: 1 }}>
          ← Voltar
        </button>
      )}
      <button
        className="btn-primary"
        onClick={onNext}
        disabled={nextDisabled}
        style={{ flex: hideBack ? 1 : 2 }}
      >
        {nextLabel}
      </button>
    </div>
  )
}

export function Alert({ type = 'info', children }) {
  return <div className={`alert alert-${type}`}>{children}</div>
}

export function StatCard({ label, value, color }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

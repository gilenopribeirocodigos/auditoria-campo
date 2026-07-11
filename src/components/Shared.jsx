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

// Indicador de carregamento com o hexágono animado da marca (mesmo efeito
// da tela de Login) — usar no lugar do "⏳ Carregando..." genérico em telas
// que carregam dados inteiras (não em textos pequenos de botão).
export function CarregandoHexagono({ texto = 'Carregando...', tamanho = 56, padding = 40 }) {
  return (
    <div style={{ textAlign: 'center', padding, color: '#64748b' }}>
      <svg viewBox="0 0 100 100" width={tamanho} height={tamanho} xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', margin: '0 auto 10px' }}>
        <line className="vgp-e-dark vgp-d0" x1="50" y1="7"  x2="87" y2="28"/>
        <line className="vgp-e-dark vgp-d1" x1="87" y1="28" x2="87" y2="72"/>
        <line className="vgp-e-dark vgp-d2" x1="87" y1="72" x2="50" y2="93"/>
        <line className="vgp-e-dark vgp-d3" x1="50" y1="93" x2="13" y2="72"/>
        <line className="vgp-e-dark vgp-d4" x1="13" y1="72" x2="13" y2="28"/>
        <line className="vgp-e-dark vgp-d5" x1="13" y1="28" x2="50" y2="7"/>
        <line className="vgp-sp-dark vgp-d0" x1="50" y1="50" x2="50" y2="7"/>
        <line className="vgp-sp-dark vgp-d1" x1="50" y1="50" x2="87" y2="28"/>
        <line className="vgp-sp-dark vgp-d2" x1="50" y1="50" x2="87" y2="72"/>
        <line className="vgp-sp-dark vgp-d3" x1="50" y1="50" x2="50" y2="93"/>
        <line className="vgp-sp-dark vgp-d4" x1="50" y1="50" x2="13" y2="72"/>
        <line className="vgp-sp-dark vgp-d5" x1="50" y1="50" x2="13" y2="28"/>
        <circle className="vgp-hl" cx="50" cy="50" r="17"/>
        <circle cx="50" cy="50" r="7.5" fill="#f8c339"/>
        <circle className="vgp-nd-dark vgp-d0" cx="50" cy="7"  r="5.5"/>
        <circle className="vgp-nd-dark vgp-d1" cx="87" cy="28" r="5.5"/>
        <circle className="vgp-nd-dark vgp-d2" cx="87" cy="72" r="5.5"/>
        <circle className="vgp-nd-dark vgp-d3" cx="50" cy="93" r="5.5"/>
        <circle className="vgp-nd-dark vgp-d4" cx="13" cy="72" r="5.5"/>
        <circle className="vgp-nd-dark vgp-d5" cx="13" cy="28" r="5.5"/>
      </svg>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{texto}</p>
    </div>
  )
}

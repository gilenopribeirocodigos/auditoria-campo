// ================================================================
// COMPONENTES COMPARTILHADOS
// ================================================================
import { useEffect, useRef, useState } from 'react'

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

// Campo de escolha única com busca — botão que abre um painel com campo
// "Buscar..." + lista clicável (mesmo padrão visual do PCSearchSelect da
// Prestação de Contas, aqui reutilizável por qualquer módulo).
export function SearchSelect({ opcoes, valor, onSelecionar, placeholder = 'Selecione...' }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const opcoesFiltradas = busca
    ? opcoes.filter(o => o.toLowerCase().includes(busca.toLowerCase()))
    : opcoes

  const escolher = (op) => {
    onSelecionar(op)
    setAberto(false)
    setBusca('')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        className="form-input"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', textAlign: 'left',
          color: valor ? '#1e293b' : '#94a3b8',
          fontWeight: valor ? 700 : 500,
          borderColor: aberto ? '#3b82f6' : undefined,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{valor || placeholder}</span>
        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8, flexShrink: 0 }}>▼</span>
      </button>

      {aberto && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 280, overflowY: 'auto',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff' }}>
            <input
              type="text" autoFocus placeholder="Buscar..." value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', fontSize: 12,
                border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {opcoesFiltradas.length === 0 ? (
            <p style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Nenhum resultado</p>
          ) : opcoesFiltradas.map(op => {
            const sel = op === valor
            return (
              <button key={op} type="button" onClick={() => escolher(op)}
                style={{
                  display: 'block', width: '100%', padding: '9px 12px',
                  background: sel ? '#eff6ff' : 'none', border: 'none', borderBottom: '1px solid #f8fafc',
                  textAlign: 'left', cursor: 'pointer', fontSize: 12, color: '#1e293b', fontWeight: sel ? 700 : 500,
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'none' }}
              >{op}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}

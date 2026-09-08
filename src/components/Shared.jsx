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

// Campo de senha com "olhinho" pra mostrar/ocultar o valor digitado — mesmo
// padrão visual/ícones já usados em Login.jsx, reaproveitado aqui pra não
// duplicar em cada tela que pede senha (Alterar Senha, Definir Nova Senha,
// cadastro de usuário em Gestão de Usuários).
export function CampoSenha({ label, value, onChange, placeholder = '••••••••', required, autoFocus, hint }) {
  const [mostrar, setMostrar] = useState(false)
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}{required && ' *'}</label>}
      <div style={{ position: 'relative' }}>
        <input
          className="form-input" type={mostrar ? 'text' : 'password'} placeholder={placeholder}
          value={value} onChange={e => onChange(e.target.value)} autoFocus={autoFocus}
          style={{ paddingRight: 44 }}
        />
        <button type="button" onClick={() => setMostrar(v => !v)}
          aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
          style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0,
          }}>
          {mostrar ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l18 18" />
              <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-3.4 4.2M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.4-1" />
              <path d="M9.5 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-1.06" />
            </svg>
          )}
        </button>
      </div>
      {hint && <p style={{ fontSize: 11, color: '#94a3b8', margin: '5px 0 0' }}>{hint}</p>}
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
// `opcoes` aceita tanto strings simples (valor exibido == valor selecionado,
// ex.: lista de motivos) quanto objetos { value, label } quando o valor
// salvo precisa ser diferente do texto exibido (ex.: login vs. "Nome (login)").
export function SearchSelect({ opcoes, valor, onSelecionar, placeholder = 'Selecione...' }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const opcoesNorm = opcoes.map(o => typeof o === 'string' ? { value: o, label: o } : o)
  const opcoesFiltradas = busca
    ? opcoesNorm.filter(o => o.label.toLowerCase().includes(busca.toLowerCase()))
    : opcoesNorm
  const selecionado = opcoesNorm.find(o => o.value === valor)

  const escolher = (op) => {
    onSelecionar(op.value)
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
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selecionado ? selecionado.label : (valor || placeholder)}</span>
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
            const sel = op.value === valor
            return (
              <button key={op.value} type="button" onClick={() => escolher(op)}
                style={{
                  display: 'block', width: '100%', padding: '9px 12px',
                  background: sel ? '#eff6ff' : 'none', border: 'none', borderBottom: '1px solid #f8fafc',
                  textAlign: 'left', cursor: 'pointer', fontSize: 12, color: '#1e293b', fontWeight: sel ? 700 : 500,
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'none' }}
              >{op.label}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}

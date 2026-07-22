import { useEffect, useRef, useState } from 'react'

// Campo de escolha única com busca — mesmo padrão visual/interação do
// MultiSelect de src/components/PainelFiltros.jsx (botão "Todos" que abre
// um painel com campo "Buscar..." + lista clicável), só que copiado aqui
// (não importado) pra este módulo continuar isolado dos demais, e
// adaptado pra selecionar 1 valor em vez de vários.
export default function PCSearchSelect({ opcoes, valor, onSelecionar, placeholder = 'Selecione...' }) {
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

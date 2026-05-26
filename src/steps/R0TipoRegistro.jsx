import { TIPOS_REGISTRO } from '../data/registros_config.js'

export default function R0TipoRegistro({ form, upd, next }) {
  const selecionar = (tipo) => {
    upd('tipo', tipo)
    // DISCIPLINAR é sempre individual
    if (TIPOS_REGISTRO[tipo].apenasIndividual) {
      upd('modalidade', 'INDIVIDUAL')
    } else {
      upd('modalidade', '') // reset modalidade
    }
    next()
  }

  return (
    <div style={{ padding: '0 0 80px' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
          Qual tipo de registro?
        </h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Selecione o tipo de atividade a registrar
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.entries(TIPOS_REGISTRO).map(([key, tipo]) => (
          <button
            key={key}
            onClick={() => selecionar(key)}
            style={{
              background: form.tipo === key ? tipo.bg : '#fff',
              border: `2px solid ${form.tipo === key ? tipo.color : '#e2e8f0'}`,
              borderRadius: 14,
              padding: '16px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: tipo.bg, border: `1.5px solid ${tipo.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, flexShrink: 0,
            }}>
              {tipo.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: tipo.color, marginBottom: 2 }}>
                {tipo.label}
              </p>
              <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                {tipo.descricao}
              </p>
              {tipo.apenasIndividual && (
                <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: 6, fontWeight: 700, marginTop: 4, display: 'inline-block' }}>
                  Apenas individual
                </span>
              )}
            </div>
            <div style={{ fontSize: 18, color: form.tipo === key ? tipo.color : '#cbd5e1' }}>›</div>
          </button>
        ))}
      </div>
    </div>
  )
}

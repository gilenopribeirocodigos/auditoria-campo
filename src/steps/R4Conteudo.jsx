import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'

export default function R4Conteudo({ form, upd, next, prev }) {
  const tipoConfig = TIPOS_REGISTRO[form.tipo]
  const isDisciplinar = form.tipo === 'DISCIPLINAR'
  const isTreinamento = form.tipo === 'TREINAMENTO'

  const podeProsseguir = form.pauta.trim().length >= 10 &&
    (!isDisciplinar || form.tipo_medida)

  return (
    <div style={{ padding: '0 0 80px' }}>

      {/* Banner tipo */}
      <div style={{
        background: tipoConfig?.bg, border: `1.5px solid ${tipoConfig?.border}`,
        borderRadius: 10, padding: '10px 14px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 18 }}>{tipoConfig?.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tipoConfig?.color }}>
          {tipoConfig?.label}
        </span>
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
        {isDisciplinar ? 'Detalhes da Medida' : 'Conteúdo / Pauta'}
      </h2>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        {isDisciplinar
          ? 'Descreva o motivo e a medida aplicada'
          : 'Descreva o que foi abordado neste registro'}
      </p>

      {/* Tipo de medida — DISCIPLINAR */}
      {isDisciplinar && (
        <div className="form-group">
          <label className="form-label">Tipo de Medida *</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tipoConfig.tiposMedida.map(m => (
              <button key={m.value}
                onClick={() => upd('tipo_medida', m.value)}
                style={{
                  padding: '12px 14px', borderRadius: 10, textAlign: 'left',
                  border: `2px solid ${form.tipo_medida === m.value ? tipoConfig.color : '#e2e8f0'}`,
                  background: form.tipo_medida === m.value ? tipoConfig.bg : '#fff',
                  color: form.tipo_medida === m.value ? tipoConfig.color : '#374151',
                  fontSize: 14, fontWeight: form.tipo_medida === m.value ? 700 : 500,
                  cursor: 'pointer',
                }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tema — TREINAMENTO */}
      {isTreinamento && (
        <>
          <div className="form-group">
            <label className="form-label">Tema do Treinamento</label>
            <input className="form-input" value={form.tema}
              onChange={e => upd('tema', e.target.value)}
              placeholder="Ex: NR-10, Uso de EPI, Corte e Religa..." />
          </div>
          <div className="form-group">
            <label className="form-label">Carga Horária</label>
            <input className="form-input" value={form.carga_horaria}
              onChange={e => upd('carga_horaria', e.target.value)}
              placeholder="Ex: 2h, 30min, 4 horas" />
          </div>
        </>
      )}

      {/* Pauta / Descrição */}
      <div className="form-group">
        <label className="form-label">
          {isDisciplinar ? 'Descrição da Ocorrência *' : 'Pauta / O que foi abordado *'}
        </label>
        <textarea
          className="form-textarea"
          value={form.pauta}
          onChange={e => upd('pauta', e.target.value)}
          placeholder={
            isDisciplinar
              ? 'Descreva a ocorrência que motivou a medida disciplinar...'
              : form.tipo === 'DS'
                ? 'Descreva o tópico de segurança abordado, riscos identificados, orientações dadas...'
                : form.tipo === 'REUNIAO'
                  ? 'Descreva os indicadores apresentados, metas do período, resultados e próximos passos...'
                  : form.tipo === 'ALINHAMENTO'
                    ? 'Descreva as orientações, procedimentos e diretrizes alinhados com a equipe...'
                    : 'Descreva o conteúdo abordado...'
          }
          rows={6}
          style={{ resize: 'vertical' }}
        />
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
          {form.pauta.length} caracteres {form.pauta.length < 10 ? '(mínimo 10)' : '✅'}
        </p>
      </div>

      {/* Observações adicionais */}
      <div className="form-group">
        <label className="form-label">Observações (opcional)</label>
        <textarea
          className="form-textarea"
          value={form.observacoes}
          onChange={e => upd('observacoes', e.target.value)}
          placeholder="Informações adicionais relevantes..."
          rows={3}
        />
      </div>

      {/* Navegação */}
      <button onClick={next} disabled={!podeProsseguir} style={{
        width: '100%', padding: 14, borderRadius: 12, border: 'none',
        background: podeProsseguir ? '#1e3a5f' : '#e2e8f0',
        color: podeProsseguir ? '#fff' : '#94a3b8',
        fontSize: 15, fontWeight: 700,
        cursor: podeProsseguir ? 'pointer' : 'not-allowed',
        marginBottom: 10,
      }}>
        Continuar →
      </button>
      <button onClick={prev} style={{
        width: '100%', padding: 13, borderRadius: 10,
        border: '1px solid #e2e8f0', background: '#f8fafc',
        color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      }}>← Voltar</button>
    </div>
  )
}

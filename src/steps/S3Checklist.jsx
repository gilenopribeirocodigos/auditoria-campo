import { CHECKLISTS, CAT_META, isDisqualified } from '../data/checklists.js'
import { NavBar, Textarea } from '../components/Shared.jsx'

export default function S3Checklist({ form, upd, setForm, next, prev }) {
  const tipo = form.produtivo ? 'PRODUTIVO' : 'IMPRODUTIVO'
  const cl = CHECKLISTS[form.tipoServico]?.[tipo]
  if (!cl) return null

  const items = cl.items
  const respondidas = items.filter(i => form.respostas[i.id] !== undefined).length
  const simCount = items.filter(i => form.respostas[i.id] === true).length
  const notaParcial = respondidas > 0 ? Math.round(simCount / respondidas * 100) : 0
  const completo = respondidas === items.length
  const eliminado = isDisqualified(form)

  const responder = (id, val) =>
    setForm(f => ({ ...f, respostas: { ...f.respostas, [id]: val } }))

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
        padding: '12px 14px', marginBottom: 12,
      }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{CHECKLISTS[form.tipoServico].label}</p>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{cl.label} · {respondidas}/{items.length} respondidas</p>
        </div>
        {respondidas > 0 && (
          <div style={{
            background: '#f0f9ff', border: '1px solid #bae6fd',
            borderRadius: 10, padding: '6px 12px', textAlign: 'center', minWidth: 60,
          }}>
            <p style={{ fontSize: 10, color: '#0369a1', fontWeight: 700 }}>PARCIAL</p>
            <p style={{ fontSize: 24, fontWeight: 900, color: '#0284c7', lineHeight: 1.1 }}>{notaParcial}</p>
          </div>
        )}
      </div>

      {/* Alerta de eliminação automática */}
      {eliminado && (
        <div style={{
          background: '#450a0a', border: '2px solid #dc2626', borderRadius: 12,
          padding: '14px 16px', marginBottom: 14, textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🚫</div>
          <p style={{ color: '#fca5a5', fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
            AUDITORIA — NÃO ATENDE
          </p>
          <p style={{ color: '#fecaca', fontSize: 12, lineHeight: 1.5 }}>
            A equipe não executou o corte.<br />
            O resultado é automaticamente <strong>NÃO ATENDE</strong> independente das demais respostas.
          </p>
        </div>
      )}

      {/* Barra de progresso */}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${respondidas / items.length * 100}%` }} />
      </div>

      {/* Itens */}
      {items.map((item, idx) => {
        const r = form.respostas[item.id]
        const meta = CAT_META[item.cat]
        const isElim = item.disqualify
        return (
          <div key={item.id} className={`check-item ${r === true ? 'sim' : r === false ? 'nao' : ''}`}
            style={isElim ? { borderWidth: 2 } : {}}>
            <div className="check-item-body">
              <div className="check-item-meta">
                <span className={`badge ${meta.cls}`}>{meta.label}</span>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>#{idx + 1}</span>
                {isElim && (
                  <span style={{ fontSize: 10, background: '#dc2626', color: '#fff', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>
                    ELIMINATÓRIA
                  </span>
                )}
                {r === true && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, marginLeft: 'auto' }}>✓ Conforme</span>}
                {r === false && !isElim && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginLeft: 'auto' }}>✗ Não conforme</span>}
                {r === false && isElim && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 800, marginLeft: 'auto' }}>🚫 NÃO ATENDE</span>}
              </div>
              <p className="check-item-text" style={isElim ? { fontWeight: 600 } : {}}>{item.p}</p>
              {isElim && (
                <p style={{ fontSize: 11, color: '#ef4444', marginBottom: 8, background: '#fef2f2', padding: '4px 8px', borderRadius: 6 }}>
                  ⚠️ Se NÃO → resultado automaticamente NÃO ATENDE
                </p>
              )}
              <div className="check-item-btns">
                <button className={`btn-sim ${r === true ? 'active' : ''}`} onClick={() => responder(item.id, true)}>✓ SIM</button>
                <button className={`btn-nao ${r === false ? 'active' : ''}`} onClick={() => responder(item.id, false)}>✗ NÃO</button>
              </div>
            </div>
          </div>
        )
      })}

      {!completo && (
        <div className="alert alert-info" style={{ textAlign: 'center' }}>
          Responda todas as {items.length} perguntas para prosseguir
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <Textarea label="Feedback do Fiscal" value={form.feedback} onChange={v => upd('feedback', v)}
          placeholder="Observações gerais, comportamento da equipe, situações encontradas..." rows={3} />
      </div>

      <div style={{ height: 80 }} />
      <NavBar onPrev={prev} onNext={completo ? next : undefined} nextDisabled={!completo} />
    </div>
  )
}

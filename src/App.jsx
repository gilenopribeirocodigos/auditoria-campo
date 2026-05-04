import { useState } from 'react'
import { FORM_INICIAL } from './data/checklists.js'
import S0Selecao       from './steps/S0Selecao.jsx'
import S1Identificacao from './steps/S1Identificacao.jsx'
import S3Checklist     from './steps/S3Checklist.jsx'
import S4Fotos         from './steps/S4Fotos.jsx'
import S5Assinatura    from './steps/S5Assinatura.jsx'
import S6Resultado     from './steps/S6Resultado.jsx'

// GPS agora está integrado no passo de Identificação (S1)
// S2GPS removido do fluxo — 6 passos no total
const STEPS = ['Serviço', 'Identificação', 'Checklist', 'Evidências', 'Assinatura', 'Resultado']

export default function App() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(FORM_INICIAL())

  const upd = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const next = () => setStep(s => s + 1)
  const prev = () => setStep(s => s - 1)

  const stepProps = { form, upd, setForm, next, prev, setStep }

  return (
    <div className="app-shell">
      {/* HEADER */}
      <header className="app-header no-print">
        <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>
          DPL Construções — Equatorial Energia
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>
          Auditoria Operacional de Campo
        </div>
        <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i < step ? '#3b82f6' : i === step ? '#60a5fa' : 'rgba(255,255,255,0.2)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            {STEPS[step]} — {step + 1}/{STEPS.length}
          </span>
          {step > 0 && step < 5 && (
            <span style={{ fontSize: 11, opacity: 0.6 }}>
              {form.tipoServico && `${form.tipoServico} · ${form.produtivo ? 'Prod.' : 'Improd.'}`}
            </span>
          )}
        </div>
      </header>

      {/* CONTEÚDO */}
      <main className="app-content">
        {step === 0 && <S0Selecao       {...stepProps} />}
        {step === 1 && <S1Identificacao {...stepProps} />}
        {step === 2 && <S3Checklist     {...stepProps} />}
        {step === 3 && <S4Fotos         {...stepProps} />}
        {step === 4 && <S5Assinatura    {...stepProps} />}
        {step === 5 && <S6Resultado     {...stepProps} />}
      </main>
    </div>
  )
}

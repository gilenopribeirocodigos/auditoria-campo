import { useState } from 'react'
import { FORM_SESMT_INICIAL, STEPS_SESMT, TIPOS_ACAO_SESMT } from './data/sesmt_config.js'
import SS0Tipo          from './steps/sesmt/SS0Tipo.jsx'
import SS1Identificacao from './steps/sesmt/SS1Identificacao.jsx'
import SS2Evidencias    from './steps/sesmt/SS2Evidencias.jsx'
import SS3Participantes from './steps/sesmt/SS3Participantes.jsx'
import SS4Resultado     from './steps/sesmt/SS4Resultado.jsx'

export default function SesmtApp({ usuarioLogado, onVoltar }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(() => ({
    ...FORM_SESMT_INICIAL(),
    fiscal:           usuarioLogado?.nome    || '',
    matricula_fiscal: usuarioLogado?.matricula || '',
  }))
  const upd  = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const next = () => setStep(s => s + 1)
  const prev = () => setStep(s => Math.max(0, s - 1))
  const reiniciar = () => {
    setStep(0)
    setForm({
      ...FORM_SESMT_INICIAL(),
      fiscal:           usuarioLogado?.nome    || '',
      matricula_fiscal: usuarioLogado?.matricula || '',
    })
  }
  const tipoConfig = TIPOS_ACAO_SESMT[form.tipo]
  const stepProps  = { form, upd, setForm, next, prev }

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>Plataforma de Gestão Operacional</div>
          <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>🏠 Home</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>
          {tipoConfig ? `${tipoConfig.emoji} ${tipoConfig.label}` : '🦺 Ações SESMT'}
        </div>
        <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
          {STEPS_SESMT.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < step ? '#3b82f6' : i === step ? '#60a5fa' : 'rgba(255,255,255,0.2)', transition: 'background 0.3s' }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>{STEPS_SESMT[step]} — {step + 1}/{STEPS_SESMT.length}</span>
        </div>
      </header>
      <main className="app-content">
        {step === 0 && <SS0Tipo          {...stepProps} />}
        {step === 1 && <SS1Identificacao {...stepProps} />}
        {step === 2 && <SS2Evidencias    {...stepProps} />}
        {step === 3 && <SS3Participantes {...stepProps} />}
        {step === 4 && <SS4Resultado form={form} onConcluir={reiniciar} prev={prev} />}
      </main>
    </div>
  )
}

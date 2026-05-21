import { useState } from 'react'
import { FORM_REGISTRO_INICIAL, STEPS_REGISTRO, TIPOS_REGISTRO } from './data/registros_config.js'
import R0TipoRegistro  from './steps/R0TipoRegistro.jsx'
import R1Modalidade    from './steps/R1Modalidade.jsx'
import R2Identificacao from './steps/R2Identificacao.jsx'
import R3Participantes from './steps/R3Participantes.jsx'
import R4Conteudo      from './steps/R4Conteudo.jsx'
import R5Evidencias    from './steps/R5Evidencias.jsx'
import R6ResultadoReg  from './steps/R6ResultadoReg.jsx'

export default function RegistrosApp({ usuarioLogado, onVoltar, isOnline }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(() => ({
    ...FORM_REGISTRO_INICIAL(),
    fiscal:           usuarioLogado?.nome      || '',
    matricula_fiscal: usuarioLogado?.matricula || '',
  }))

  const upd  = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const next = () => setStep(s => s + 1)
  const prev = () => setStep(s => Math.max(0, s - 1))

  const reiniciar = () => {
    setStep(0)
    setForm({
      ...FORM_REGISTRO_INICIAL(),
      fiscal:           usuarioLogado?.nome      || '',
      matricula_fiscal: usuarioLogado?.matricula || '',
    })
  }

  const tipoConfig = TIPOS_REGISTRO[form.tipo]
  const stepProps  = { form, upd, setForm, next, prev }

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            DPL Construções — Equatorial Energia
          </div>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          }}>🏠 Home</button>
        </div>

        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>
          {tipoConfig ? `${tipoConfig.emoji} ${tipoConfig.label}` : '📝 Registros Operacionais'}
        </div>

        {/* Barra de progresso */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
          {STEPS_REGISTRO.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i < step ? '#3b82f6' : i === step ? '#60a5fa' : 'rgba(255,255,255,0.2)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            {STEPS_REGISTRO[step]} — {step + 1}/{STEPS_REGISTRO.length}
          </span>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="app-content">
        {step === 0 && <R0TipoRegistro  {...stepProps} />}
        {step === 1 && <R1Modalidade    {...stepProps} />}
        {step === 2 && <R2Identificacao {...stepProps} />}
        {step === 3 && <R3Participantes {...stepProps} />}
        {step === 4 && <R4Conteudo      {...stepProps} />}
        {step === 5 && <R5Evidencias    {...stepProps} />}
        {step === 6 && (
          <R6ResultadoReg
            form={form}
            onConcluir={reiniciar}
            prev={prev}
            isOnline={isOnline}
          />
        )}
      </main>
    </div>
  )
}

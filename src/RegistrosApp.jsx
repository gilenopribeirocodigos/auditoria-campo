import { useState } from 'react'
import { FORM_REGISTRO_INICIAL, STEPS_REGISTRO, TIPOS_REGISTRO } from './data/registros_config.js'
import { temPermissao } from './lib/auth.js'
import R0TipoRegistro  from './steps/R0TipoRegistro.jsx'
import R1Modalidade    from './steps/R1Modalidade.jsx'
import R2Identificacao from './steps/R2Identificacao.jsx'
import R3Participantes from './steps/R3Participantes.jsx'
import R4Conteudo      from './steps/R4Conteudo.jsx'
import R5Evidencias    from './steps/R5Evidencias.jsx'
import R6ResultadoReg  from './steps/R6ResultadoReg.jsx'
import AberturaOcorrencia from './pages/AberturaOcorrencia.jsx'
import EscolhaAberturaOcorrencia from './pages/EscolhaAberturaOcorrencia.jsx'
import ImportarOcorrenciasLote from './pages/ImportarOcorrenciasLote.jsx'

export default function RegistrosApp({ usuarioLogado, onVoltar, isOnline }) {
  const [step, setStep] = useState(0)
  // Abertura de Ocorrência não segue o wizard padrão (sem modalidade/
  // participantes/checklist) — é um fluxo à parte, aberto a partir do card
  // extra em R0TipoRegistro: primeiro uma telinha de escolha (manual x lote),
  // depois o formulário manual de sempre ou a importação em lote.
  const [modoOcorrencia, setModoOcorrencia] = useState(null) // null | 'escolha' | 'manual' | 'lote'
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

  if (modoOcorrencia === 'escolha') {
    return (
      <EscolhaAberturaOcorrencia
        usuarioLogado={usuarioLogado}
        onHome={onVoltar}
        onManual={() => setModoOcorrencia('manual')}
        onLote={() => setModoOcorrencia('lote')}
      />
    )
  }

  if (modoOcorrencia === 'manual') {
    return (
      <AberturaOcorrencia
        usuarioLogado={usuarioLogado}
        isOnline={isOnline}
        onHome={onVoltar}
        onVoltar={() => setModoOcorrencia('escolha')}
      />
    )
  }

  if (modoOcorrencia === 'lote') {
    return (
      <ImportarOcorrenciasLote
        usuarioLogado={usuarioLogado}
        onHome={onVoltar}
        onVoltar={() => setModoOcorrencia('escolha')}
      />
    )
  }

  return (
    <div className="app-shell">
      {/* Header — padrão VérticeGP (idêntico ao header da Auditoria em App.jsx) */}
      <header className="app-header no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Plataforma de Gestão Operacional
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
        {step === 0 && (
          <R0TipoRegistro
            {...stepProps}
            onAbrirOcorrencia={() => setModoOcorrencia(
              // Quem não tem a permissão de lote nem vê a telinha de escolha
              // — vai direto pro manual, igual já era antes dessa feature.
              temPermissao(usuarioLogado, 'importar_ocorrencias_lote') ? 'escolha' : 'manual'
            )}
          />
        )}
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

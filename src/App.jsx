import { useState } from 'react'
import { FORM_INICIAL } from './data/checklists.js'
import { getUsuarioLogado, fazerLogout, isAdmin } from './lib/auth.js'

import Login          from './pages/Login.jsx'
import GestaoUsuarios from './pages/GestaoUsuarios.jsx'
import S0Selecao       from './steps/S0Selecao.jsx'
import S1Identificacao from './steps/S1Identificacao.jsx'
import S2GPS           from './steps/S2GPS.jsx'
import S3Checklist     from './steps/S3Checklist.jsx'
import S4Fotos         from './steps/S4Fotos.jsx'
import S5Assinatura    from './steps/S5Assinatura.jsx'
import S6Resultado     from './steps/S6Resultado.jsx'

const STEPS = ['Serviço', 'Identificação', 'Checklist', 'Evidências', 'Assinatura', 'Resultado']

export default function App() {
  const [usuario,  setUsuario]  = useState(getUsuarioLogado)
  const [tela,     setTela]     = useState('home') // home | auditoria | gestao
  const [step,     setStep]     = useState(0)
  const [form,     setForm]     = useState(FORM_INICIAL())

  const upd  = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const next = () => setStep(s => s + 1)
  const prev = () => setStep(s => s - 1)

  const logout = () => { fazerLogout(); setUsuario(null) }
  const iniciarAuditoria = () => { setForm(FORM_INICIAL()); setStep(0); setTela('auditoria') }

  // Não logado → tela de login
  if (!usuario) return <Login onLogin={u => setUsuario(u)} />

  // Gestão de usuários (só ADMIN)
  if (tela === 'gestao') {
    return <GestaoUsuarios usuarioLogado={usuario} onVoltar={() => setTela('home')} />
  }

  // Home
  if (tela === 'home') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 24,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>⚡</div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
            Auditoria Operacional
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
            DPL Construções — Equatorial Energia
          </p>
        </div>

        {/* Card do usuário */}
        <div style={{
          background: 'rgba(255,255,255,0.1)', borderRadius: 14,
          padding: '14px 20px', marginBottom: 32, width: '100%', maxWidth: 380,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{usuario.nome}</p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
              {usuario.perfil} · {usuario.base_regiao}
            </p>
          </div>
          <button onClick={logout} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            padding: '7px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
          }}>
            Sair
          </button>
        </div>

        {/* Botões principais */}
        <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button onClick={iniciarAuditoria} style={{
            background: '#2563eb', color: '#fff', border: 'none',
            padding: '18px', borderRadius: 14, fontSize: 17, fontWeight: 800,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            📋 Iniciar Auditoria
          </button>

          {isAdmin(usuario) && (
            <button onClick={() => setTela('gestao')} style={{
              background: 'rgba(124,58,237,0.9)', color: '#fff', border: 'none',
              padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
              👥 Gestão de Usuários
            </button>
          )}
        </div>

        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 40 }}>
          Contrato 1021/2024 — v2.0
        </p>
      </div>
    )
  }

  // Fluxo de auditoria
  const stepProps = { form, upd, setForm, next, prev, setStep }
  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            DPL Construções — Equatorial Energia
          </div>
          <button onClick={() => setTela('home')} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          }}>
            🏠 Home
          </button>
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

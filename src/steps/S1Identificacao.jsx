import { SectionTitle, Field, NavBar } from '../components/Shared.jsx'

export default function S1Identificacao({ form, upd, next, prev }) {
  const ok = form.fiscal && form.matricula && form.prefixo && form.os && form.uc

  return (
    <div>
      <SectionTitle>Dados do Fiscal</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Data" value={form.data} onChange={v => upd('data', v)} type="date" />
        <Field label="Hora" value={form.hora} onChange={v => upd('hora', v)} type="time" />
      </div>

      <Field label="Nome do Fiscal" value={form.fiscal} onChange={v => upd('fiscal', v)}
        placeholder="Nome completo" required />
      <Field label="Matrícula" value={form.matricula} onChange={v => upd('matricula', v)}
        placeholder="Ex: 12345" required />

      <SectionTitle>Dados do Serviço</SectionTitle>

      <Field label="Prefixo da Equipe" value={form.prefixo} onChange={v => upd('prefixo', v)}
        placeholder="Ex: PI-001" required />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Nº da OS" value={form.os} onChange={v => upd('os', v)}
          placeholder="Ordem de Serviço" required />
        <Field label="Nº da UC" value={form.uc} onChange={v => upd('uc', v)}
          placeholder="Unidade Consumidora" required />
      </div>

      <Field label="Endereço" value={form.endereco} onChange={v => upd('endereco', v)}
        placeholder="Rua, nº, bairro, cidade" />

      <div style={{ height: 80 }} />
      <NavBar onPrev={prev} onNext={ok ? next : undefined} nextDisabled={!ok} />
    </div>
  )
}

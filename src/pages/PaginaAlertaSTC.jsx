import { useEffect, useState } from 'react'
import { buscarAlertaSTCPorToken, encerrarAlertaSTC } from '../lib/alertasSTC.js'

const cores = {
  azul: '#1e3a5f',
  azulClaro: '#2563eb',
  texto: '#172033',
  textoSuave: '#64748b',
  borda: '#dbe3ee',
  fundo: '#f4f7fb',
  verde: '#15803d',
  verdeFundo: '#dcfce7',
  amarelo: '#a16207',
  amareloFundo: '#fef3c7',
  vermelho: '#b91c1c',
  vermelhoFundo: '#fee2e2',
}

function formatarDataHora(valor) {
  if (!valor) return 'Não informado'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return valor
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Fortaleza',
  }).format(data)
}

function Campo({ rotulo, valor, destaque = false }) {
  return (
    <div style={{ padding: '11px 0', borderBottom: `1px solid ${cores.borda}` }}>
      <div style={{ color: cores.textoSuave, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {rotulo}
      </div>
      <div style={{ color: destaque ? cores.azulClaro : cores.texto, fontSize: 15, fontWeight: destaque ? 800 : 600, marginTop: 3, overflowWrap: 'anywhere' }}>
        {valor || 'Não informado'}
      </div>
    </div>
  )
}

function Cartao({ children, style = {} }) {
  return (
    <section style={{
      background: '#fff',
      border: `1px solid ${cores.borda}`,
      borderRadius: 16,
      boxShadow: '0 8px 28px rgba(30, 58, 95, 0.08)',
      padding: 20,
      ...style,
    }}>
      {children}
    </section>
  )
}

function EstadoCentral({ icone, titulo, texto, erro = false }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: cores.fundo }}>
      <Cartao style={{ maxWidth: 430, width: '100%', textAlign: 'center', padding: '38px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 14 }}>{icone}</div>
        <h1 style={{ margin: 0, color: erro ? cores.vermelho : cores.texto, fontSize: 21 }}>{titulo}</h1>
        <p style={{ margin: '12px 0 0', color: cores.textoSuave, fontSize: 14, lineHeight: 1.55 }}>{texto}</p>
      </Cartao>
    </div>
  )
}

export default function PaginaAlertaSTC({ token }) {
  const [alerta, setAlerta] = useState(null)
  const [encerradoPor, setEncerradoPor] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true

    async function carregar() {
      try {
        const registro = await buscarAlertaSTCPorToken(token)
        if (!ativo) return
        setAlerta(registro)
        setEncerradoPor(registro?.fiscal_nome || '')
      } catch (e) {
        if (ativo) setErro(e.message)
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => { ativo = false }
  }, [token])

  async function enviar(evento) {
    evento.preventDefault()
    setErro('')

    const nome = encerradoPor.trim()
    const motivo = justificativa.trim()
    if (!nome) {
      setErro('Informe o nome de quem está encerrando.')
      return
    }
    if (motivo.length < 10) {
      setErro('A justificativa precisa ter pelo menos 10 caracteres.')
      return
    }

    setSalvando(true)
    try {
      const atualizado = await encerrarAlertaSTC(token, nome, motivo)
      setAlerta(atualizado)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return <EstadoCentral icone="⏳" titulo="Consultando alerta" texto="Aguarde enquanto buscamos os dados da atividade." />
  }

  if (!alerta) {
    return <EstadoCentral icone="🔒" titulo="Alerta não encontrado" texto={erro || 'O link é inválido, expirou ou o alerta não está disponível.'} erro />
  }

  const encerrado = alerta.status_tratamento === 'ENCERRADO'
  const statusCor = encerrado ? cores.verde : cores.amarelo
  const statusFundo = encerrado ? cores.verdeFundo : cores.amareloFundo

  return (
    <div style={{ minHeight: '100vh', background: cores.fundo, fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ background: `linear-gradient(135deg, ${cores.azul}, ${cores.azulClaro})`, color: '#fff', padding: '24px 20px 42px' }}>
        <div style={{ maxWidth: 650, margin: '0 auto' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, opacity: 0.75, textTransform: 'uppercase' }}>
            Supervisão de atividades
          </div>
          <h1 style={{ fontSize: 23, margin: '7px 0 4px', lineHeight: 1.2 }}>Tratamento de alerta</h1>
          <div style={{ fontSize: 13, opacity: 0.8 }}>{alerta.codigo_alerta}</div>
        </div>
      </header>

      <main style={{ maxWidth: 650, margin: '-22px auto 0', padding: '0 16px 36px', display: 'grid', gap: 16 }}>
        <Cartao>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <div>
              <div style={{ color: cores.textoSuave, fontSize: 12, fontWeight: 700 }}>STATUS</div>
              <div style={{ color: cores.texto, fontSize: 18, fontWeight: 800, marginTop: 2 }}>
                {encerrado ? 'Atendimento concluído' : 'Aguardando tratamento'}
              </div>
            </div>
            <span style={{ background: statusFundo, color: statusCor, borderRadius: 999, padding: '7px 11px', fontSize: 12, fontWeight: 800 }}>
              {alerta.status_tratamento}
            </span>
          </div>

          <Campo rotulo="Fiscal responsável" valor={alerta.fiscal_nome || alerta.lider} />
          <Campo rotulo="Equipe / recurso" valor={alerta.recurso} />
          <Campo rotulo="Ordem de serviço" valor={alerta.ordem_servico} destaque />
          <Campo rotulo="Atividade" valor={alerta.tipo_atividade} />
          <Campo rotulo="Grupo da atividade" valor={alerta.grupo_atividade} />
          <Campo rotulo="Início da atividade" valor={alerta.inicio_atividade} />
          <Campo rotulo="Tempo apurado" valor={alerta.tempo_apurado_hhmmss} destaque />
          <Campo rotulo="Limite programado" valor={alerta.tempo_limite_min != null ? `${alerta.tempo_limite_min} minutos` : null} />
          <Campo rotulo="Alerta criado em" valor={formatarDataHora(alerta.criado_em)} />
        </Cartao>

        {encerrado ? (
          <Cartao style={{ borderColor: '#86efac' }}>
            <div style={{ color: cores.verde, fontSize: 18, fontWeight: 800, marginBottom: 5 }}>✅ Alerta encerrado</div>
            <p style={{ color: cores.textoSuave, fontSize: 13, lineHeight: 1.5, margin: '0 0 10px' }}>
              O tratamento já foi registrado e não pode ser sobrescrito por este link.
            </p>
            <Campo rotulo="Encerrado por" valor={alerta.encerrado_por} />
            <Campo rotulo="Data do encerramento" valor={formatarDataHora(alerta.encerrado_em)} />
            <Campo rotulo="Justificativa" valor={alerta.justificativa_encerramento} />
          </Cartao>
        ) : (
          <Cartao>
            <h2 style={{ color: cores.texto, fontSize: 18, margin: '0 0 5px' }}>Encerrar atendimento</h2>
            <p style={{ color: cores.textoSuave, fontSize: 13, lineHeight: 1.5, margin: '0 0 18px' }}>
              Registre quem tratou o alerta e justifique o tempo de execução da atividade.
            </p>

            <form onSubmit={enviar}>
              <label style={{ display: 'block', color: cores.texto, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Nome de quem está encerrando
              </label>
              <input
                value={encerradoPor}
                onChange={e => setEncerradoPor(e.target.value)}
                maxLength={120}
                autoComplete="name"
                disabled={salvando}
                style={{
                  width: '100%', boxSizing: 'border-box', border: `1px solid ${cores.borda}`,
                  borderRadius: 10, padding: '12px 13px', color: cores.texto, fontSize: 15,
                  outlineColor: cores.azulClaro, marginBottom: 16,
                }}
              />

              <label style={{ display: 'block', color: cores.texto, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Justificativa do tempo de execução
              </label>
              <textarea
                value={justificativa}
                onChange={e => setJustificativa(e.target.value)}
                maxLength={2000}
                rows={5}
                placeholder="Descreva o que foi verificado e qual providência foi tomada."
                disabled={salvando}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical',
                  border: `1px solid ${cores.borda}`, borderRadius: 10, padding: '12px 13px',
                  color: cores.texto, fontSize: 15, lineHeight: 1.45, outlineColor: cores.azulClaro,
                }}
              />
              <div style={{ textAlign: 'right', color: cores.textoSuave, fontSize: 11, marginTop: 4 }}>
                {justificativa.length}/2000
              </div>

              {erro && (
                <div role="alert" style={{ background: cores.vermelhoFundo, color: cores.vermelho, borderRadius: 10, padding: '11px 13px', fontSize: 13, fontWeight: 700, marginTop: 12 }}>
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={salvando}
                style={{
                  width: '100%', border: 0, borderRadius: 11, padding: '14px 16px',
                  background: salvando ? '#94a3b8' : cores.verde, color: '#fff',
                  fontSize: 15, fontWeight: 800, cursor: salvando ? 'wait' : 'pointer',
                  marginTop: 16,
                }}
              >
                {salvando ? 'Salvando encerramento...' : '✅ Justificar e encerrar'}
              </button>
            </form>
          </Cartao>
        )}

        <div style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center', paddingTop: 2 }}>
          VérticeGP · Registro rastreável no banco de dados
        </div>
      </main>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Field, Textarea, SearchSelect } from '../components/Shared.jsx'
import { prepararPayloadOcorrencia, salvarOcorrenciaBD, listarFiscaisParaDirecionamento } from '../lib/ocorrencias.js'
import { salvarOcorrenciaOffline } from '../lib/ocorrencias_offline.js'

// Mesmo padrão de marca d'água usado em processarFotoEvidencia
// (TratamentoNaoConformidades.jsx) / R5Evidencias.jsx — data/hora, prefixo
// e quem abriu gravados na própria imagem.
function processarFotoOcorrencia(file, prefixo, abertoPor) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width  = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)

        const agora = new Date()
        const ts = agora.toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
        const fontSize = Math.max(18, Math.round(img.width * 0.032))
        const pad = 10
        const lineH = fontSize + 8
        const linhas = [ts, 'Ocorrência — Almoxarifado']
        if (prefixo)   linhas.push(`Equipe: ${prefixo}`)
        if (abertoPor) linhas.push(`Aberto por: ${abertoPor}`)
        const boxH = linhas.length * lineH + pad * 2
        const boxY = img.height - boxH - 10

        ctx.fillStyle = 'rgba(0,0,0,0.65)'
        ctx.fillRect(0, boxY, img.width, boxH + 10)
        ctx.font = `bold ${fontSize}px monospace`
        linhas.forEach((linha, i) => {
          const y = boxY + pad + fontSize + i * lineH
          ctx.fillStyle = 'rgba(0,0,0,0.8)'
          ctx.fillText(linha, pad + 2, y + 2)
          ctx.fillStyle = i === 0 ? '#ffffff' : '#a5b4fc'
          ctx.fillText(linha, pad, y)
        })
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// Campo de fiscal/supervisor destino: online, busca em `usuarios` (mesma
// fonte usada em GestaoPauta.jsx pra escolher o fiscal de uma pauta);
// offline (ou se a busca falhar), cai pra digitação livre — mesmo padrão
// online/offline do PrefixoInputValidado em S1Identificacao.jsx.
function CampoFiscalDestino({ nome, matricula, onNome, onMatricula }) {
  const [fiscais,   setFiscais]   = useState([])
  const [carregado, setCarregado] = useState(false)
  const [semLista,  setSemLista]  = useState(false)

  useEffect(() => {
    listarFiscaisParaDirecionamento()
      .then(data => { setFiscais(data); setCarregado(true) })
      .catch(() => { setSemLista(true); setCarregado(true) })
  }, [])

  if (semLista || (carregado && fiscais.length === 0)) {
    return (
      <div className="form-group">
        <label className="form-label">Direcionar para (Fiscal/Supervisor) *</label>
        <input className="form-input" value={nome}
          onChange={e => onNome(e.target.value.toUpperCase())}
          placeholder="Nome completo" />
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
          📵 Sem conexão para buscar a lista — digite o nome manualmente.
        </p>
      </div>
    )
  }

  return (
    <div className="form-group">
      <label className="form-label">Direcionar para (Fiscal/Supervisor) *</label>
      <SearchSelect
        opcoes={fiscais.map(f => ({
          value: f.nome,
          label: f.matricula ? `${f.nome} (${f.matricula})` : f.nome,
        }))}
        valor={nome}
        onSelecionar={v => {
          onNome(v)
          const achado = fiscais.find(f => f.nome === v)
          onMatricula(achado?.matricula || '')
        }}
        placeholder={carregado ? 'Selecione o fiscal...' : 'Carregando...'}
      />
    </div>
  )
}

export default function AberturaOcorrencia({ usuarioLogado, isOnline, onHome, onVoltar }) {
  const [prefixo,            setPrefixo]            = useState('')
  const [eletricistaEquipe,  setEletricistaEquipe]  = useState('')
  const [direcionadoPara,    setDirecionadoPara]    = useState('')
  const [matriculaDestino,   setMatriculaDestino]   = useState('')
  const [descricao,          setDescricao]          = useState('')
  const [foto,                setFoto]              = useState(null)
  const [status,              setStatus]            = useState('idle') // idle | saving | saved | error
  const [erro,                setErro]              = useState('')
  const [salvoOffline,        setSalvoOffline]      = useState(false)

  const online = isOnline !== undefined ? isOnline : navigator.onLine

  const podeEnviar = prefixo.trim() && direcionadoPara.trim() && descricao.trim().length > 0

  const addFoto = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await processarFotoOcorrencia(file, prefixo, usuarioLogado?.nome)
    setFoto(url)
    e.target.value = ''
  }

  const enviar = async () => {
    if (!podeEnviar) return
    setStatus('saving')
    setErro('')

    const form = {
      prefixo:                   prefixo.trim().toUpperCase(),
      eletricista_equipe:        eletricistaEquipe.trim(),
      direcionado_para:          direcionadoPara.trim(),
      matricula_fiscal_destino:  matriculaDestino,
      descricao:                 descricao.trim(),
      foto,
      aberto_por:                usuarioLogado?.nome || '',
      matricula_aberto_por:      usuarioLogado?.matricula || '',
    }

    if (!online) {
      try {
        await salvarOcorrenciaOffline(form)
        setSalvoOffline(true)
        setStatus('saved')
      } catch (err) {
        setErro('Erro ao salvar offline: ' + err.message)
        setStatus('error')
      }
      return
    }

    try {
      const payload = await prepararPayloadOcorrencia(form)
      await salvarOcorrenciaBD(payload)
      setSalvoOffline(false)
      setStatus('saved')
    } catch (err) {
      console.error('Erro ao salvar ocorrência:', err)
      setErro(err.message || 'Erro ao salvar. Verifique a conexão.')
      setStatus('error')
    }
  }

  const reiniciar = () => {
    setPrefixo(''); setEletricistaEquipe(''); setDirecionadoPara(''); setMatriculaDestino('')
    setDescricao(''); setFoto(null); setStatus('idle'); setErro(''); setSalvoOffline(false)
  }

  return (
    <div className="app-shell">
      <header className="app-header no-print" style={{ background: '#4338ca' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Plataforma de Gestão Operacional
          </div>
          <button onClick={onHome} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          }}>🏠 Home</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>📦 Abertura de Ocorrência</div>
        <p style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          Relate o problema e direcione para o fiscal tratar
        </p>
      </header>

      <main className="app-content">
        <div style={{ padding: '0 0 80px' }}>

          {!online && (
            <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e', fontWeight: 700 }}>
              📵 Sem internet — a ocorrência será salva localmente e enviada quando a conexão voltar.
            </div>
          )}

          {status === 'saved' ? (
            <>
              <div style={{ background: salvoOffline ? '#fef3c7' : '#eef2ff', border: `1.5px solid ${salvoOffline ? '#fcd34d' : '#c7d2fe'}`, borderRadius: 14, padding: '18px 16px', marginBottom: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{salvoOffline ? '📵' : '✅'}</div>
                <p style={{ color: salvoOffline ? '#92400e' : '#3730a3', fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
                  {salvoOffline ? 'Ocorrência salva localmente!' : 'Ocorrência enviada com sucesso!'}
                </p>
                <p style={{ color: '#64748b', fontSize: 12 }}>
                  {salvoOffline
                    ? 'Quando a internet voltar, será enviada automaticamente ao fiscal.'
                    : `Direcionada para ${direcionadoPara} — ela aparecerá pendente na tela de Tratamento de Não Conformidades.`}
                </p>
              </div>
              <button onClick={reiniciar} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#4338ca', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
                + Abrir Nova Ocorrência
              </button>
              <button onClick={onVoltar} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                ← Voltar
              </button>
            </>
          ) : (
            <>
              <Field label="Prefixo / Equipe" value={prefixo} onChange={v => setPrefixo(v.toUpperCase())}
                placeholder="Ex: PI-THE-C001M" required />

              <Field label="Eletricista(s) envolvido(s)" value={eletricistaEquipe} onChange={setEletricistaEquipe}
                placeholder="Opcional — nome(s) do(s) eletricista(s)" />

              <CampoFiscalDestino
                nome={direcionadoPara} matricula={matriculaDestino}
                onNome={setDirecionadoPara} onMatricula={setMatriculaDestino}
              />

              <Textarea label="Descrição da ocorrência *" value={descricao} onChange={setDescricao}
                placeholder="Descreva o que aconteceu (ex: devolução de medidor antigo não realizada)..." rows={4} />

              <div className="form-group">
                <label className="form-label">Foto (opcional)</label>
                {foto ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={foto} alt="Evidência" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, border: '1px solid #e2e8f0' }} />
                    <button onClick={() => setFoto(null)} style={{
                      position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%',
                      background: '#dc2626', color: '#fff', border: '2px solid #fff', fontSize: 14, cursor: 'pointer',
                    }}>×</button>
                  </div>
                ) : (
                  <label style={{ cursor: 'pointer' }}>
                    <input type="file" accept="image/*" capture="environment" onChange={addFoto} style={{ display: 'none' }} />
                    <div className="upload-zone">
                      <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                      <p style={{ color: '#4338ca', fontWeight: 700, fontSize: 13 }}>Tirar ou anexar foto</p>
                    </div>
                  </label>
                )}
              </div>

              {erro && (
                <div className="alert alert-danger" style={{ marginBottom: 14 }}>❌ {erro}</div>
              )}

              <button onClick={enviar} disabled={!podeEnviar || status === 'saving'} style={{
                width: '100%', padding: 14, borderRadius: 12, border: 'none',
                background: (!podeEnviar || status === 'saving') ? '#e2e8f0' : (online ? '#4338ca' : '#dc2626'),
                color: (!podeEnviar || status === 'saving') ? '#94a3b8' : '#fff',
                fontSize: 15, fontWeight: 700, cursor: (!podeEnviar || status === 'saving') ? 'not-allowed' : 'pointer',
                marginBottom: 10,
              }}>
                {status === 'saving' ? '⏳ Enviando...' : online ? '📦 Enviar Ocorrência' : '📵 Salvar Offline'}
              </button>
              <button onClick={onVoltar} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                ← Cancelar
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

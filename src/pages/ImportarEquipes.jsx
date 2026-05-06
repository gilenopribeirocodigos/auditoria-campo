import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

function parseCsv(text) {
  const linhas = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  const [header, ...rows] = linhas
  const cols = header.split(';').map(c => c.trim().toLowerCase())
  return rows.map(row => {
    const vals = row.split(';')
    return cols.reduce((obj, col, i) => ({ ...obj, [col]: (vals[i] || '').trim() }), {})
  })
}

export default function ImportarEquipes({ onVoltar }) {
  const [arquivo,   setArquivo]   = useState(null)
  const [preview,   setPreview]   = useState([])
  const [status,    setStatus]    = useState('idle') // idle | loading | success | error
  const [msg,       setMsg]       = useState('')
  const [progresso, setProgresso] = useState(0)

  const onFile = e => {
    const file = e.target.files[0]
    if (!file) return
    setArquivo(file)
    setStatus('idle'); setMsg('')
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target.result
      const rows = parseCsv(text)
      setPreview(rows.slice(0, 5))
    }
    reader.readAsText(file, 'latin1')
  }

  const importar = async () => {
    if (!arquivo) return
    setStatus('loading'); setMsg(''); setProgresso(0)

    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const rows = parseCsv(ev.target.result)
        const ativos = rows.filter(r => r.descr_situacao?.toUpperCase() === 'ATIVO')

        // Limpa tabela antes de reimportar
        await supabase.from('estrutura_equipes').delete().neq('id', 0)

        // Insere em lotes de 100
        const LOTE = 100
        for (let i = 0; i < ativos.length; i += LOTE) {
          const lote = ativos.slice(i, i + LOTE).map(r => ({
            regional:       r.regional      || '',
            polo:           r.polo          || '',
            base:           r.base          || '',
            prefixo:        r.prefixo       || '',
            matricula:      r.matricula     || '',
            colaborador:    r.colaborador   || '',
            descr_situacao: r.descr_situacao|| '',
            placas:         r.placas        || '',
            tipo_equipe:    r.tipo_equipe   || '',
            superv_campo:   r.superv_campo  || '',
            superv_operacao:r.superv_operacao|| '',
            coordenador:    r.coordenador   || '',
          }))
          await supabase.from('estrutura_equipes').insert(lote)
          setProgresso(Math.round(((i + LOTE) / ativos.length) * 100))
        }

        setStatus('success')
        setMsg(`✅ ${ativos.length} registros importados com sucesso!`)
      } catch (err) {
        setStatus('error')
        setMsg('❌ Erro: ' + err.message)
      }
    }
    reader.readAsText(arquivo, 'latin1')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0f766e, #14b8a6)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>
            ← Voltar para Home
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>📥 Importar Estrutura de Equipes</h1>
          <p style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            Importa prefixos e eletricistas do arquivo CSV da Equatorial
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px' }}>

        {/* Zona de upload */}
        <label style={{ cursor: 'pointer', display: 'block' }}>
          <input type="file" accept=".csv" onChange={onFile} style={{ display: 'none' }} />
          <div style={{
            border: '2px dashed #99f6e4', borderRadius: 14, padding: 28,
            textAlign: 'center', background: arquivo ? '#f0fdfa' : '#fff',
            marginBottom: 16, transition: 'all 0.2s',
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📂</div>
            <p style={{ color: '#0f766e', fontWeight: 700, fontSize: 15 }}>
              {arquivo ? arquivo.name : 'Clique para selecionar o arquivo CSV'}
            </p>
            <p style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
              Formato: separado por ponto-e-vírgula (;) — codificação Latin-1
            </p>
          </div>
        </label>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="card" style={{ marginBottom: 16, overflowX: 'auto' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
              Preview (5 primeiros registros):
            </p>
            {preview.map((r, i) => (
              <div key={i} style={{
                fontSize: 11, color: '#475569', padding: '6px 0',
                borderBottom: i < preview.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}>
                <strong>{r.prefixo}</strong> · {r.matricula} · {r.colaborador} · {r.base} · {r.descr_situacao}
              </div>
            ))}
          </div>
        )}

        {/* Progresso */}
        {status === 'loading' && (
          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
              ⏳ Importando... {progresso}%
            </p>
            <div style={{ background: '#e2e8f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{ height: 8, borderRadius: 4, background: '#14b8a6', width: `${progresso}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* Mensagem resultado */}
        {msg && (
          <div style={{
            background: status === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${status === 'success' ? '#86efac' : '#fecaca'}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 16,
            fontSize: 14, fontWeight: 600,
            color: status === 'success' ? '#15803d' : '#b91c1c',
          }}>
            {msg}
          </div>
        )}

        {/* Botão importar */}
        {arquivo && status !== 'loading' && (
          <button onClick={importar} style={{
            width: '100%', padding: 14, borderRadius: 12, border: 'none',
            background: '#0f766e', color: '#fff', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', marginBottom: 10,
          }}>
            {status === 'success' ? '🔄 Reimportar Arquivo' : '📥 Importar Agora'}
          </button>
        )}

        {/* Info */}
        <div className="alert alert-info" style={{ fontSize: 12 }}>
          ℹ️ A importação substitui todos os dados anteriores. Apenas colaboradores com status <strong>ATIVO</strong> são importados. Após importar, os prefixos e nomes dos eletricistas aparecerão com autocomplete nas auditorias.
        </div>
      </div>
    </div>
  )
}

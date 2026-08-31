import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { temPermissao } from '../lib/auth.js'
import { listarPessoasSesmt, importarPessoasSesmt } from '../lib/sesmt.js'

// Aceita cabeçalhos variados (CHAPA/MATRICULA, NOME/COLABORADOR) — normaliza
// acento/caixa antes de casar com as colunas esperadas.
const normChave = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim()

const ALIAS_CHAPA = ['chapa', 'matricula']
const ALIAS_NOME  = ['nome', 'colaborador', 'nome_colaborador']

function extrairChapaNome(linhaObj) {
  const chaves = Object.keys(linhaObj).reduce((acc, k) => { acc[normChave(k)] = linhaObj[k]; return acc }, {})
  const chapaKey = ALIAS_CHAPA.find(a => chaves[a] !== undefined)
  const nomeKey  = ALIAS_NOME.find(a => chaves[a] !== undefined)
  return { chapa: chapaKey ? String(chaves[chapaKey] ?? '').trim() : '', nome: nomeKey ? String(chaves[nomeKey] ?? '').trim() : '' }
}

function parseCsvTexto(texto) {
  const linhas = texto.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (linhas.length === 0) return []
  const sep = linhas[0].includes(';') ? ';' : ','
  const cols = linhas[0].split(sep).map(c => c.trim())
  return linhas.slice(1).map(linha => {
    const vals = linha.split(sep)
    return cols.reduce((obj, col, i) => ({ ...obj, [col]: (vals[i] || '').trim() }), {})
  })
}

export default function SesmtCargaPessoas({ usuarioLogado, onVoltar }) {
  const podeCarregar = temPermissao(usuarioLogado, 'sesmt_acesso')

  const [pessoas,   setPessoas]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [linhas,    setLinhas]    = useState([])
  const [status,    setStatus]    = useState('idle') // idle | lido | importando | ok | erro
  const [msg,       setMsg]       = useState('')

  const carregar = async () => {
    setLoading(true)
    try { setPessoas(await listarPessoasSesmt()) }
    catch (e) { setMsg('Erro ao carregar lista: ' + e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { carregar() }, [])

  const onFile = e => {
    const file = e.target.files[0]
    if (!file) return
    setStatus('idle')
    setMsg('')
    setLinhas([])

    const ext = file.name.split('.').pop().toLowerCase()
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        let objs = []
        if (ext === 'xlsx' || ext === 'xls') {
          const wb = XLSX.read(ev.target.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          objs = XLSX.utils.sheet_to_json(ws, { defval: '' })
        } else {
          let texto
          try { texto = new TextDecoder('utf-8', { fatal: true }).decode(ev.target.result) }
          catch { texto = new TextDecoder('windows-1252').decode(ev.target.result) }
          objs = parseCsvTexto(texto)
        }
        const extraidas = objs.map(extrairChapaNome).filter(l => l.chapa && l.nome)
        if (extraidas.length === 0) {
          setStatus('erro')
          setMsg('Nenhuma linha com CHAPA e NOME reconhecida. Confira o cabeçalho da planilha (aceita CHAPA/MATRICULA e NOME/COLABORADOR).')
          return
        }
        setLinhas(extraidas)
        setStatus('lido')
        setMsg(`✅ Arquivo lido: ${extraidas.length} pessoa(s) reconhecida(s) de ${objs.length} linha(s).`)
      } catch (err) {
        setStatus('erro')
        setMsg('Erro ao ler arquivo: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const importar = async () => {
    if (linhas.length === 0) return
    if (!window.confirm(
      `Confirma a importação de ${linhas.length} pessoa(s)?\n\n` +
      'Quem já está na lista tem o nome atualizado.\n' +
      'Quem não vier mais no arquivo fica marcado como inativo (não é removido).'
    )) return
    setStatus('importando')
    setMsg('')
    try {
      const resumo = await importarPessoasSesmt(linhas, usuarioLogado?.login)
      setStatus('ok')
      setMsg(`✅ Importação concluída: ${resumo.importadas} carregada(s), ${resumo.inativadas} marcada(s) como inativa(s).`)
      setLinhas([])
      await carregar()
    } catch (e) {
      setStatus('erro')
      setMsg('❌ ' + e.message)
    }
  }

  if (!podeCarregar) {
    return <div style={cardStyle}>Seu perfil não tem permissão para acessar o módulo Ações SESMT.</div>
  }

  const ativos = pessoas.filter(p => p.ativo)
  const inativos = pessoas.filter(p => !p.ativo)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 12px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: 0 }}>🦺 Ações SESMT — Lista de Pessoas</h1>
        <button onClick={onVoltar} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
          ← Home
        </button>
      </div>

      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.5 }}>
        Lista própria deste módulo (CHAPA + NOME), independente da Estrutura Operacional.
        Será usada para o preenchimento de participantes nas ações do SESMT (Diálogo de Segurança,
        Treinamento, Reciclagem).
      </p>

      <div style={cardStyle}>
        <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>📤 Carregar planilha</p>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
          Arquivo Excel (.xlsx) ou CSV com colunas <strong>CHAPA</strong> e <strong>NOME</strong>.
        </p>

        <input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={onFile} style={{ marginBottom: 12 }} />

        {msg && (
          <div style={{
            background: status === 'erro' ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${status === 'erro' ? '#fecaca' : '#86efac'}`,
            borderRadius: 10, padding: '10px 14px', fontSize: 13,
            color: status === 'erro' ? '#b91c1c' : '#15803d', marginBottom: 14,
          }}>
            {msg}
          </div>
        )}

        {linhas.length > 0 && (
          <>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 14 }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={thStyle}>CHAPA</th>
                    <th style={thStyle}>NOME</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(0, 30).map((l, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>{l.chapa}</td>
                      <td style={tdStyle}>{l.nome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {linhas.length > 30 && (
                <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '6px 0' }}>
                  ...e mais {linhas.length - 30} linha(s).
                </p>
              )}
            </div>

            <button onClick={importar} disabled={status === 'importando'} style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none',
              background: '#0f766e', color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: status === 'importando' ? 'not-allowed' : 'pointer',
              opacity: status === 'importando' ? 0.6 : 1,
            }}>
              {status === 'importando' ? '⏳ Importando...' : `Importar ${linhas.length} pessoa(s)`}
            </button>
          </>
        )}
      </div>

      <div style={cardStyle}>
        <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>
          👥 Lista atual — {loading ? '...' : `${ativos.length} ativa(s)`}{inativos.length > 0 ? `, ${inativos.length} inativa(s)` : ''}
        </p>
        {loading ? (
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Carregando...</p>
        ) : ativos.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma pessoa carregada ainda.</p>
        ) : (
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {ativos.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <span style={{ color: '#1e293b', fontWeight: 600 }}>{p.nome}</span>
                <span style={{ color: '#64748b' }}>{p.chapa}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const cardStyle = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
  padding: 18, marginBottom: 16,
}
const thStyle = { textAlign: 'left', padding: '6px 10px', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0' }
const tdStyle = { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', color: '#1e293b' }

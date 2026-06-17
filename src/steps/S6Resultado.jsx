import { useState, useRef } from 'react'
import { CHECKLISTS, CAT_META, calcNota, getStatus, isDisqualified, isItemConforme, getItemsNaoConformes, getChecklist, getItemsAtivos, FORM_INICIAL } from '../data/checklists.js'
import { InfoRow, StatCard } from '../components/Shared.jsx'
import { uploadBase64, salvarAuditoriaBD, atualizarAuditoriaBD, supabase } from '../lib/supabase.js'
import { salvarAuditoriaOffline } from '../lib/offline.js'

export default function S6Resultado({ form, setForm, setStep, onAuditoriaSalva, auditoriaEditandoId, fotosAntigas, isOnline }) {
  const nota      = calcNota(form)
  const st        = getStatus(nota)
  const cl        = getChecklist(form.tipoServico, form.tipoAuditoria, form.produtivo)
  const items     = getItemsAtivos(cl?.items || [], form)
  const eliminado = isDisqualified(form)

  const sim     = items.filter(i => isItemConforme(i, items, form.respostas)).length
  const nao     = items.length - sim
  const ncItems = getItemsNaoConformes(form)

  const [saveStatus,      setSaveStatus]      = useState('idle')
  const [saveError,       setSaveError]       = useState('')
  const [capturando,      setCapturando]      = useState(false)
  const [salvoOffline,    setSalvoOffline]    = useState(false)
  const [fotosUrlsSalvas, setFotosUrlsSalvas] = useState([])

  const printAreaRef = useRef(null)
  const modoEdicao   = !!auditoriaEditandoId
  const online       = isOnline !== undefined ? isOnline : navigator.onLine

  const cats = ['COMPORTAMENTO', 'QUALIDADE', 'DESEMPENHO']
  const catStats = cats.map(cat => {
    const catItems = items.filter(i => i.cat === cat)
    const catSim   = catItems.filter(i => isItemConforme(i, items, form.respostas)).length
    const pct      = catItems.length > 0 ? Math.round(catSim / catItems.length * 100) : 0
    return { cat, total: catItems.length, sim: catSim, pct }
  }).filter(c => c.total > 0)

  const catBarColor = pct => pct >= 90 ? '#16a34a' : pct >= 80 ? '#d97706' : '#dc2626'
  const nova = () => { setForm(FORM_INICIAL()); setStep(0) }

  const labelTipoAuditoria = form.tipoAuditoria === 'DESEMPENHO'
    ? '📊 Desempenho Operacional'
    : form.tipoAuditoria === 'POS_SERVICO'
      ? '✅ Pós Serviço'
      : '—'

  const msgEliminado = form.tipoServico === 'CORTE'
    ? '🚫 EQUIPE NÃO EXECUTOU O CORTE'
    : '🚫 EQUIPE NÃO EXECUTOU A ATIVIDADE'

  // ── Gera imagem para WhatsApp ─────────────────────────────────────────────
  const gerarImagemWhatsApp = async () => {
    setCapturando(true)
    try {
      const html2canvas = (await import('html2canvas')).default

      const catColor = cat => ({
        COMPORTAMENTO: { bg: '#dbeafe', color: '#1d4ed8' },
        QUALIDADE:     { bg: '#dcfce7', color: '#15803d' },
        DESEMPENHO:    { bg: '#fef3c7', color: '#92400e' },
      }[cat] || { bg: '#f1f5f9', color: '#374151' })

      const barCor = pct => pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626'

      const infoRow = (label, value) => value ? `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <span style="color:#64748b;font-weight:700;font-size:16px;min-width:120px;flex-shrink:0;">${label}</span>
          <span style="color:#0f172a;font-weight:800;font-size:16px;text-align:right;flex:1;padding-left:10px;">${value}</span>
        </div>` : ''

      const fotosParaExibir = !salvoOffline ? fotosUrlsSalvas : []

      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:20px;box-sizing:border-box;width:520px;">

          ${eliminado ? `<div style="background:#dc2626;color:#fff;padding:10px 16px;border-radius:10px;margin-bottom:14px;font-size:15px;font-weight:800;text-align:center;letter-spacing:0.3px;">${msgEliminado}</div>` : ''}

          <div style="background:${st.bg};border:3px solid ${st.border};border-radius:18px;padding:24px;text-align:center;margin-bottom:16px;">
            <div style="font-size:52px;margin-bottom:8px;">${st.icon}</div>
            <div style="font-size:64px;font-weight:900;color:${st.color};line-height:1;">${nota.toFixed(0)}</div>
            <div style="font-size:15px;color:${st.color};font-weight:600;margin-bottom:4px;">pontos</div>
            <div style="font-size:26px;font-weight:900;color:${st.color};margin-bottom:8px;">${st.label}</div>
            <div style="font-size:17px;color:${st.color};font-weight:800;line-height:1.4;">${labelTipoAuditoria} — ${CHECKLISTS[form.tipoServico]?.label} — ${form.produtivo ? 'Produtivo' : 'Improdutivo'}</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;">
            <div style="background:#dcfce7;border-radius:14px;padding:16px;text-align:center;">
              <div style="font-size:34px;font-weight:900;color:#16a34a;">${sim}</div>
              <div style="font-size:13px;color:#16a34a;font-weight:700;">Conformes</div>
            </div>
            <div style="background:#fee2e2;border-radius:14px;padding:16px;text-align:center;">
              <div style="font-size:34px;font-weight:900;color:#dc2626;">${nao}</div>
              <div style="font-size:13px;color:#dc2626;font-weight:700;">Não conf.</div>
            </div>
            <div style="background:#eff6ff;border-radius:14px;padding:16px;text-align:center;">
              <div style="font-size:34px;font-weight:900;color:#2563eb;">${items.length}</div>
              <div style="font-size:13px;color:#2563eb;font-weight:700;">Total itens</div>
            </div>
          </div>

          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:17px;font-weight:900;color:#1e293b;margin:0 0 14px 0;">Por Categoria</p>
            ${catStats.map(c => {
              const cc = catColor(c.cat)
              return `
              <div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="background:${cc.bg};color:${cc.color};padding:4px 12px;border-radius:8px;font-size:13px;font-weight:800;">${CAT_META[c.cat].label}</span>
                  <span style="font-size:15px;font-weight:800;color:#374151;">${c.sim}/${c.total} — ${c.pct}%</span>
                </div>
                <div style="background:#f1f5f9;border-radius:8px;height:14px;overflow:hidden;">
                  <div style="width:${c.pct}%;height:14px;background:${barCor(c.pct)};border-radius:8px;"></div>
                </div>
              </div>`
            }).join('')}
          </div>

          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:17px;font-weight:900;color:#1e293b;margin:0 0 12px 0;">Dados da Auditoria</p>
            ${infoRow('Tipo Auditoria', labelTipoAuditoria)}
            ${infoRow('Tipo de Serviço', CHECKLISTS[form.tipoServico]?.label)}
            ${infoRow('Status do Serviço', form.produtivo ? 'Produtivo' : 'Improdutivo')}
            ${infoRow('Fiscal',         form.fiscal)}
            ${infoRow('Matrícula',      form.matricula)}
            ${infoRow('Equipe',         form.prefixo)}
            ${infoRow('OS',             form.os)}
            ${infoRow('UC',             form.uc)}
            ${infoRow('Endereço',       form.endereco)}
            ${infoRow('Data / Hora',    `${form.data} às ${form.hora}`)}
            ${form.lat              ? infoRow('GPS',           `${form.lat}, ${form.lng}`) : ''}
            ${form.nomeEletricista  ? infoRow('Eletricista 1', form.nomeEletricista)        : ''}
            ${form.nomeEletricista2 ? infoRow('Eletricista 2', form.nomeEletricista2)       : ''}
          </div>

          ${ncItems.length > 0 ? `
          <div style="background:#fff0f0;border:3px solid #dc2626;border-radius:16px;padding:20px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
              <span style="font-size:24px;">❌</span>
              <p style="font-size:18px;font-weight:900;color:#b91c1c;margin:0;">
                Itens Não Conformes (${ncItems.length})
              </p>
            </div>
            ${ncItems.map((item, i) => `
              <div style="
                background:#fef2f2;
                border-left:5px solid #dc2626;
                border-radius:0 10px 10px 0;
                padding:12px 14px;
                margin-bottom:${i < ncItems.length - 1 ? '10px' : '0'};
                line-height:1.5;
              ">
                <span style="font-size:16px;font-weight:900;color:#991b1b;">${i + 1}. </span>
                <span style="font-size:16px;font-weight:700;color:#991b1b;">${item.p}</span>
              </div>`).join('')}
          </div>` : ''}

          ${form.feedback || form.observacoes ? `
          <div style="background:#fffbeb;border:2px solid #fcd34d;border-radius:16px;padding:18px;margin-bottom:16px;">
            ${form.feedback ? `
              <p style="font-size:14px;font-weight:900;color:#92400e;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.5px;">Feedback do Fiscal:</p>
              <p style="font-size:17px;color:#1e293b;font-weight:600;line-height:1.6;margin:0 0 ${form.observacoes ? '16px' : '0'} 0;">${form.feedback}</p>` : ''}
            ${form.observacoes ? `
              <p style="font-size:14px;font-weight:900;color:#92400e;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.5px;">Observações:</p>
              <p style="font-size:17px;color:#1e293b;font-weight:600;line-height:1.6;margin:0;">${form.observacoes}</p>` : ''}
          </div>` : ''}

          ${fotosParaExibir.length > 0 ? `
          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:17px;font-weight:900;color:#1e293b;margin:0 0 14px 0;">📷 Registro Fotográfico (${fotosParaExibir.length})</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
              ${fotosParaExibir.map((url, i) => `
                <img src="${url}" alt="Foto ${i+1}" crossorigin="anonymous"
                  style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid #e2e8f0;display:block;"/>
              `).join('')}
            </div>
          </div>` : ''}

          ${form.assinatura ? `
          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:16px;font-weight:900;color:#1e293b;margin:0 0 10px 0;">Assinatura — ${form.nomeEletricista || 'Eletricista 1'}</p>
            <img src="${form.assinatura}" style="width:100%;border-radius:10px;border:1px solid #f1f5f9;background:#fafafa;display:block;" />
            <p style="font-size:12px;color:#94a3b8;text-align:center;margin:8px 0 0 0;">Registrado em ${form.data} às ${form.hora}</p>
          </div>` : ''}

          ${form.assinatura2 ? `
          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:16px;font-weight:900;color:#1e293b;margin:0 0 10px 0;">Assinatura — ${form.nomeEletricista2 || 'Eletricista 2'}</p>
            <img src="${form.assinatura2}" style="width:100%;border-radius:10px;border:1px solid #f1f5f9;background:#fafafa;display:block;" />
            <p style="font-size:12px;color:#94a3b8;text-align:center;margin:8px 0 0 0;">Registrado em ${form.data} às ${form.hora}</p>
          </div>` : ''}

          <div style="border-top:2px solid #e2e8f0;padding-top:14px;text-align:center;">
            <p style="font-size:13px;color:#64748b;margin:0;font-weight:700;">VérticeGP · Plataforma de Gestão Operacional</p>
            <p style="font-size:12px;color:#cbd5e1;margin:4px 0 0 0;">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
          </div>

        </div>`

      const div = document.createElement('div')
      div.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;'
      div.innerHTML = html
      document.body.appendChild(div)

      if (fotosParaExibir.length > 0) {
        const imgs = div.querySelectorAll('img[crossorigin]')
        await Promise.allSettled(Array.from(imgs).map(img =>
          new Promise(res => {
            if (img.complete) res()
            else { img.onload = res; img.onerror = res }
          })
        ))
      }

      const canvas = await html2canvas(div.firstElementChild, {
        scale:           5,
        useCORS:         true,
        allowTaint:      true,
        backgroundColor: '#f0f4f8',
        logging:         false,
        windowWidth:     520,
      })

      document.body.removeChild(div)

      const nomeArquivo = `Auditoria_${form.prefixo}_OS${form.os}_${form.data}.png`.replace(/\s+/g, '_')

      if (navigator.share && navigator.canShare) {
        canvas.toBlob(async blob => {
          const file = new File([blob], nomeArquivo, { type: 'image/png' })
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Auditoria ${form.prefixo}`,
              text:  `Auditoria de Campo — ${form.prefixo} — OS ${form.os} — ${st.label}`,
            })
          } else { baixarImagem(canvas, nomeArquivo) }
        }, 'image/png')
      } else { baixarImagem(canvas, nomeArquivo) }

    } catch (err) {
      console.error('Erro ao gerar imagem:', err)
      alert('Não foi possível gerar a imagem. Tente novamente.')
    } finally {
      setCapturando(false)
    }
  }

  const baixarImagem = (canvas, nomeArquivo) => {
    const link = document.createElement('a')
    link.download = nomeArquivo
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const montarPayload = () => ({
    fiscal:            form.fiscal,
    matricula:         form.matricula,
    prefixo:           form.prefixo,
    os:                form.os,
    uc:                form.uc,
    endereco:          form.endereco,
    lat:               form.lat,
    lng:               form.lng,
    data_auditoria:    form.data,
    hora_auditoria:    form.hora,
    tipo_auditoria:    form.tipoAuditoria,
    tipo_servico:      form.tipoServico,
    produtivo:         form.produtivo,
    debito_pago:       form.debitoPago,
    nota,
    status:            st.label,
    respostas:         form.respostas,
    feedback:          form.feedback,
    observacoes:       form.observacoes,
    nome_eletricista:  form.nomeEletricista,
    nome_eletricista2: form.nomeEletricista2 || null,
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Sincroniza as Não Conformidades da auditoria com a tabela auditorias_nao_conformes
  // - Nova auditoria: só INSERT
  // - Reabertura (modoEdicao=true): DELETE das antigas + INSERT das atuais
  //   (porque as respostas podem ter mudado e NCs antigas podem não ser mais NCs)
  // - Cada linha agora leva também os dados de identificação da auditoria
  //   (fiscal, matrícula, prefixo, OS, UC, eletricista 1 e 2), denormalizados
  //   para facilitar relatórios e a tela de tratamento de NCs sem precisar
  //   de JOIN com a tabela `auditorias`.
  // - Falhas são silenciosas (console.warn) pra não bloquear o salvar da auditoria
  // ═══════════════════════════════════════════════════════════════════════════
  const sincronizarNCs = async (auditoriaId, ncs, isEdicao) => {
    try {
      // Em modo edição: limpa NCs antigas antes de inserir as novas
      if (isEdicao) {
        const { error: delErr } = await supabase
          .from('auditorias_nao_conformes')
          .delete()
          .eq('auditoria_id', auditoriaId)
        if (delErr) {
          console.warn('⚠️ Erro ao limpar NCs antigas:', delErr.message)
        }
      }

      // Insere as NCs atuais (se houver), já com os campos de identificação
      if (ncs && ncs.length > 0) {
        const linhas = ncs.map(item => ({
          auditoria_id:      auditoriaId,
          item_id:           String(item.id ?? ''),
          item_texto:        item.p || '',
          fiscal:            form.fiscal           || null,
          matricula:         form.matricula        || null,
          prefixo:           form.prefixo          || null,
          os:                form.os               || null,
          uc:                form.uc               || null,
          nome_eletricista:  form.nomeEletricista   || null,
          nome_eletricista2: form.nomeEletricista2  || null,
        }))
        const { error: insErr } = await supabase
          .from('auditorias_nao_conformes')
          .upsert(linhas, {
            onConflict:       'auditoria_id,item_id',
            ignoreDuplicates: true,
          })
        if (insErr) {
          console.warn('⚠️ Erro ao salvar NCs na tabela auditorias_nao_conformes:', insErr.message)
        } else {
          console.log(`✅ ${linhas.length} NC(s) salvas em auditorias_nao_conformes`)
        }
      }
    } catch (e) {
      console.warn('⚠️ Erro ao sincronizar NCs (tabela pode não existir):', e.message)
    }
  }

  const salvar = async () => {
    setSaveStatus('saving')
    setSaveError('')

    if (!online && !modoEdicao) {
      try {
        const payload      = montarPayload()
        const fotosBase64  = form.fotos.map(f => f.url)
        const assinBase64  = form.assinatura  || null
        const assin2Base64 = form.assinatura2 || null
        await salvarAuditoriaOffline(payload, fotosBase64, assinBase64, assin2Base64)
        setSalvoOffline(true)
        setSaveStatus('saved')
        if (onAuditoriaSalva) onAuditoriaSalva(null)
      } catch (err) {
        setSaveError('Erro ao salvar offline: ' + err.message)
        setSaveStatus('error')
      }
      return
    }

    try {
      const auditId = modoEdicao
        ? auditoriaEditandoId
        : `${Date.now()}_OS${form.os}_${form.prefixo}`.replace(/\s+/g, '_')

      const fotosNovas = []
      for (let i = 0; i < form.fotos.length; i++) {
        const url = await uploadBase64(form.fotos[i].url, `${auditId}/foto_${Date.now()}_${i + 1}.jpg`)
        fotosNovas.push(url)
      }
      const fotosUrls = modoEdicao ? [...(fotosAntigas || []), ...fotosNovas] : fotosNovas
      setFotosUrlsSalvas(fotosUrls)

      let assinaturaUrl  = null
      let assinatura2Url = null
      if (form.assinatura)  assinaturaUrl  = await uploadBase64(form.assinatura,  `${auditId}/assinatura_1.png`)
      if (form.assinatura2) assinatura2Url = await uploadBase64(form.assinatura2, `${auditId}/assinatura_2.png`)

      const payload = {
        ...montarPayload(),
        fotos_urls: fotosUrls,
        ...(assinaturaUrl  && { assinatura_url:  assinaturaUrl  }),
        ...(assinatura2Url && { assinatura2_url: assinatura2Url }),
      }

      let saved
      if (modoEdicao) {
        saved = await atualizarAuditoriaBD(auditoriaEditandoId, payload)
      } else {
        saved = await salvarAuditoriaBD(payload)
      }

      // ─── Sincroniza Não Conformidades na tabela auxiliar ───
      // (Falha silenciosa: não bloqueia o sucesso do salvar da auditoria)
      if (saved?.id) {
        await sincronizarNCs(saved.id, ncItems, modoEdicao)
      }

      setSaveStatus('saved')
      if (onAuditoriaSalva) onAuditoriaSalva(saved.id)

    } catch (err) {
      console.error('Erro ao salvar:', err)
      setSaveError(err.message || 'Erro ao salvar. Verifique a conexão.')
      setSaveStatus('error')
    }
  }

  return (
    <div>
      <div ref={printAreaRef} className="print-area" style={{ background: '#f0f4f8', padding: 16, borderRadius: 12 }}>

        {modoEdicao && (
          <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e', fontWeight: 700 }}>
            ✏️ Modo edição — auditoria reaberta para correção
          </div>
        )}

        {!online && !modoEdicao && (
          <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e', fontWeight: 700 }}>
            📵 Sem internet — auditoria e fotos serão salvas localmente e enviadas ao banco quando a conexão voltar
          </div>
        )}

        <div className="result-card" style={{ background: st.bg, borderColor: st.border }}>
          {eliminado && (
            <div style={{ fontSize: 11, background: '#dc2626', color: '#fff', padding: '3px 12px', borderRadius: 8, marginBottom: 10, display: 'inline-block', fontWeight: 700 }}>
              {msgEliminado}
            </div>
          )}
          <div style={{ fontSize: 50, marginBottom: 8 }}>{st.icon}</div>
          <div className="result-score" style={{ color: st.color }}>{nota.toFixed(0)}</div>
          <div style={{ fontSize: 13, color: st.color, fontWeight: 500 }}>pontos</div>
          <div className="result-label" style={{ color: st.color }}>{st.label}</div>
          <div style={{ fontSize: 12, color: st.color, marginTop: 6, opacity: 0.8 }}>
            {labelTipoAuditoria} — {CHECKLISTS[form.tipoServico]?.label} — {form.produtivo ? 'Produtivo' : 'Improdutivo'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
          <StatCard label="Conformes"   value={sim}          color="#16a34a" />
          <StatCard label="Não conf."   value={nao}          color="#dc2626" />
          <StatCard label="Total itens" value={items.length} color="#2563eb" />
        </div>

        <div className="card">
          <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Por Categoria</p>
          {catStats.map(c => (
            <div key={c.cat} className="cat-bar">
              <div className="cat-bar-header">
                <span className={`badge ${CAT_META[c.cat].cls}`}>{CAT_META[c.cat].label}</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{c.sim}/{c.total} — {c.pct}%</span>
              </div>
              <div className="cat-bar-track">
                <div className="cat-bar-fill" style={{ width: `${c.pct}%`, background: catBarColor(c.pct) }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Dados da Auditoria</p>
          <InfoRow label="Tipo Auditoria" value={labelTipoAuditoria} />
          <InfoRow label="Tipo de Serviço"  value={CHECKLISTS[form.tipoServico]?.label} />
          <InfoRow label="Status do Serviço" value={form.produtivo ? 'Produtivo' : 'Improdutivo'} />
          <InfoRow label="Fiscal"         value={form.fiscal} />
          <InfoRow label="Matrícula"      value={form.matricula} />
          <InfoRow label="Equipe"         value={form.prefixo} />
          <InfoRow label="OS"             value={form.os} />
          <InfoRow label="UC"             value={form.uc} />
          <InfoRow label="Endereço"       value={form.endereco} />
          <InfoRow label="Data / Hora"    value={`${form.data} às ${form.hora}`} />
          {form.lat              && <InfoRow label="GPS"           value={`${form.lat}, ${form.lng}`} />}
          {form.nomeEletricista  && <InfoRow label="Eletricista 1" value={form.nomeEletricista} />}
          {form.nomeEletricista2 && <InfoRow label="Eletricista 2" value={form.nomeEletricista2} />}
        </div>

        {ncItems.length > 0 && (
          <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginBottom: 10 }}>❌ Itens Não Conformes ({ncItems.length})</p>
            {ncItems.map((item, i) => (
              <div key={item.id} style={{ fontSize: 12, color: '#991b1b', padding: '5px 0', borderBottom: i < ncItems.length - 1 ? '1px solid #fecaca' : 'none', lineHeight: 1.5 }}>
                <strong>{i + 1}.</strong> {item.p}
                {item.inverted && <span style={{ fontSize: 10, color: '#7c3aed', marginLeft: 6 }}>(invertida)</span>}
              </div>
            ))}
          </div>
        )}

        {(form.feedback || form.observacoes) && (
          <div className="card">
            {form.feedback && <>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>FEEDBACK DO FISCAL:</p>
              <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, marginBottom: form.observacoes ? 12 : 0 }}>{form.feedback}</p>
            </>}
            {form.observacoes && <>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>OBSERVAÇÕES:</p>
              <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{form.observacoes}</p>
            </>}
          </div>
        )}

        {modoEdicao && fotosAntigas?.length > 0 && (
          <div style={{ marginBottom: 14 }} data-fotos="antigas">
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📁 Fotos anteriores ({fotosAntigas.length})</p>
            <div className="photo-grid">
              {fotosAntigas.map((url, i) => (
                <div key={i} className="photo-thumb">
                  <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Foto anterior ${i + 1}`} /></a>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(15,118,110,0.7)', color: '#fff', fontSize: 9, padding: '2px 4px', textAlign: 'center' }}>Anterior {i + 1}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {form.fotos.length > 0 && (
          <div style={{ marginBottom: 14 }} data-fotos="novas">
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
              {modoEdicao ? `📷 Novas fotos (${form.fotos.length})` : `Registro Fotográfico (${form.fotos.length})`}
            </p>
            <div className="photo-grid">
              {form.fotos.map((foto, i) => (
                <div key={i} className="photo-thumb">
                  <img src={foto.url} alt={`Foto ${i + 1}`} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 9, padding: '2px 4px', textAlign: 'center' }}>
                    {modoEdicao ? `Nova ${i + 1}` : `Foto ${i + 1}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {form.assinatura && (
          <div className="card">
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Assinatura — {form.nomeEletricista || 'Eletricista 1'}</p>
            <img src={form.assinatura} alt="Assinatura 1" style={{ width: '100%', borderRadius: 8, border: '1px solid #f1f5f9', background: '#fafafa' }} />
            <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 6 }}>Registrado em {form.data} às {form.hora}</p>
          </div>
        )}

        {form.assinatura2 && (
          <div className="card">
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Assinatura — {form.nomeEletricista2 || 'Eletricista 2'}</p>
            <img src={form.assinatura2} alt="Assinatura 2" style={{ width: '100%', borderRadius: 8, border: '1px solid #f1f5f9', background: '#fafafa' }} />
            <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 6 }}>Registrado em {form.data} às {form.hora}</p>
          </div>
        )}

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginBottom: 8, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>VérticeGP · Plataforma de Gestão Operacional</p>
          <p style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>Gerado em {new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
        </div>
      </div>

      {/* ── AÇÕES ── */}
      <div className="no-print" style={{ marginBottom: 40, marginTop: 16 }}>

        {saveStatus === 'idle' && (
          <>
            <button className="btn-primary" onClick={salvar}
              style={{ background: modoEdicao ? '#d97706' : online ? '#1e3a5f' : '#dc2626', marginBottom: 10, fontSize: 16 }}>
              {modoEdicao ? '💾 Salvar Correção' : online ? '💾 Salvar Auditoria' : '📵 Salvar Offline'}
            </button>
            <button className="btn-secondary" onClick={() => setStep(4)} style={{ marginBottom: 10 }}>← Voltar e editar</button>
          </>
        )}

        {saveStatus === 'saving' && (
          <button className="btn-primary" disabled style={{ background: '#64748b', marginBottom: 10, fontSize: 16 }}>
            {online ? '⏳ Salvando no banco de dados...' : '⏳ Salvando localmente...'}
          </button>
        )}

        {saveStatus === 'error' && (
          <>
            <div className="alert alert-danger" style={{ marginBottom: 10 }}>❌ {saveError}</div>
            <button className="btn-primary" onClick={salvar} style={{ background: '#dc2626', marginBottom: 10 }}>🔄 Tentar novamente</button>
            <button className="btn-secondary" onClick={() => setStep(4)} style={{ marginBottom: 10 }}>← Voltar e editar</button>
          </>
        )}

        {saveStatus === 'saved' && (
          <>
            <div style={{
              background: salvoOffline ? '#fef3c7' : '#f0fdf4',
              border: `1px solid ${salvoOffline ? '#fcd34d' : '#86efac'}`,
              borderRadius: 12, padding: '14px 16px', marginBottom: 14, textAlign: 'center',
            }}>
              <p style={{ color: salvoOffline ? '#92400e' : '#15803d', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                {salvoOffline ? '📵 Auditoria salva localmente!' : modoEdicao ? '✅ Correção salva com sucesso!' : '✅ Auditoria salva com sucesso!'}
              </p>
              <p style={{ color: '#64748b', fontSize: 11 }}>
                {salvoOffline
                  ? 'Quando a internet voltar, será enviada automaticamente ao banco de dados com todas as fotos.'
                  : modoEdicao ? 'Auditoria corrigida e fechada novamente.' : 'Dados e fotos enviados ao banco. Esta auditoria não pode mais ser alterada.'}
              </p>
              {salvoOffline && (
                <p style={{ color: '#92400e', fontSize: 10, marginTop: 6, fontStyle: 'italic' }}>
                  ℹ️ No modo offline a imagem compartilhada não incluirá as fotos (apenas o resultado, dados e assinatura).
                </p>
              )}
            </div>

            <button className="btn-primary" onClick={gerarImagemWhatsApp} disabled={capturando}
              style={{ background: capturando ? '#64748b' : '#25d366', marginBottom: 10 }}>
              {capturando ? '⏳ Gerando imagem...' : '📸 Compartilhar no WhatsApp'}
            </button>

            <button className="btn-primary" onClick={() => window.print()} style={{ background: '#7c3aed', marginBottom: 10 }}>
              🖨️ Gerar PDF / Imprimir
            </button>

            <button className="btn-primary" onClick={nova} style={{ background: '#15803d' }}>
              + Iniciar Nova Auditoria
            </button>
          </>
        )}
      </div>
    </div>
  )
}

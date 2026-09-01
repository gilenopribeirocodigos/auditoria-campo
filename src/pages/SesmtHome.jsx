export default function SesmtHome({ onNovaAcao, onGerenciarPessoas, onHistorico, onMotivos, podeConfigurarMotivos, onVoltar }) {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 12px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: 0 }}>🦺 Ações SESMT</h1>
        <button onClick={onVoltar} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>← Home</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button onClick={onNovaAcao} style={{
          background: 'linear-gradient(135deg, rgba(217,119,6,0.95), rgba(146,64,14,0.9))', color: '#fff', border: 'none',
          padding: '20px 16px', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        }}>
          <span style={{ fontSize: 26 }}>➕</span>
          <div>
            <div>Nova Ação</div>
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.85, marginTop: 2 }}>Diálogo de Segurança, Treinamento ou Reciclagem</div>
          </div>
        </button>

        <button onClick={onGerenciarPessoas} style={{
          background: '#fff', color: '#1e293b', border: '1.5px solid #e2e8f0',
          padding: '20px 16px', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        }}>
          <span style={{ fontSize: 26 }}>👥</span>
          <div>
            <div>Lista de Pessoas</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginTop: 2 }}>Carregar/atualizar CHAPA e NOME</div>
          </div>
        </button>

        <button onClick={onHistorico} style={{
          background: '#fff', color: '#1e293b', border: '1.5px solid #e2e8f0',
          padding: '20px 16px', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        }}>
          <span style={{ fontSize: 26 }}>📂</span>
          <div>
            <div>Histórico</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginTop: 2 }}>Ver ações registradas e assinaturas coletadas</div>
          </div>
        </button>

        {podeConfigurarMotivos && (
          <button onClick={onMotivos} style={{
            background: '#fff', color: '#1e293b', border: '1.5px solid #e2e8f0',
            padding: '20px 16px', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
          }}>
            <span style={{ fontSize: 26 }}>⚙️</span>
            <div>
              <div>Motivos</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginTop: 2 }}>Cadastrar/editar motivos por tipo de ação</div>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

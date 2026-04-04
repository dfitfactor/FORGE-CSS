import { redirect } from 'next/navigation'
import { getPortalClientOrRedirect, getPortalProtocol } from '@/lib/client-portal'

export default async function PortalProtocolPage({
  params,
}: {
  params: { protocolId: string }
}) {
  const { client } = await getPortalClientOrRedirect()
  const protocol = await getPortalProtocol(client.id, params.protocolId)

  if (!protocol) {
    redirect('/portal/dashboard')
  }

  const payload = protocol.protocol_payload ?? protocol.content ?? null

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <section style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>{protocol.name ?? 'My Protocol'}</h1>
        <p style={{ color: '#777', fontSize: 14, marginBottom: 0 }}>
          Generated {new Date(protocol.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </section>

      <section style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#ddd', fontSize: 13, lineHeight: 1.6 }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      </section>
    </div>
  )
}

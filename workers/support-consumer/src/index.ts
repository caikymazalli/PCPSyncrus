export interface Env {
  DB: D1Database
}

interface SupportTicket {
  id: string
  empresa_id: string
  empresa_name: string | null
  user_id: string
  created_by_name: string | null
  created_by_email: string | null
  assigned_to_user_id: string | null
  atendente_id: string | null
  atendente_name: string | null
  title: string
  description: string
  priority: string
  status: string
  created_at: string
  updated_at: string
  resolved_at: string | null
  due_at: string | null
  last_activity_at: string
}

interface SupportTicketMessage {
  type: 'support_ticket'
  correlationId?: string
  ticket: SupportTicket
  enqueuedAt?: string
}

/** Allowed columns for INSERT — prevents SQL injection from arbitrary keys. */
const ALLOWED_COLUMNS: ReadonlyArray<keyof SupportTicket> = [
  'id', 'empresa_id', 'empresa_name', 'user_id', 'created_by_name', 'created_by_email',
  'assigned_to_user_id', 'atendente_id', 'atendente_name',
  'title', 'description', 'priority', 'status',
  'created_at', 'updated_at', 'resolved_at', 'due_at', 'last_activity_at',
]

async function insertSupportTicket(db: D1Database, ticket: SupportTicket): Promise<void> {
  const keys = ALLOWED_COLUMNS.filter((col) => col in ticket)
  const vals = keys.map((col) => ticket[col] ?? null)
  await db
    .prepare(
      `INSERT INTO support_tickets (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
    )
    .bind(...vals)
    .run()
}

export default {
  async queue(batch: MessageBatch<SupportTicketMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const body = msg.body
      const correlationId: string = body?.correlationId || body?.ticket?.id || '?'
      try {
        if (!body || body.type !== 'support_ticket' || !body.ticket) {
          console.warn(`[support-consumer][${correlationId}] Mensagem com tipo inválido ou sem ticket — descartando`)
          msg.ack()
          continue
        }
        if (!body.ticket.id) {
          console.error(`[support-consumer][${correlationId}] Payload sem id — descartando`)
          msg.ack()
          continue
        }
        await insertSupportTicket(env.DB, body.ticket)
        console.log(`[support-consumer][${correlationId}] Ticket persistido em D1 com sucesso`)
        msg.ack()
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        console.error(`[support-consumer][${correlationId}] Falha ao persistir no D1: ${message} — agendando retry`)
        msg.retry()
      }
    }
  },
}

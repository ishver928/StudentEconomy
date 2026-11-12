'use server';
import { revalidatePath } from 'next/cache';
import { isValidId } from '@/lib/checkout';
import { query } from '@/lib/db';
import { getStudent } from '@/lib/student';

export type MessageState = { error?: string; sent?: number };

// Private messages between two students with an accepted connection. Demo identity only.
export async function sendMessage(prev: MessageState, form: FormData): Promise<MessageState> {
  const student = await getStudent();
  if (!student) return { error: 'Please finish setting up your profile first.' };
  const connectionId = String(form.get('connectionId') ?? '');
  const body = String(form.get('body') ?? '').replace(/\r\n/g, '\n').trim();
  if (!isValidId(connectionId)) return { error: 'Conversation not found.' };
  if (!body) return { error: 'Write a message first.' };
  if (body.length > 1000) return { error: 'Keep messages under 1,000 characters.' };
  const [recent] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM messages WHERE sender_id = $1 AND created_at > now() - interval '1 minute'`, [student.id],
  );
  if (recent.n >= 20) return { error: "You're sending messages too quickly. Wait a minute and try again." };
  const rows = await query(
    `INSERT INTO messages (connection_id, sender_id, body)
     SELECT id, $2, $3 FROM connections WHERE id = $1 AND status = 'accepted' AND (from_user = $2 OR to_user = $2)
     RETURNING id`,
    [connectionId, student.id, body],
  );
  if (!rows.length) return { error: 'You can only message students you are connected with.' };
  revalidatePath(`/community/messages/${connectionId}`);
  return { sent: (prev.sent ?? 0) + 1 };
}

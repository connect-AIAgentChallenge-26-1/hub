import { supabase } from '../lib/supabaseClient.js'

// PATCH /api/letters/:token/confirm — 시간·장소 확정 저장
export async function confirmLetter(req, res) {
  const { confirmed_slot_id, confirmed_location_id, confirmed_datetime } = req.body

  if (!confirmed_slot_id || !confirmed_location_id) {
    return res.status(400).json({ data: null, error: '필수 항목이 비어있어요' })
  }

  const { data: letter, error: letterError } = await supabase
    .from('letters')
    .select('id')
    .eq('link_token', req.params.token)
    .single()

  if (letterError) return res.status(404).json({ data: null, error: '모임을 찾을 수 없어요' })

  const { data, error } = await supabase
    .from('letters')
    .update({
      confirmed_slot_id,
      confirmed_location_id,
      confirmed_datetime: confirmed_datetime || null,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', letter.id)
    .select()
    .single()

  if (error) return res.status(500).json({ data: null, error: error.message })

  res.json({ data, error: null })
}

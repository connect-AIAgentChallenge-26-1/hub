import { nanoid } from 'nanoid'
import { supabase } from '../lib/supabaseClient.js'

// POST /api/letters — 모임 생성 (호스트가 초대장 작성, 참가자 예정 명단 포함)
export async function createLetter(req, res) {
  const { title, host_name, topic, candidate_slots, candidate_locations, participant_names, responses_due_at } = req.body

  if (!title || !host_name || !candidate_slots?.length) {
    return res.status(400).json({ data: null, error: '필수 항목이 비어있어요' })
  }

  const link_token = nanoid(10)

  const { data: letter, error: letterError } = await supabase
    .from('letters')
    .insert({ title, host_name, topic, candidate_slots, candidate_locations, link_token, responses_due_at: responses_due_at || null })
    .select()
    .single()

  if (letterError) return res.status(500).json({ data: null, error: letterError.message })

  if (participant_names?.length) {
    const rows = participant_names.map((name) => ({ letter_id: letter.id, name }))
    const { error: participantError } = await supabase.from('participants').insert(rows)
    if (participantError) return res.status(500).json({ data: null, error: participantError.message })
  }

  res.status(201).json({ data: letter, error: null })
}

// GET /api/letters/:token — 공유 링크로 모임 조회
export async function getLetterByToken(req, res) {
  const { data, error } = await supabase
    .from('letters')
    .select('*')
    .eq('link_token', req.params.token)
    .single()

  if (error) return res.status(404).json({ data: null, error: '모임을 찾을 수 없어요' })
  res.json({ data, error: null })
}

// PATCH /api/letters/:token/close-responses — 참여자 응답 마감(전원 응답 판단 기준)
export async function closeResponses(req, res) {
  const { data: letter, error: letterError } = await supabase
    .from('letters')
    .select('id')
    .eq('link_token', req.params.token)
    .single()

  if (letterError) return res.status(404).json({ data: null, error: '모임을 찾을 수 없어요' })

  const { data, error } = await supabase
    .from('letters')
    .update({ responses_closed: true })
    .eq('id', letter.id)
    .select()
    .single()

  if (error) return res.status(500).json({ data: null, error: error.message })

  res.json({ data, error: null })
}

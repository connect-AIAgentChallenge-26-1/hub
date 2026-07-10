import { useMemo, useState } from 'react'
import './App.css'

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const defaultDetectedColors = ['#f7f7f2', '#8ea3b8', '#1d2430']

const detectedPalettes = [
  ['#f7f7f2', '#8ea3b8', '#1d2430'],
  ['#ffffff', '#d9564a', '#353d4a'],
  ['#e2ded4', '#7b8a78', '#252525'],
]

const initialLooks = {
  '2026-07-02': {
    title: '흰 셔츠와 데님',
    note: '비 오는 날이라 산뜻하지만 젖어도 부담 없는 조합을 골랐다.',
    tags: ['clean', 'rainy'],
    colors: ['#f8fafc', '#55708f', '#111827'],
    image:
      'linear-gradient(135deg, #f9fafb 0%, #f9fafb 35%, #9fb3c8 35%, #9fb3c8 65%, #242833 65%)',
  },
  '2026-07-05': {
    title: '블랙 니트 베스트',
    note: '오후 미팅이 있어서 단정함을 먼저 생각했다.',
    tags: ['meeting', 'minimal'],
    colors: ['#111827', '#f4f1ea', '#8c7a63'],
    image:
      'linear-gradient(150deg, #151515 0%, #151515 42%, #eee9dc 42%, #eee9dc 72%, #876f53 72%)',
  },
  '2026-07-08': {
    title: '민트 카디건',
    note: '기분 전환이 필요해서 평소보다 밝은 색을 입었다.',
    tags: ['fresh', 'soft'],
    colors: ['#9fd7c4', '#f7fbf7', '#27343a'],
    image:
      'linear-gradient(145deg, #a7dbc9 0%, #a7dbc9 48%, #fbfbf5 48%, #fbfbf5 74%, #27343a 74%)',
  },
  '2026-07-12': {
    title: '네이비 셋업',
    note: '길게 이동하는 날이라 구김이 적고 정리되어 보이는 룩.',
    tags: ['travel', 'smart'],
    colors: ['#17233f', '#ffffff', '#b7c0c7'],
    image:
      'linear-gradient(135deg, #17233f 0%, #17233f 54%, #ffffff 54%, #ffffff 76%, #b7c0c7 76%)',
  },
  '2026-07-16': {
    title: '레드 포인트',
    note: '반복되는 흰 티 조합에 작은 에너지를 넣고 싶었다.',
    tags: ['point', 'casual'],
    colors: ['#ffffff', '#d63f3f', '#2f3742'],
    image:
      'linear-gradient(160deg, #ffffff 0%, #ffffff 50%, #d63f3f 50%, #d63f3f 62%, #2f3742 62%)',
  },
  '2026-07-21': {
    title: '그레이 와이드 팬츠',
    note: '하루 종일 앉아 있어야 해서 편안한 실루엣을 선택했다.',
    tags: ['comfort', 'office'],
    colors: ['#d8d8d8', '#fafafa', '#202020'],
    image:
      'linear-gradient(140deg, #e0e0e0 0%, #e0e0e0 46%, #fafafa 46%, #fafafa 70%, #202020 70%)',
  },
}

function formatKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildCalendarDays(displayDate) {
  const year = displayDate.getFullYear()
  const month = displayDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const cells = []

  for (let i = 0; i < firstDay.getDay(); i += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    cells.push(new Date(year, month, day))
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

function App() {
  const [activeView, setActiveView] = useState('home')
  const [displayDate, setDisplayDate] = useState(new Date(2026, 6, 1))
  const [selectedDate, setSelectedDate] = useState(new Date(2026, 6, 8))
  const [looks, setLooks] = useState(initialLooks)
  const [isEditingLook, setIsEditingLook] = useState(false)
  const [draft, setDraft] = useState({
    title: '',
    note: '',
    preview: '',
    colors: defaultDetectedColors,
    isEditingColors: false,
  })

  const calendarDays = useMemo(() => buildCalendarDays(displayDate), [displayDate])
  const selectedKey = formatKey(selectedDate)
  const selectedLook = looks[selectedKey]
  const lookCount = Object.keys(looks).length
  const progress = Math.min(lookCount, 5)
  const reportUnlocked = lookCount >= 5

  function moveMonth(offset) {
    setDisplayDate(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1),
    )
  }

  function selectDay(date) {
    setSelectedDate(date)
    setIsEditingLook(false)
    setDraft({
      title: '',
      note: '',
      preview: '',
      colors: defaultDetectedColors,
      isEditingColors: false,
    })
  }

  function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const paletteIndex = file.name.length % detectedPalettes.length
    setDraft((current) => ({
      ...current,
      preview: URL.createObjectURL(file),
      colors: detectedPalettes[paletteIndex],
      isEditingColors: false,
    }))
  }

  function updateDraftColor(index, color) {
    setDraft((current) => ({
      ...current,
      colors: current.colors.map((currentColor, currentIndex) =>
        currentIndex === index ? color : currentColor,
      ),
    }))
  }

  function addDraftColor() {
    setDraft((current) => ({
      ...current,
      colors: [...current.colors, '#d9dee7'],
    }))
  }

  function removeDraftColor(index) {
    setDraft((current) => ({
      ...current,
      colors:
        current.colors.length > 1
          ? current.colors.filter((_, currentIndex) => currentIndex !== index)
          : current.colors,
    }))
  }

  function startEditingLook() {
    if (!selectedLook) return
    setIsEditingLook(true)
    setDraft({
      title: selectedLook.title,
      note: selectedLook.note,
      preview: selectedLook.image.startsWith('blob:') ? selectedLook.image : '',
      colors: selectedLook.colors,
      isEditingColors: false,
    })
  }

  function cancelEditingLook() {
    setIsEditingLook(false)
    setDraft({
      title: '',
      note: '',
      preview: '',
      colors: defaultDetectedColors,
      isEditingColors: false,
    })
  }

  function saveDraft(event) {
    event.preventDefault()
    const fallbackTitle = `${selectedDate.getMonth() + 1}.${selectedDate.getDate()} 데일리룩`
    const fallbackImage =
      selectedLook?.image ||
      'linear-gradient(145deg, #ffffff 0%, #ffffff 40%, #d9dee7 40%, #d9dee7 68%, #101828 68%)'

    setLooks((current) => ({
      ...current,
      [selectedKey]: {
        title: draft.title || fallbackTitle,
        note: draft.note || '오늘 이 룩을 선택한 이유를 짧게 남겨두었다.',
        colors: draft.colors,
        image: draft.preview || fallbackImage,
      },
    }))
    setIsEditingLook(false)
    setDraft({
      title: '',
      note: '',
      preview: '',
      colors: defaultDetectedColors,
      isEditingColors: false,
    })
  }

  return (
    <div className="page-shell">
      <nav className="app-menu" aria-label="fiTArchive menu">
        <button
          type="button"
          className={activeView === 'home' ? 'active' : ''}
          onClick={() => setActiveView('home')}
        >
          홈
        </button>
        <button
          type="button"
          className={activeView === 'report' ? 'active' : ''}
          onClick={() => setActiveView('report')}
        >
          FitCheck 리포트
        </button>
      </nav>

      {activeView === 'home' ? (
        <main className="app-shell">
          <section className="calendar-panel" aria-label="fiTArchive calendar">
            <header className="topbar">
              <div>
                <p className="eyebrow">fiTArchive</p>
                <h1>오늘의 룩과 간단한 메모를 남겨봐요.</h1>
              </div>
            </header>

            <div className="month-controls">
              <button
                type="button"
                className="icon-button"
                onClick={() => moveMonth(-1)}
                aria-label="Previous month"
              >
                ‹
              </button>
              <div>
                <h2>{monthNames[displayDate.getMonth()]}</h2>
                <span>{displayDate.getFullYear()}</span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => moveMonth(1)}
                aria-label="Next month"
              >
                ›
              </button>
            </div>

            <div className="weekday-grid">
              {weekDays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="calendar-grid">
              {calendarDays.map((date, index) => {
                const key = date ? formatKey(date) : `blank-${index}`
                const look = date ? looks[key] : null
                const isSelected = date && key === selectedKey

                return (
                  <div className="day-slot" key={key}>
                    <button
                      type="button"
                      className={`day-cell ${look ? 'has-look' : ''} ${
                        isSelected ? 'selected' : ''
                      }`}
                      onClick={() => date && selectDay(date)}
                      disabled={!date}
                      aria-label={
                        date ? `${key}${look ? ', look archived' : ''}` : 'empty day'
                      }
                    >
                      {date && (
                        <span>{date.getDate()}</span>
                      )}
                    </button>
                    {look && (
                      <div className="day-colors" aria-hidden="true">
                        {look.colors.map((color, colorIndex) => (
                          <i
                            key={`${key}-color-${colorIndex}`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <aside className="detail-panel">
            <div className="selected-date">
              <p>{selectedKey}</p>
              <h2>{selectedLook ? selectedLook.title : '새 룩 기록하기'}</h2>
            </div>

            {selectedLook && !isEditingLook ? (
              <LookCard look={selectedLook} onEdit={startEditingLook} />
            ) : (
              <form className="entry-form" onSubmit={saveDraft}>
                <label className="upload-box">
                  <input type="file" accept="image/*" onChange={handleFile} />
                  {draft.preview ? (
                    <img src={draft.preview} alt="Uploaded outfit preview" />
                  ) : (
                    <span>사진 추가</span>
                  )}
                </label>
                <input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="look name"
                />
                <textarea
                  value={draft.note}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, note: event.target.value }))
                  }
                  placeholder="memo"
                  rows="4"
                />
                <ColorReview
                  colors={draft.colors}
                  isEditing={draft.isEditingColors}
                  onEdit={() =>
                    setDraft((current) => ({
                      ...current,
                      isEditingColors: !current.isEditingColors,
                    }))
                  }
                  onChange={updateDraftColor}
                  onAdd={addDraftColor}
                  onRemove={removeDraftColor}
                />
                <div className="form-actions">
                  {isEditingLook && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={cancelEditingLook}
                    >
                      취소
                    </button>
                  )}
                  <button type="submit" className="primary-button">
                    {isEditingLook ? '수정 저장' : '기록 추가'}
                  </button>
                </div>
              </form>
            )}

            <FitCheckSummary
              progress={progress}
              reportUnlocked={reportUnlocked}
              compact
            />
          </aside>
        </main>
      ) : (
        <FitCheckReport
          looks={looks}
          progress={progress}
          reportUnlocked={reportUnlocked}
        />
      )}
    </div>
  )
}

function FitCheckSummary({ progress, reportUnlocked, compact = false }) {
  return (
    <section className={`fitcheck-card ${reportUnlocked ? 'unlocked' : ''}`}>
      <div>
        <p className="eyebrow">FitCheck Report</p>
        <h3>
          {reportUnlocked
            ? compact
              ? '내 스타일 패턴이 보이기 시작했어요'
              : 'AI가 오늘까지의 스타일 로그를 분석했어요'
            : '5개 기록 후 리포트가 열려요'}
        </h3>
      </div>
      <div className="progress-row">
        {Array.from({ length: 5 }).map((_, index) => (
          <span key={index} className={index < progress ? 'filled' : ''} />
        ))}
      </div>
      {reportUnlocked && compact && (
        <dl className="report-list">
          <div>
            <dt>자주 고른 색</dt>
            <dd>화이트, 네이비, 그레이</dd>
          </div>
          <div>
            <dt>선택 이유</dt>
            <dd>단정함과 편안함 중심</dd>
          </div>
        </dl>
      )}
    </section>
  )
}

function FitCheckReport({ looks, progress, reportUnlocked }) {
  const lookEntries = Object.entries(looks)

  return (
    <main className="report-view">
      <section className="report-hero">
        <p className="eyebrow">FitCheck Report</p>
        <h1>AI 스타일 분석 리포트</h1>
        <p>
          기록된 룩의 분위기와 메모를 바탕으로 나다운 스타일 패턴을 분석해주는
          화면입니다.
        </p>
      </section>

      <FitCheckSummary progress={progress} reportUnlocked={reportUnlocked} />

      <section className="analysis-grid" aria-label="Style analysis">
        <article className="analysis-card">
          <span>01</span>
          <h2>컬러 무드</h2>
          <p>화이트 베이스에 네이비, 그레이, 민트 같은 차분한 포인트가 반복돼요.</p>
        </article>
        <article className="analysis-card">
          <span>02</span>
          <h2>선택 이유</h2>
          <p>단정함, 편안함, 기분 전환이 룩을 고르는 주요 기준으로 보여요.</p>
        </article>
        <article className="analysis-card">
          <span>03</span>
          <h2>추가기능 슬롯</h2>
          <p>AI 추천 코디, 다음 구매 후보, 자주 입는 아이템 분석을 여기에 붙일 수 있어요.</p>
        </article>
      </section>

      <section className="report-timeline">
        <div>
          <p className="eyebrow">Archived looks</p>
          <h2>분석에 사용된 스타일 로그</h2>
        </div>
        <div className="timeline-list">
          {lookEntries.map(([date, look]) => (
            <article key={date}>
              <div className="timeline-dot" />
              <div>
                <p>{date}</p>
                <h3>{look.title}</h3>
                <span>{look.note}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

function LookCard({ look, onEdit }) {
  const imageStyle = look.image.startsWith('blob:')
    ? { backgroundImage: `url(${look.image})` }
    : { background: look.image }

  return (
    <article className="look-card">
      <div className="look-image" style={imageStyle} />
      <p>{look.note}</p>
      <div className="look-meta-row">
        <div className="swatches" aria-label="AI detected outfit colors">
          {look.colors.map((color, colorIndex) => (
            <span key={`${color}-${colorIndex}`} style={{ backgroundColor: color }} />
          ))}
        </div>
        <button type="button" onClick={onEdit}>
          수정
        </button>
      </div>
    </article>
  )
}

function ColorReview({ colors, isEditing, onEdit, onChange, onAdd, onRemove }) {
  return (
    <section className="color-review" aria-label="AI detected colors">
      <div className="color-review-header">
        <div>
          <span>AI color</span>
          <p>사진에서 자동 감지된 색상</p>
        </div>
        <button type="button" onClick={onEdit}>
          {isEditing ? '완료' : '수정'}
        </button>
      </div>
      <div className="editable-swatches">
        {colors.map((color, index) => (
          <div className="editable-swatch" key={`ai-color-${index}`}>
            <label>
              <span style={{ backgroundColor: color }} />
              {isEditing && (
                <input
                  type="color"
                  value={color}
                  onChange={(event) => onChange(index, event.target.value)}
                  aria-label={`Edit AI color ${index + 1}`}
                />
              )}
            </label>
            {isEditing && colors.length > 1 && (
              <button
                type="button"
                className="remove-color"
                onClick={() => onRemove(index)}
                aria-label={`Remove AI color ${index + 1}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {isEditing && (
          <button type="button" className="add-color" onClick={onAdd}>
            +
          </button>
        )}
      </div>
    </section>
  )
}

export default App

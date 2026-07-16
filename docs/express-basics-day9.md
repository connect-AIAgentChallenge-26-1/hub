# Day 9 Express 핵심 학습 — 내 서버 코드 리뷰

발표 준비하면서 `server/index.js`와 `server/routes/checkins.js`를 처음으로 한 줄씩 읽었다.
"Express로 API를 만든다"가 무슨 뜻인지 이날 처음 이해했다.

## 1. 서버란 — `app.listen(3001)`

서버를 만든다 = **특정 포트에서 계속 대기하며 요청을 기다리는 프로그램**을 띄우는 것.

- 포트 = 호수. IP가 건물 주소라면 포트는 몇 호인지. 한 컴퓨터에서 여러 프로그램이 네트워크를 쓰니까 문을 나눠 갖는다.
- 5173호는 Vite(화면), 3001호는 Express(서버). 5173은 Vite 기본값이고 3001은 코드에서 정한 값.
- 지금은 localhost(= 내 컴퓨터 자신)라 남들은 못 들어온다. 남들이 쓰려면 배포가 필요하다. DB(Supabase)만 이미 클라우드에 있다.

## 2. 서버 프로그램이 하는 일 세 가지 (index.js)

1. **주소 보고 담당 함수로 연결** — `/api/checkins`로 시작하면 체크인 라우터로 배달.
2. **들어온 데이터 풀어주기** — 요청 본문은 원래 글자 덩어리인데, `express.json()` 한 줄이 자동으로 객체로 바꿔줘서 `req.body.rawText`로 바로 꺼낸다.
3. **에러 한 곳에 모으기** — 어디서 에러가 나든 마지막 처리기로 모여 항상 `{ error: { message } }` 형식으로 응답. 화면은 실패 모양이 늘 같아서 편하다.

## 3. API 하나 = `router.post('주소', 함수)` 한 덩어리

```js
router.post('/', async (req, res) => {
  const rawText = getRawText(req.body)   // ① 검사 (빈 입력 → 400)
  const checkin = await createCheckin({ ...req.body, rawText })  // ② 처리
  res.status(201).json(checkin)          // ③ 응답 (201 = "새로 만들었다")
})
```

- API를 만든다 = **주소와 함수를 짝지어 등록**하는 것. 이 프로젝트에 4개(조회 / AI 정리 미리보기 / 저장 / 서버 확인).
- `req` = 들어온 요청, `res` = 돌려줄 응답. 순서는 항상 검사 → 처리 → 응답.
- Kotlin의 `setOnClickListener { }`와 같은 구조 — "이 이벤트가 오면 이 코드 실행해라"는 등록.

## 4. GET vs POST — 엽서와 소포

같은 주소 `/api/checkins`가 두 번 등록돼 있다. **주소가 같아도 방식이 다르면 다른 API**다.

- **GET = 엽서**. "달라"고만 한다. 내용물 없음.
- **POST = 소포**. `body`라는 상자에 데이터를 실어 보낸다. `JSON.stringify`는 상자에 넣기 좋게 데이터를 글자로 바꾸는 함수.

## 5. 세 파일 릴레이

화면은 요청만, 라우터(접수창구)는 확인과 전달만, 서비스(실무자)는 DB 작업만 한다.
저장 버튼 하나 = App.jsx → routes/checkins.js → checkinService.js 순서로 릴레이.

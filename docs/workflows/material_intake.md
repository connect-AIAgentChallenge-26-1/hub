# Material Intake Workflow

## Purpose

세계관, 시나리오, 메모 등의 원본 자료를 확정 설계와 분리해 등록한다.

## Supported Inputs

- Codex 대화에 입력된 텍스트
- Markdown 파일
- TXT 파일

## Steps

1. 입력 형식과 내용을 확인하고 source index에서 같은 경로·제목 후보를 검색한다.
2. ID는 `SRC-YYYYMMDD-NNN` 형식으로 같은 날짜의 다음 번호를 사용한다.
3. 대화 입력은 내용을 바꾸지 않고 `workspace/materials/inbox/<source-id>-<slug>.md`에 저장한다.
4. 이미 inbox에 있는 Markdown·TXT는 그 파일을 직접 등록한다.
5. 다른 위치의 Markdown·TXT는 inbox에 복사본을 만들고 원래 파일은 수정하지 않는다.
6. `git hash-object <inbox-path>`로 등록 복사본 hash를 계산한다.
7. 같은 hash가 이미 등록됐다면 방금 만든 inbox 복사본만 제거하고 기존 source ID를 반환한다.
8. authority는 기본 `reference`로 두며 사용자가 지정한 경우만 `authoritative`로 쓴다.
9. `docs/templates/source_index_entry.md` 형식으로 source index 항목을 추가한다.
10. 상태는 `active`, 후보 문서는 아직 분석하지 않았으면 `unselected`로 둔다.

## Output

- source ID
- inbox 경로와 hash
- authority
- 지원 형식 확인 결과

## Safety Rules

- 자료 등록만으로 기획서 초안이나 Approval Queue 항목을 만들지 않는다.
- 저장소 밖의 원본 파일은 읽거나 복사할 수 있지만 수정·삭제하지 않는다.
- 자료 내용을 요약해 저장하지 않고 원본 복사본을 보존한다.
- PDF, DOCX 등 지원하지 않는 형식은 Markdown 또는 TXT 변환을 요청한다.

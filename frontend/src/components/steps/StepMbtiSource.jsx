// Step 1: 공식 MBTI 결과 사용 여부 + 유형 입력. 저결합 화면 컴포넌트.
import { MBTI_TYPES } from "../../data/questions";
import { OptionCard } from "../ui";

export function StepMbtiSource({ mbti, setMbti, mbtiSource, setMbtiSource, onContinueWithout, onUseAiChat, onHome, onNext }) {
  return (
    <section className="panel">
      <p className="eyebrow">Step 1</p>
      <h2>공식 MBTI 결과 사용 여부</h2>
      <p>이 앱은 공식 문항을 제공하거나 재현하지 않습니다. 공식 MBTI 평가에서 이미 받은 결과가 있다면 직접 입력하고, 없다면 공부습관 자체 점검만으로 진행합니다.</p>
      <div className="source-grid">
        <OptionCard
          active={mbtiSource === "official-self-report"}
          onClick={() => setMbtiSource("official-self-report")}
        >
          공식 MBTI 결과를 입력할게요
        </OptionCard>
        <OptionCard active={mbtiSource === "not-provided"} onClick={onContinueWithout}>
          공식 결과 없이 진행할게요
        </OptionCard>
        <OptionCard active={mbtiSource === "ai-estimated"} onClick={onUseAiChat}>
          잘 모르겠어요 — AI와 짧게 대화해 추정
        </OptionCard>
      </div>
      {mbtiSource === "official-self-report" && (
        <>
          <p className="hint">아래 값은 사용자가 보유한 공식 결과를 기록하는 입력이며, 이 앱이 새로 판정한 결과가 아닙니다.</p>
          <div className="grid" style={{ marginTop: 16 }}>
            {MBTI_TYPES.map((type) => (
              <OptionCard active={mbti === type} key={type} onClick={() => setMbti(type)}>
                {type}
              </OptionCard>
            ))}
          </div>
        </>
      )}
      <div className="actions">
        <button className="secondary" onClick={onHome} type="button">
          처음 화면
        </button>
        <button
          className="primary"
          disabled={mbtiSource !== "official-self-report" || !mbti}
          onClick={onNext}
          type="button"
        >
          공부 설문으로 이동
        </button>
      </div>
    </section>
  );
}

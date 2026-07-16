const SCORE_OPTIONS = [1, 2, 3, 4, 5];

function ScoreSelector({ label, value, onChange, minLabel, maxLabel }) {
  return (
    <div className="form-group">
      <span className="form-label">{label}</span>

      <div className="score-selector" role="group" aria-label={label}>
        {SCORE_OPTIONS.map((score) => (
          <button
            key={score}
            type="button"
            className={`score-option${value === score ? " is-selected" : ""}`}
            aria-pressed={value === score}
            onClick={() => onChange(score)}
          >
            {score}
          </button>
        ))}
      </div>

      {(minLabel || maxLabel) && (
        <div className="score-scale">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

export default ScoreSelector;

import { WEIGHT_PRESETS } from "../utils/priorityCalculator";

function WeightSelector({ value, onChange }) {
  return (
    <div className="weight-selector">
      <span className="weight-label">우선순위 성향</span>
      <div className="weight-options" role="group" aria-label="우선순위 성향">
        {Object.values(WEIGHT_PRESETS).map((preset) => (
          <button
            key={preset.key}
            type="button"
            className={`weight-option${value === preset.key ? " is-selected" : ""}`}
            aria-pressed={value === preset.key}
            onClick={() => onChange(preset.key)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default WeightSelector;

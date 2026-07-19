import { useState } from 'react'

const copyStates = {
  idle: 'idle',
  success: 'success',
  failure: 'failure',
}

export default function SubscriptionIcsStatusCard({
  copy,
  feed,
  state,
  onProvision,
}) {
  const [copyState, setCopyState] = useState(copyStates.idle)
  const clipboardAvailable =
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.writeText === 'function'
  const isProvisioning = state === 'provisioning'
  const isReady = state === 'ready' && feed
  const isUnavailable = state === 'unavailable'

  function handleProvision() {
    setCopyState(copyStates.idle)
    onProvision()
  }

  async function handleCopySubscriptionUrl() {
    if (!clipboardAvailable || !feed?.subscriptionUrl) {
      setCopyState(copyStates.failure)
      return
    }

    try {
      await navigator.clipboard.writeText(feed.subscriptionUrl)
      setCopyState(copyStates.success)
    } catch {
      setCopyState(copyStates.failure)
    }
  }

  return (
    <section className="calendar-card subscription-card">
      <div className="calendar-card-inner">
        <div className="subscription-card-header">
          <h2>{copy.title}</h2>
          <span
            className={`subscription-state-badge ${state}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {copy.badges[state]}
          </span>
        </div>
        <p className="calendar-card-description">{copy.description}</p>

        {isReady ? (
          <div className="subscription-ready-panel">
            <dl className="subscription-feed-details">
              <div>
                <dt>{copy.details.calendarName}</dt>
                <dd>{feed.calendarName}</dd>
              </div>
              <div>
                <dt>{copy.details.eventCount}</dt>
                <dd>{copy.eventCount(feed.eventCount)}</dd>
              </div>
              <div>
                <dt>{copy.details.tokenPrefix}</dt>
                <dd>
                  <code>{feed.tokenPrefix}</code>
                </dd>
              </div>
              <div className="subscription-detail-wide">
                <dt>{copy.details.subscriptionUrl}</dt>
                <dd>
                  <code className="capability-value">{feed.subscriptionUrl}</code>
                </dd>
              </div>
              <div className="subscription-detail-wide">
                <dt>{copy.details.subscriptionPath}</dt>
                <dd>
                  <code className="capability-value">{feed.subscriptionPath}</code>
                </dd>
              </div>
            </dl>

            <div className="subscription-action-row">
              <button
                className="primary-button"
                type="button"
                onClick={handleCopySubscriptionUrl}
                disabled={!clipboardAvailable}
              >
                {clipboardAvailable ? copy.copyButton : copy.copyUnavailable}
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={handleProvision}
              >
                {copy.createNewButton}
              </button>
              {copyState === copyStates.success ? (
                <p className="subscription-copy-status success" role="status">
                  {copy.copySuccess}
                </p>
              ) : null}
              {copyState === copyStates.failure ? (
                <p className="subscription-copy-status failure" role="alert">
                  {copy.copyFailure}
                </p>
              ) : null}
            </div>

            {feed.expiresOnServerRestart ? (
              <p className="subscription-warning" role="note">
                <strong>{copy.expirationWarningTitle}</strong>{' '}
                {copy.expirationWarning}
              </p>
            ) : null}
            <p className="subscription-scope-note" role="note">
              <strong>{copy.referenceScopeTitle}</strong> {copy.referenceScope}
            </p>
          </div>
        ) : (
          <div className="subscription-provision-panel">
            {isUnavailable ? (
              <p className="subscription-unavailable" role="alert">
                <strong>{copy.unavailableTitle}</strong> {copy.unavailableBody}
              </p>
            ) : (
              <p>{copy.idleBody}</p>
            )}
            <button
              className="primary-button"
              type="button"
              onClick={handleProvision}
              disabled={isProvisioning}
              aria-busy={isProvisioning}
            >
              {isProvisioning
                ? copy.provisioningButton
                : isUnavailable
                  ? copy.retryButton
                  : copy.provisionButton}
            </button>
            {isProvisioning ? (
              <p className="subscription-progress" role="status" aria-live="polite">
                {copy.provisioningStatus}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}

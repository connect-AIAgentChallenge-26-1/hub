import { useState } from 'react'
import CampusPreferenceCard from './CampusPreferenceCard.jsx'
import SubscriptionIcsStatusCard from './SubscriptionIcsStatusCard.jsx'
import { provisionReferenceSubscriptionFeed } from '../utils/subscriptionFeedApi.js'

const subscriptionStates = {
  idle: 'idle',
  provisioning: 'provisioning',
  ready: 'ready',
  unavailable: 'unavailable',
}

function toAbsoluteSubscriptionUrl(subscriptionPath) {
  return new URL(subscriptionPath, window.location.origin).href
}

export default function NoticeCalendarPage({
  copy,
  preferences,
  onSelectedCampusesChange,
}) {
  const [subscriptionState, setSubscriptionState] = useState(
    subscriptionStates.idle,
  )
  const [subscriptionFeed, setSubscriptionFeed] = useState(null)

  async function handleProvisionReferenceFeed() {
    setSubscriptionState(subscriptionStates.provisioning)
    setSubscriptionFeed(null)

    try {
      const feed = await provisionReferenceSubscriptionFeed()
      setSubscriptionFeed({
        ...feed,
        subscriptionUrl: toAbsoluteSubscriptionUrl(feed.subscriptionPath),
      })
      setSubscriptionState(subscriptionStates.ready)
    } catch {
      setSubscriptionState(subscriptionStates.unavailable)
    }
  }

  return (
    <div className="notice-calendar-page">
      <CampusPreferenceCard
        copy={copy.campusPreference}
        preferences={preferences}
        onSelectedCampusesChange={onSelectedCampusesChange}
      />
      <SubscriptionIcsStatusCard
        copy={copy.subscriptionIcs}
        feed={subscriptionFeed}
        state={subscriptionState}
        onProvision={handleProvisionReferenceFeed}
      />
    </div>
  )
}

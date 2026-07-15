import '@testing-library/jest-dom/vitest'

import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// vite.config.js sets test.globals=false, so @testing-library/react's
// automatic afterEach(cleanup) registration (which relies on a global test
// hook) never fires — without this, each test's render() output stays in
// the DOM and accumulates across tests within the same file, causing
// getByRole to match stale elements from earlier tests.
afterEach(cleanup)

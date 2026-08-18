import { expect, test } from '@playwright/test'

import { decidePushFailure } from './delivery-retry'

test('retries transient push failures with backoff up to five attempts', () => {
  expect(decidePushFailure(429, 1)).toEqual({
    status: 'retry',
    deactivateSubscription: false,
    retryAfterSeconds: 60,
  })
  expect(decidePushFailure(503, 4).retryAfterSeconds).toBe(900)
  expect(decidePushFailure(503, 5).status).toBe('dead')
})

test('deactivates expired push endpoints without retrying', () => {
  for (const statusCode of [404, 410]) {
    expect(decidePushFailure(statusCode, 1)).toEqual({
      status: 'dead',
      deactivateSubscription: true,
      retryAfterSeconds: null,
    })
  }
})

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TestRig } from './test-helper.js';

describe('telemetry', () => {
  it('should emit a metric and a log event', async () => {
    const rig = new TestRig();
    rig.setup('should emit a metric and a log event');

    // Run a simple command that should trigger telemetry
    await rig.run('just saying hi');

    // Verify that an expected event was logged
    const hasUserPromptEvent = await rig.waitForTelemetryEvent(
      'gemini_cli.user_prompt',
    );
    expect(hasUserPromptEvent).toBe(true);

    // Verify an expected semantic compliant event was logged
    const hasApiResponseEvent = await rig.waitForTelemetryEvent(
      'gen_ai.client.inference.operation.details',
    );
    expect(hasApiResponseEvent).toBe(true);

    // Verify that an expected metric was emitted
    const cliCommandCountMetric = rig.readMetric('session.count');
    expect(cliCommandCountMetric).not.toBeNull();
  });
});
